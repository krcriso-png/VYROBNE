import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ===========================================================================
// S3-compatible object storage (MinIO / R2 / S3).
//
// Holds processed listing images. Path-style addressing is used so it works
// against MinIO in local dev as well as managed S3 in production.
// ===========================================================================

const globalForS3 = globalThis as unknown as { s3?: S3Client };

export const s3: S3Client =
  globalForS3.s3 ??
  new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForS3.s3 = s3;
}

const BUCKET = process.env.S3_BUCKET ?? "inzeromat";

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return publicUrl(key);
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** Public URL for a stored object (assumes a CDN / public bucket prefix). */
export function publicUrl(key: string): string {
  const base = process.env.S3_PUBLIC_URL?.replace(/\/$/, "");
  return base ? `${base}/${key}` : key;
}

/** Time-limited download URL — used when the worker needs the original bytes. */
export async function signedDownloadUrl(
  key: string,
  expiresInSeconds = 600,
): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}
