import { getBlob } from "@/lib/storage";

// GET /api/blob/<key…> — serve an image stored in the DB fallback store.
// Public (keys are unguessable UUIDs) so <img> tags and the worker/portals can
// fetch the bytes without a session. Long-cached & immutable.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const blob = await getBlob(key.join("/"));
  if (!blob) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(blob.data), {
    headers: {
      "content-type": blob.contentType,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
