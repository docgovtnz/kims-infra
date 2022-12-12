import * as cdk from 'aws-cdk-lib';
import {Duration, RemovalPolicy, Stack} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {MyStackProps} from '../bin/kims-infra';
import {
    AllowedMethods,
    CacheHeaderBehavior,
    CacheQueryStringBehavior,
    OriginProtocolPolicy,
    OriginSslPolicy,
    ViewerProtocolPolicy
} from 'aws-cdk-lib/aws-cloudfront';

export class KimsClientStack extends Stack {
    constructor(scope: Construct, id: string, props: MyStackProps) {
        super(scope, id, props);

        // This is the permanent location of all releases, it can have IAM policies to allow cross-account sharing
        const releaseBucket = cdk.aws_s3.Bucket.fromBucketArn(this, 'ReleaseBucket', props.clientEnvMap.S3_RELEASE_BUCKET_ARN);

        // The certificate that we need later for cloud front
        const certificate = cdk.aws_certificatemanager.Certificate.fromCertificateArn(this, 'Certificate', props.clientEnvMap.CLOUD_FRONT_CERTIFICATE);
        const webAppDomainName = props.clientEnvMap.APP_DOMAIN_PREFIX + '.' + props.serverEnvMap.BASE_DOMAIN_NAME;
        const releaseFilename = `kims-client_${props.clientEnvMap.CLIENT_RELEASE}.zip`;

        // This is the non-permanent bucket that holds the release, but only for as long as we need the cloud formation
        // stack. We need a stack-specific bucket because currently that's the only way cloud formation can modify the
        // bucket policy of a bucket and we need that because cloud front will create a new OAI identity for the
        // distribution. We can't use OAC because at the time of writing CDK did not support OAC for cloud front.
        const clientReleaseDeploymentBucket = new cdk.aws_s3.Bucket(this, 'DeploymentBucket', {
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true
        });

        // This is an "action" that will deploy the files from these source locations into the deployment bucket
        const releaseBucketDeployment = new cdk.aws_s3_deployment.BucketDeployment(this, 'ReleaseDeploymentBucket', {
            sources: [
                cdk.aws_s3_deployment.Source.jsonData('client.json', props.clientEnvMap),
                cdk.aws_s3_deployment.Source.bucket(releaseBucket, `${props.clientEnvMap.CLIENT_RELEASE}/${releaseFilename}`)
            ],
            destinationBucket: clientReleaseDeploymentBucket,
            retainOnDelete: false,
        });

        // Setup the OAI ourselves so that we can reference it in this script, this is the identity that cloudfront will
        // use when it needs to retrieve the web files. In the AWS docs OAI is described as "legacy" but at the time of
        // writing CDK does not yet support the newer "OAC" approach and so we still use "OAI"
        const originAccessIdentity = new cdk.aws_cloudfront.OriginAccessIdentity(this, 'OriginAccessIdentity', {
            comment: 'Created by CDK for kims-client cloud front distribution'
        });

        // Give the OAI read access to the deployment bucket
        clientReleaseDeploymentBucket.grantRead(originAccessIdentity);

        // Cloudfront will use this as the origin of the release, rather than fight with the zip/unzip path names we're
        // just going to reference the main website client folder from the dist/kims-client path it gets unpacked with.
        const releaseDeploymentOrigin = new cdk.aws_cloudfront_origins.S3Origin(releaseBucketDeployment.deployedBucket, {
            originPath: 'dist/kims-client',
            originAccessIdentity: originAccessIdentity
        });

        // Declare the CloudFront distribution and link it to the resources it will host
        const distribution = new cdk.aws_cloudfront.Distribution(this, props.serverEnvMap.APP_NAME_PREFIX + '-cloud-front', {
            defaultBehavior: {
                origin: releaseDeploymentOrigin,
                allowedMethods: cdk.aws_cloudfront.AllowedMethods.ALLOW_ALL,
                viewerProtocolPolicy: cdk.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            },
            errorResponses: [
                {httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html'},
                {httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html'}
            ],
            domainNames: [webAppDomainName],
            certificate: certificate,
        });

        // The client.json sits at the root level of the deployment bucket. One nice side effect is that it acts a bit
        // like a transaction receipt of the deployed release
        const clientJsonDeploymentOrigin = new cdk.aws_cloudfront_origins.S3Origin(releaseBucketDeployment.deployedBucket, {
            originAccessIdentity: originAccessIdentity
        });

        // It is only downloaded once each time the App launches, but needs to be fresh otherwise settings and things
        // like version numbers will be wrong
        distribution.addBehavior('client.json', clientJsonDeploymentOrigin, {
            cachePolicy: cdk.aws_cloudfront.CachePolicy.CACHING_DISABLED,
        });

        // The index.html is cache disabled, otherwise the browser gets stuck with cached old releases
        distribution.addBehavior('index.html', releaseDeploymentOrigin, {
            cachePolicy: cdk.aws_cloudfront.CachePolicy.CACHING_DISABLED
        });

        // Find out what the APIGateway address is of the Lambda function
        // Lookup the output value from the KimsServerStack and use that as part of a naming pattern
        const restApiId = cdk.Fn.importValue(props.serverEnvMap.APP_NAME_PREFIX + 'RestApiId');

        // We could do a lookup of the resource and ask it for the domain name, but the name we want follows a standard
        // naming pattern, so we can cheat a little and follow the standard naming pattern.
        const apiDomainName = `${restApiId}.execute-api.ap-southeast-2.amazonaws.com`;

        const apiHttpOrigin = new cdk.aws_cloudfront_origins.HttpOrigin(apiDomainName, {
            protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
            originSslProtocols: [OriginSslPolicy.TLS_V1_2],
            // This isn't anything to do with the prod environment. Lambda has it's own ideas about environments, but we
            // don't use them and this is just needed here because every Lambda API endpoint is going to be a "prod" endpoint.
            originPath: '/prod'
        });

        const apiCachePolicy = new cdk.aws_cloudfront.CachePolicy(this, 'ApiCachePolicy', {
            cachePolicyName: props.serverEnvMap.APP_NAME_PREFIX + '-api-cache-policy',
            headerBehavior: CacheHeaderBehavior.allowList('Authorization'),
            queryStringBehavior: CacheQueryStringBehavior.all(),
            minTtl: Duration.seconds(0),
            maxTtl: Duration.seconds(1),
            defaultTtl: Duration.seconds(0),
            enableAcceptEncodingBrotli: true,
            enableAcceptEncodingGzip: true
        });

        distribution.addBehavior('api/*', apiHttpOrigin, {
            cachePolicy: apiCachePolicy,
            viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
            allowedMethods: AllowedMethods.ALLOW_ALL
        });

        const hostedZone = cdk.aws_route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
            hostedZoneId: props.serverEnvMap.HOSTED_ZONE_ID,
            zoneName: props.serverEnvMap.BASE_DOMAIN_NAME
        });

        new cdk.aws_route53.ARecord(this, 'ARecord', {
            zone: hostedZone,
            recordName: props.clientEnvMap.APP_DOMAIN_PREFIX,
            target: cdk.aws_route53.RecordTarget.fromAlias(new cdk.aws_route53_targets.CloudFrontTarget(distribution))
        });
    }
}