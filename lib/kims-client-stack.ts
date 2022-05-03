import * as cdk from 'aws-cdk-lib';
import {Stack} from 'aws-cdk-lib';
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

        const releaseBucket = cdk.aws_s3.Bucket.fromBucketName(this, 'ReleaseBucket', props.clientEnvMap.S3_RELEASE_BUCKET);
        const origin = new cdk.aws_cloudfront_origins.S3Origin(releaseBucket, {originPath: props.clientEnvMap.CLIENT_RELEASE});
        const certificate = cdk.aws_certificatemanager.Certificate.fromCertificateArn(this, 'Certificate', props.clientEnvMap.CLOUD_FRONT_CERTIFICATE);

        const webAppDomainName = props.clientEnvMap.APP_DOMAIN_PREFIX + '.' + props.serverEnvMap.BASE_DOMAIN_NAME;

        const distribution = new cdk.aws_cloudfront.Distribution(this, 'MyCloudFrontDist', {
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

        const apiDomainName = props.serverEnvMap.API_DOMAIN_PREFIX + '.' + props.serverEnvMap.BASE_DOMAIN_NAME;
        const apiHttpOrigin = new cdk.aws_cloudfront_origins.HttpOrigin(apiDomainName, {
            protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
            originSslProtocols: [OriginSslPolicy.TLS_V1_2]
        });

        const apiCachePolicy = new cdk.aws_cloudfront.CachePolicy(this, 'ApiCachePolicy', {
            cachePolicyName: props.clientEnvMap.APP_DOMAIN_PREFIX + '-api-cache-policy',
            headerBehavior: CacheHeaderBehavior.allowList('Authorization'),
            queryStringBehavior: CacheQueryStringBehavior.all(),
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

        const cname = new cdk.aws_route53.CnameRecord(this, 'Cname', {
            recordName: props.clientEnvMap.APP_DOMAIN_PREFIX,
            domainName: distribution.domainName,
            zone: hostedZone,
        });
    }
}