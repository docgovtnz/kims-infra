import * as cdk from 'aws-cdk-lib';
import {Duration, Stack} from 'aws-cdk-lib';
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
import * as process from 'process';

export class KimsClientStack extends Stack {
    constructor(scope: Construct, id: string, props: MyStackProps) {
        super(scope, id, props);

        const releaseBucket = cdk.aws_s3.Bucket.fromBucketName(this, 'ReleaseBucket', props.clientEnvMap.S3_RELEASE_BUCKET);
        const origin = new cdk.aws_cloudfront_origins.S3Origin(releaseBucket, {originPath: props.clientEnvMap.CLIENT_RELEASE});
        const certificate = cdk.aws_certificatemanager.Certificate.fromCertificateArn(this, 'Certificate', props.clientEnvMap.CLOUD_FRONT_CERTIFICATE);

        const webAppDomainName = props.clientEnvMap.APP_DOMAIN_PREFIX + '.' + props.serverEnvMap.BASE_DOMAIN_NAME;

        // Copy the client.json from the local folder into the bucket where CloudFront will source it from
        const clientJsonDeployment = new cdk.aws_s3_deployment.BucketDeployment(this, 'ClientJson', {
            sources: [cdk.aws_s3_deployment.Source.jsonData('client.json', props.clientEnvMap)],
            destinationBucket: releaseBucket,
            destinationKeyPrefix: `env/${process.env.ENV_NAME}`
        });

        // Declare the CloudFront distribution and link it to the resources it will host
        const distribution = new cdk.aws_cloudfront.Distribution(this, props.serverEnvMap.APP_NAME_PREFIX + '-cloud-front', {
            defaultBehavior: {
                origin: origin,
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

        // happens to be using the release bucket, but it's really a different bucket, just trying to avoid having
        // too many buckets.
        distribution.addBehavior('client.json', new cdk.aws_cloudfront_origins.S3Origin(releaseBucket, {
            originPath: `env/${process.env.ENV_NAME}`,
        }), {
            // It is only downloaded once each time the App launches, but needs to be fresh otherwise settings and things
            // like version numbers will be wrong
            cachePolicy: cdk.aws_cloudfront.CachePolicy.CACHING_DISABLED
        });

        distribution.addBehavior('index.html', origin, {
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

        // const cname = new cdk.aws_route53.CnameRecord(this, 'Cname', {
        //     recordName: props.clientEnvMap.APP_DOMAIN_PREFIX,
        //     domainName: distribution.domainName,
        //     zone: hostedZone,
        // });

        new cdk.aws_route53.ARecord(this, 'ARecord', {
            zone: hostedZone,
            recordName: props.clientEnvMap.APP_DOMAIN_PREFIX,
            target: cdk.aws_route53.RecordTarget.fromAlias(new cdk.aws_route53_targets.CloudFrontTarget(distribution))
        });
    }
}