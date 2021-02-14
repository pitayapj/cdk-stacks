import * as cdk from '@aws-cdk/core';
import * as wafv2 from '@aws-cdk/aws-wafv2';

export class WafStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    //Create rule
    const webACL = new wafv2.CfnWebACL(this, `${this.stackName}-WebACL`,{
      defaultAction: { allow: {} },
      scope: "REGIONAL",
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `${this.stackName}-WebACL`,
        sampledRequestsEnabled: true,
      },
      rules: [
        //Rule list
        {
          priority: 1,
          overrideAction: { none:{} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: "AWS-AWSManagedRulesCommonRuleSet"
          },
          name: "AWS-AWSManagedRulesCommonRuleSet",
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesCommonRuleSet"
            }
          }
        }
      ],
      name: "MyWebACL",
    });

    //Associate the rule (APIGateway, ALB, Appsync)
    // const webACL_associate = new wafv2.CfnWebACLAssociation(this, `${this.stackName}-WebACL`,{
    //   resourceArn: "<you need your resource ARN here>",
    //   webAclArn: webACL.attrArn
    // });
  }
}
