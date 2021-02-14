import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as rds from '@aws-cdk/aws-rds';
import * as sm from '@aws-cdk/aws-secretsmanager';
import * as s3 from '@aws-cdk/aws-s3';
import * as autoscaling from '@aws-cdk/aws-autoscaling';
import * as iam from '@aws-cdk/aws-iam';
import * as lbv2 from '@aws-cdk/aws-elasticloadbalancingv2';

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
     * Bastion Security Group
     * You need to connect to bastion via Session Manager
     */

    const bastion_server = new ec2.BastionHostLinux(this,`${this.stackName}-BastionInstance`, {
      vpc: vpc,
      instanceName: "Bastion Host",
      subnetSelection: { subnetType: ec2.SubnetType.PUBLIC }
    });
    /**
     * App Security Group
     * 
     */
    const app_sgs = new ec2.SecurityGroup(this, `${this.stackName}-AppSecurityGroups`,{
      vpc: vpc,
      description: 'Allow serving from instance',
      securityGroupName: 'Allow serving',
    });

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
    db_sgs.addIngressRule(app_sgs, ec2.Port.tcp(3306),'Database connection allow');

    /**
     * Retriving Secret
     * Use for RDS setup and Application call
     * !!!You need to create a secret before hand in Secret Manager!!!
     * For example, let call we created rds credential name: root
     * Check secret's ARN in aws console and put it in the below code
     */
    const secret_complete_arn = 'arn:aws:secretsmanager:ap-northeast-1:123456:secret:sample';
    const db_credential = sm.Secret.fromSecretPartialArn(this, 'SecretFromPartialArn', secret_complete_arn);

    /**
     * Define Aurora(Mysql Engine) database cluster
     * Multiple AZs enabled and 1 Read Replica create by default
     */
    const db_cluster = new rds.DatabaseCluster(this, `${this.stackName}-dbCluster`, {
      engine: rds.DatabaseClusterEngine.AURORA_MYSQL,
      instanceProps: {
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.SMALL),
        vpc: vpc,
        securityGroups: [ec2.SecurityGroup.fromSecurityGroupId(this, 'SG', `${this.stackName}-DbSecurityGroups`, {mutable:false})],
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
     * S3 Bucket for saving file for instances
     */
    const file_bucket = new s3.Bucket(this, `${this.stackName}-FileBucket`, {});
    const s3_gateway = new ec2.GatewayVpcEndpoint(this, `${this.stackName}-S3Gateway`, {
      service: new ec2.GatewayVpcEndpointAwsService("S3"),
      vpc: vpc,
      subnets:[{
        onePerAz: true,
        subnetType: ec2.SubnetType.PRIVATE
      }]
    })
    /**
     * Define backend instances
     * Auto scaling
     */
    
    const user_data = ec2.UserData.forLinux(
      {shebang: "#!/bin/bash"}
    );
    user_data.addCommands("sudo yum install -y httpd");
    user_data.addCommands("sudo service httpd start");
    user_data.addCommands("curl https://s3.dualstack.ap-northeast-1.amazonaws.com/aws-xray-assets.ap-northeast-1/xray-daemon/aws-xray-daemon-3.x.rpm -o /home/ec2-user/xray.rpm");
    user_data.addCommands("yum install -y /home/ec2-user/xray.rpm");

    //Role for App Instances
    const policy_document = {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Sid": "S3AccessStatement",
          "Effect": "Allow",
          "Action": [
            "s3:ListBucket",
            "s3:GetObject",
            "s3:PutObject",
            "s3:DeleteObject"
          ],
          "Resource": [
            file_bucket.bucketArn,
            file_bucket.bucketArn + "/*"
          ],
        },
      ]
    };
    const inline_policy_document = iam.PolicyDocument.fromJson(policy_document);

    const instance_role = new iam.Role(this,'AppInstanceRole',
    {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      inlinePolicies: { "ec2-s3-access": inline_policy_document },
    });

    //Define ASG
    const auto_scaling_group = new autoscaling.AutoScalingGroup(this, `${this.stackName}-AutoScalingGroups`,{
      vpc: vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux(),
      autoScalingGroupName: 'Auto Scale for Application instances',
      minCapacity: 2,
      maxCapacity: 6,
      securityGroup: app_sgs,
      userData: user_data,
      role: instance_role,
      cooldown: cdk.Duration.minutes(10),
      groupMetrics: [ autoscaling.GroupMetrics.all() ],
    });

    auto_scaling_group.scaleOnCpuUtilization('Scale based on CPU', {
      targetUtilizationPercent: 95,
    });
    
    /**
     * Define Application loadbalancer
     */
    const target_group = new lbv2.ApplicationTargetGroup(this, `${this.stackName}-TargetGroup`, {
      targets: [auto_scaling_group],
      vpc: vpc,
      port: 80,
      stickinessCookieDuration: cdk.Duration.minutes(5),
      targetGroupName: "Target to Application intances",
    });

    const load_balancer = new lbv2.ApplicationLoadBalancer(this, `${this.stackName}-AppLoadBalancer`, {
      vpc: vpc,
      internetFacing: true,
      loadBalancerName: `${this.stackName}-AppLoadBalancer`,
    });

    const listener = load_balancer.addListener('Listener', {
      //only port 80 because no SSL certificate yet
      port: 80
    });
    listener.addTargetGroups(`${this.stackName}-TargetGroup`, { 
      targetGroups: [target_group]
    });

    /**
     * Logging
     */
    //Report on Scale up instances
    const target_metric = load_balancer.metric("HealthyHostCount", {
      color: "#FF0000",
      dimensions: { "TargetGroup": "target-group" },
      period: cdk.Duration.minutes(1),
    });
    target_metric.createAlarm(this, `${this.stackName}-UnhealthyTargetAlarm`,{
      threshold: 1,
      evaluationPeriods: 60,
      datapointsToAlarm: 1
    })
    //TODO: Cleaning code
  }
}
