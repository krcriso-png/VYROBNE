// Normalise a phone number to international format (default Slovak +421).
// Foreign portals (e.g. Bazoš CZ) require the international prefix, so we store
// numbers this way. "0900 123 456" → "+421900123456", "+420..." kept as-is.
export function normalizePhone(
  raw: string | null | undefined,
  prefix = "+421",
): string | null {
  if (!raw) return null;
  const p = raw.replace(/[^\d+]/g, "");
  if (!p) return null;
  if (p.startsWith("+")) return p;
  if (p.startsWith("00")) return "+" + p.slice(2);
  if (p.startsWith("0")) return prefix + p.slice(1);
  return prefix + p;
}
