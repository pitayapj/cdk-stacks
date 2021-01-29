import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as rds from '@aws-cdk/aws-rds';
import * as sm from '@aws-cdk/aws-secretsmanager';
import { SecurityGroup } from '@aws-cdk/aws-ec2';
import * as s3 from '@aws-cdk/aws-s3';
import * as autoscaling from '@aws-cdk/aws-autoscaling';
import { Duration } from '@aws-cdk/core';

export class BasicServerCdkStack extends cdk.Stack {
  /**
  Choose availability zone at wishes, default 2 random AZs
  If you want 3, define here  
  */
  // get availabilityZones(): string[]{
  //   return ['ap-northeast-1a', 'ap-northeast-1c'];
  // }
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * Create a VPC with 1 public, 1 private(NAT) and 1 isolate subnet each AZ
     */
    const vpc = new ec2.Vpc(this, `${this.stackName}-vpc`, {
      cidr: "10.0.0.0/16",
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'load balancer',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'application',
          subnetType: ec2.SubnetType.PRIVATE,
        },
        {
          cidrMask: 24,
          name: 'rds',
          subnetType: ec2.SubnetType.ISOLATED,
        },
      ],
    });
    /**
     * App Security Group
     * HTTP/HTTPS Traffics allowed
     * Port 80, 443
     */
    const app_sgs = new ec2.SecurityGroup(this, `${this.stackName}-AppSecurityGroups`,{
      vpc: vpc,
      description: 'Allow serving from instance',
      securityGroupName: 'Allow serving',
    });
    //Allow Serving (port 80, 443)
    app_sgs.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80),'HTTP allow');
    app_sgs.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443),'HTTPS allow');
    //Allow SSH (22) should be from certain IP
    //app_sgs.addIngressRule(ec2.Peer.ipv4('10.0.0.1/24'), ec2.Port.tcp(22),'SSH allow from IP');
    //app_sgs.addIngressRule(ec2.Peer.anyIpv4, ec2.Port.tcp(22),'SSH allow');

    /**
     * Security Group
     * Database connection traffics allowed associate with database layer
     * Port 3306
     */
    const db_sgs = new ec2.SecurityGroup(this, `${this.stackName}-DbSecurityGroups`,{
      vpc: vpc,
      description: 'Allow database connection',
      securityGroupName: 'Allow database connection',
    });
    db_sgs.addIngressRule(app_sgs,ec2.Port.tcp(3306),'Database connection allow');

    /**
     * Retriving Secret
     * Use for RDS setup and Application call
     * !!!You need to create a secret before hand in Secret Manager!!!
     * For example, let call we created rds credential name: root
     * Check secret's ARN in aws console and put it in the below code
     */
    const secretCompleteArn = 'arn:aws:secretsmanager:ap-northeast-1:123456:secret:sample';
    const db_credential = sm.Secret.fromSecretPartialArn(this, 'SecretFromPartialArn', secretCompleteArn);

    /**
     * Define Aurora(Mysql Engine) database cluster
     * Multiple AZs enabled and 1 Read Replica create by default
     */
    const db_cluster = new rds.DatabaseCluster(this, 'dbCluster', {
      engine: rds.DatabaseClusterEngine.AURORA_MYSQL,
      instanceProps: {
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.SMALL),
        vpc: vpc,
        securityGroups: [SecurityGroup.fromSecurityGroupId(this, 'SG', `${this.stackName}-DbSecurityGroups`, {mutable:false})],
        vpcSubnets: {
          subnetType: ec2.SubnetType.ISOLATED,
        },
        
      },
      credentials: rds.Credentials.fromSecret(db_credential),
      // Additional Database parameters
      parameterGroup: new rds.ParameterGroup(this, 'databaseParameters', {
        engine: rds.DatabaseInstanceEngine.mysql({
          version: rds.MysqlEngineVersion.VER_5_7_31,
        }),
        parameters: {
          character_set_client: 'utf8mb4',
          character_set_server: 'utf8mb4',
          collation_server: 'utf8_general_ci'
        },
      }),
    });

    /**
     * Define backend instances
     * Auto scaling
     * Application Load Balancer
     */
    const auto_scaling_group = new autoscaling.AutoScalingGroup(this, `${this.stackName}-AutoScalingGroups`,{
      vpc: vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: new ec2.AmazonLinuxImage(),
      autoScalingGroupName: 'Auto Scale for Application instances',
      minCapacity: 2,
      
    });
    
  }
}
