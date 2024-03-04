import {SSTConfig} from "sst";
import {Function, FunctionInlineDefinition, Config} from "sst/constructs";
import {ManagedPolicy, OpenIdConnectProvider, Role, WebIdentityPrincipal} from "aws-cdk-lib/aws-iam";

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
            new Role(stack, "github-action-access", {
                assumedBy: new WebIdentityPrincipal(oidc.openIdConnectProviderIssuer, {
                    "StringEquals": {
                        'token.actions.githubusercontent.com:sub': ['repo:rangle/cmap-availability:ref:refs/heads/main'],
                        'token.actions.githubusercontent.com:actor': ['hahanope']
                    },
                }),

                managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")],
            });

            // Mock deployment
            new Function(stack, "mock-deployment", {
                handler: "mockdeploy/mockfn.handler",
                bind: [
                    new Config.Parameter(stack, "RAND", {
                        value: String(Math.random()),
                    }),
                ],
                disableCloudWatchLogs: true,
                timeout: "1 second",
                memorySize: "128 MB"
            });
        });
    }
} satisfies SSTConfig;
