import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { putObject } from "./storage";

// ===========================================================================
// Image pipeline
//
// On upload each photo is normalised: auto-rotated, resized to a sane max
// dimension, compressed, and converted to WebP. A small thumbnail is also
// produced. Both renditions are stored in object storage; the DB keeps the
// keys, dimensions and ordering.
// ===========================================================================

const MAX_DIMENSION = 1920;
const THUMB_DIMENSION = 400;
const WEBP_QUALITY = 82;

export interface ProcessedImage {
  key: string;
  thumbKey: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  mimeType: "image/webp";
}

/**
 * Process a single uploaded image buffer and persist both renditions.
 * @param userId   used to namespace storage keys per user
 * @param input    raw uploaded bytes (any format sharp supports)
 */
export async function processAndStore(
  userId: string,
  input: Buffer,
): Promise<ProcessedImage> {
  const id = randomUUID();
  const base = `users/${userId}/images/${id}`;
  const key = `${base}.webp`;
  const thumbKey = `${base}.thumb.webp`;

  // Main rendition: contain within MAX_DIMENSION, never enlarge.
  const main = sharp(input).rotate().resize({
    width: MAX_DIMENSION,
    height: MAX_DIMENSION,
    fit: "inside",
    withoutEnlargement: true,
  });

  const mainBuffer = await main.webp({ quality: WEBP_QUALITY }).toBuffer();
  const meta = await sharp(mainBuffer).metadata();

  const thumbBuffer = await sharp(input)
    .rotate()
    .resize({
      width: THUMB_DIMENSION,
      height: THUMB_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 70 })
    .toBuffer();

  const url = await putObject(key, mainBuffer, "image/webp");
  await putObject(thumbKey, thumbBuffer, "image/webp");

  return {
    key,
    thumbKey,
    url,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    bytes: mainBuffer.byteLength,
    mimeType: "image/webp",
  };
}
