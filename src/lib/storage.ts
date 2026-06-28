import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "./db";

// ===========================================================================
// Object storage for processed listing images.
//
// Two backends, chosen automatically:
//   - S3-compatible (MinIO / R2 / S3) when S3 credentials are configured.
//   - Database fallback (ImageBlob table) otherwise — zero-config, so image
//     upload works out of the box on a single-service deploy. Blobs are served
//     publicly via /api/blob/<key> (keys are unguessable UUIDs).
// ===========================================================================

const BUCKET = process.env.S3_BUCKET ?? "klikado";
const USE_S3 = !!(
  process.env.S3_ACCESS_KEY_ID &&
  process.env.S3_SECRET_ACCESS_KEY &&
  process.env.S3_BUCKET
);

let s3Client: S3Client | null = null;
function s3(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return s3Client;
}

/** Store an object and return the URL the browser can display it from. */
export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  if (USE_S3) {
    await s3().send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  } else {
    await prisma.imageBlob.upsert({
      where: { key },
      create: { key, data: body, contentType },
      update: { data: body, contentType },
    });
  }
  return publicUrl(key);
}

export async function deleteObject(key: string): Promise<void> {
  if (USE_S3) {
    await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } else {
    await prisma.imageBlob.deleteMany({ where: { key } });
  }
}

/** Public URL for an object (used as ListingImage.url for browser display). */
export function publicUrl(key: string): string {
  if (USE_S3) {
    const base = process.env.S3_PUBLIC_URL?.replace(/\/$/, "");
    return base ? `${base}/${key}` : key;
  }
  // DB mode: relative URL resolves against the site in the browser.
  const base = process.env.APP_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api/blob/${key}`;
}

/**
 * URL the worker uses to download the original bytes. For S3 this is a
 * time-limited signed URL; in DB mode it is an absolute /api/blob URL the
 * worker (same host) can fetch.
 */
export async function signedDownloadUrl(
  key: string,
  expiresInSeconds = 600,
): Promise<string> {
  if (USE_S3) {
    return getSignedUrl(
      s3(),
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
  const base =
    process.env.APP_URL?.replace(/\/$/, "") ??
    `http://127.0.0.1:${process.env.PORT ?? 3000}`;
  return `${base}/api/blob/${key}`;
}

/** Read a blob from the DB fallback store (used by the /api/blob route). */
export async function getBlob(
  key: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  const blob = await prisma.imageBlob.findUnique({ where: { key } });
  if (!blob) return null;
  return { data: Buffer.from(blob.data), contentType: blob.contentType };
}
