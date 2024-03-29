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
            const branch = 'main';
            const repoName = 'smoogly/github-actions-aws-oidc';
            const bootstrapQualifier = stack.synthesizer.bootstrapQualifier ?? DefaultStackSynthesizer.DEFAULT_QUALIFIER;
            const users = [`smoogly`];

            // Sub claim keys for this repo updated using the below,
            // in order to contain reference to the actor.
            //
            // curl -L \
            //   -X PUT \
            //   -H "Accept: application/vnd.github+json" \
            //   -H "Authorization: Bearer <TOKEN>" \
            //   -H "X-GitHub-Api-Version: 2022-11-28" \
            //   https://api.github.com/repos/smoogly/github-actions-aws-oidc/actions/oidc/customization/sub \
            //   -d '{"use_default":false,"include_claim_keys":["repo","context","actor"]}'
            const githubAccessRole = new Role(stack, "github-action-access", {
                assumedBy: new WebIdentityPrincipal(oidc.openIdConnectProviderArn, {
                    "StringEquals": {
                        'token.actions.githubusercontent.com:sub': users.map(user => `repo:${repoName}:ref:refs/heads/${branch}:actor:${user}`),
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
