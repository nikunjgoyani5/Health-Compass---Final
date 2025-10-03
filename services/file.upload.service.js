import { DeleteObjectCommand, PutObjectCommand, S3 } from "@aws-sdk/client-s3";
import config from "../config/config.js";
import { v4 as uuidv4 } from "uuid";
import mime from "mime-types";
import helper from "../helper/common.helper.js";
import sharp from "sharp";

const getFileExt = (imageData) => {
  const fileExtensionMapping = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      "pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.ms-powerpoint": "ppt",
    "application/msword": "doc",
    "image/svg+xml": "svg",
  };
  const regex = /^data:([a-zA-Z0-9-+.]+\/[a-zA-Z0-9-+.]+);base64,/;
  const match = imageData.match(regex);
  if (!match) throw new Error("Invalid image data format");
  const mimetype = match[1];
  const fileExt = fileExtensionMapping[mimetype] || mimetype.split("/").pop();
  const data = imageData.replace(regex, "");
  return { fileExt, mimetype, data };
};

// S3 Client
const s3Client = new S3({
  forcePathStyle: false,
  endpoint: config.cloud.digitalocean.endpoint,
  region: config.cloud.digitalocean.region,
  credentials: {
    accessKeyId: config.cloud.digitalocean.credentials.accessKeyId,
    secretAccessKey: config.cloud.digitalocean.credentials.secretAccessKey,
  },
});

// Upload File
const uploadFile = async ({ mimetype, buffer, folder = "", ACL = "public-read" }) => {
  const prefix = folder
    ? `${config.cloud.digitalocean.rootDirname}/${folder}`
    : `${config.cloud.digitalocean.rootDirname}`;

  const uuid = uuidv4();
  const extension = mime.extension(mimetype);
  const fileKey = `${prefix}/${uuid}.${extension}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: config.cloud.digitalocean.bucketName,
      Key: fileKey,
      Body: buffer,
      ACL: ACL,
    })
  );

  return `${config.cloud.digitalocean.baseUrl}/${fileKey}`;
};


// Update File
const updateFile = async ({ url, mimetype, buffer, ACL = "public-read" }) => {
  if (url) { await deleteFile({url}) }
  const newURL = await uploadFile({buffer: buffer,mimetype: mimetype,ACL});
  return newURL;
};

// Delete File
const deleteFile = async ({ url }) => {
  const fileKey = helper.extractFileKey(url);
  await s3Client.send(new DeleteObjectCommand({Bucket: config.cloud.digitalocean.bucketName,Key: fileKey}));
  return url;
};

const handleFile = async (imageData, file) => {
  const { fileExt, data, mimetype } = getFileExt(imageData)
  const imageBuffer = Buffer.from(data, "base64");
  const maxWidth = 1920;
  const maxHeight = 1080;
  const optimizedImageBuffer = await sharp(imageBuffer)
    .resize(maxWidth, maxHeight, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .toFormat(fileExt)
    .toBuffer();
  const imageUrl = await uploadFile({buffer: optimizedImageBuffer,mimetype});
  return imageUrl;
};

export default {
  uploadFile,
  deleteFile,
  updateFile,
  handleFile,
};
