import aws from "@aws-sdk/client-s3";
import config from "./config.js";

export const s3Client = new aws.S3({
  forcePathStyle: false,
  endpoint: config.cloud.digitalocean.endpoint,
  region: config.cloud.digitalocean.region,
  credentials: {
    accessKeyId: config.cloud.digitalocean.credentials.accessKeyId,
    secretAccessKey: config.cloud.digitalocean.credentials.secretAccessKey,
  },
});

