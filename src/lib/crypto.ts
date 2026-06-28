import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

// ===========================================================================
// Credential encryption (AES-256-GCM)
//
// Portal passwords, cookies and session blobs are encrypted before they ever
// touch the database. We use authenticated encryption (GCM) so tampering is
// detected on decrypt. The key comes from ENCRYPTION_KEY (32 bytes hex) and
// should be rotated via envelope encryption / KMS in a production deployment.
//
// Serialized layout (base64):  [ 12-byte IV | 16-byte auth tag | ciphertext ]
// ===========================================================================

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const value = process.env.ENCRYPTION_KEY;
  if (!value) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate one with: openssl rand -hex 32",
    );
  }
  // Preferred form: a 32-byte hex string (64 chars) used directly as the key.
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }
  // Fallback: derive a deterministic 32-byte key from any sufficiently long
  // secret via SHA-256. This lets hosting platforms auto-generate the secret
  // (any random string works) without breaking AES-256's key-length rule.
  if (value.length < 16) {
    throw new Error("ENCRYPTION_KEY is too short; use at least 16 characters.");
  }
  return createHash("sha256").update(value).digest();
}

/** Encrypt a UTF-8 string. Returns a base64 envelope, or null for empty input. */
export function encrypt(plaintext: string | null | undefined): string | null {
  if (plaintext == null || plaintext === "") return null;
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/** Decrypt a base64 envelope produced by `encrypt`. Returns null for null input. */
export function decrypt(envelope: string | null | undefined): string | null {
  if (envelope == null || envelope === "") return null;
  const key = getKey();
  const buf = Buffer.from(envelope, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/** Convenience helpers for JSON payloads (cookies / session state). */
export function encryptJson(value: unknown): string | null {
  if (value == null) return null;
  return encrypt(JSON.stringify(value));
}

export function decryptJson<T = unknown>(envelope: string | null | undefined): T | null {
  const raw = decrypt(envelope);
  return raw == null ? null : (JSON.parse(raw) as T);
}
