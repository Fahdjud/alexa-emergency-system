import "server-only"

export function getAwsEnv() {
  const region = process.env.AWS_REGION?.trim()
  const topicArn = process.env.AWS_SNS_TOPIC_ARN?.trim()
  if (!region || !topicArn) {
    throw new Error("AWS_REGION and AWS_SNS_TOPIC_ARN must be configured")
  }
  const match =
    /^arn:aws(?:-cn|-us-gov)?:sns:([^:]+):\d{12}:([A-Za-z0-9_-]{1,256})$/.exec(
      topicArn
    )
  if (!match || match[1] !== region) {
    throw new Error(
      "AWS_SNS_TOPIC_ARN must be a standard SNS topic ARN matching AWS_REGION"
    )
  }
  return { region, topicArn }
}
