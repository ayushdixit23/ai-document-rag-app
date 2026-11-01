import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { ALLOWED_ORIGINS, getR2Config } from '../../config/env.js';
import { PRESIGN_TTL_SECONDS } from '../../services/rag/config.js';

export interface R2ObjectRef {
  userId: string;
  documentId: string;
  fileName: string;
}

let client: S3Client | undefined;

const getClient = (): S3Client => {
  if (client) return client;
  const { accountId, accessKeyId, secretAccessKey } = getR2Config();
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  return client;
};

const bucketName = (): string => getR2Config().bucketName;

const safeSegment = (value: string): string => encodeURIComponent(value);

export const buildObjectKey = ({ userId, documentId, fileName }: R2ObjectRef): string => {
  const baseName = fileName.split(/[\\/]/).at(-1)?.trim() ?? '';
  const candidate = baseName.replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 180);
  const safeFileName = candidate === '.' || candidate === '..' ? 'file' : candidate || 'file';
  return `users/${safeSegment(userId)}/documents/${safeSegment(documentId)}/${safeFileName}`;
};

export const presignPutObject = async (
  object: R2ObjectRef,
  contentType: string,
  contentLength: number,
): Promise<string> =>
  getSignedUrl(
    getClient(),
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: buildObjectKey(object),
      ContentType: contentType,
      ContentLength: contentLength,
    }),
    {
      expiresIn: PRESIGN_TTL_SECONDS,
      signableHeaders: new Set(['content-type', 'content-length']),
    },
  );

export const headObject = async (object: R2ObjectRef) =>
  getClient().send(new HeadObjectCommand({ Bucket: bucketName(), Key: buildObjectKey(object) }));

export const getObject = async (object: R2ObjectRef) =>
  getClient().send(new GetObjectCommand({ Bucket: bucketName(), Key: buildObjectKey(object) }));

export const deleteObject = async (object: R2ObjectRef): Promise<void> => {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: bucketName(), Key: buildObjectKey(object) }),
  );
};

export const verifyBucketAccess = async (): Promise<void> => {
  await getClient().send(new HeadBucketCommand({ Bucket: bucketName() }));
};

export const configureBucketCors = async (): Promise<void> => {
  await getClient().send(
    new PutBucketCorsCommand({
      Bucket: bucketName(),
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ALLOWED_ORIGINS,
            AllowedMethods: ['PUT'],
            AllowedHeaders: ['Content-Type'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
};
