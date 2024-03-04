import {SSTConfig} from "sst";
import {Config, Function} from "sst/constructs";
import {
    Effect,
    OpenIdConnectProvider,
    PolicyDocument,
    PolicyStatement,
    Role,
    WebIdentityPrincipal
} from "aws-cdk-lib/aws-iam";
import {DefaultStackSynthesizer} from "aws-cdk-lib";

export default {
    config(_input) {
        return {
            name: "ga-test-aws-deployment",
            region: "us-east-1",
        };
    },
    stacks(app) {
        app.stack(({stack, app}) => {
            // AWS only allows 1 OIDC provider with a given provider URL — URLs must be unique.
            // This means that Github OIDC must be set up manually on the account.
            // In that case:
            // 1. Go to AWS IAM > Identity provider
            // 2. Add an OpenID Connect provider
            // 3. Set url to https://token.actions.githubusercontent.com
            // 4. Set audience to `sts.amazonaws.com`
            const githubOIDCProvider = `arn:aws:iam::${app.account}:oidc-provider/token.actions.githubusercontent.com`;
            const oidc = OpenIdConnectProvider.fromOpenIdConnectProviderArn(stack, "oidc", githubOIDCProvider);

            // Define a role allowing the OIDC access to specific github users
            const bootstrapQualifier = stack.synthesizer.bootstrapQualifier ?? DefaultStackSynthesizer.DEFAULT_QUALIFIER;
            const githubAccessRole = new Role(stack, "github-action-access", {
                assumedBy: new WebIdentityPrincipal(oidc.openIdConnectProviderIssuer, {
                    "StringEquals": {
                        'token.actions.githubusercontent.com:sub': ['repo:rangle/cmap-availability:ref:refs/heads/main'],
                        'token.actions.githubusercontent.com:actor': ['smoogly']
                    },
                }),

                inlinePolicies: {
                    'cdk': new PolicyDocument({
                        statements: [
                            new PolicyStatement({
                                effect: Effect.ALLOW,
                                actions: [
                                    "sts:AssumeRoleWithWebIdentity"
                                ],
                                resources: [
                                    // Policy allowing a OIDC token holder to assume
                                    // the CDK role used for deployment
                                    `arn:aws:iam::${app.account}:role/cdk-${bootstrapQualifier}-cfn-exec-role-*`,
                                ]
                            })
                        ]
                    }),
                }
            });

            stack.addOutputs({
                githubAccessRoleArn: githubAccessRole.roleArn, // TODO: how to use this for deployment?
            });

            // Mock deployment
            new Function(stack, "mock-deployment", {
                handler: "mockdeploy/mockfn.handler",
                bind: [
                    new Config.Parameter(stack, "VAL", {
                        value: process.env.MOCK_VALUE ?? "UNKNOWN",
                    }),
                ],
                disableCloudWatchLogs: true,
                timeout: "1 second",
                memorySize: "128 MB"
            });
        });
    }
} satisfies SSTConfig;
