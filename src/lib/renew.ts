// ===========================================================================
// Auto-renew (topovať) interval options — single source of truth for the UI
// select, validation and dashboard labels.
// ===========================================================================

export const RENEW_OPTIONS: { value: number; label: string }[] = [
  { value: 24, label: "Každý deň" },
  { value: 72, label: "Každý 3. deň" },
  { value: 168, label: "Každý týždeň" },
  { value: 336, label: "Každé 2 týždne" },
  { value: 720, label: "Každý mesiac" },
];

export const RENEW_HOURS = RENEW_OPTIONS.map((o) => o.value);

/** Human label for a stored interval (e.g. 72 -> "Každý 3. deň"). */
export function renewLabel(hours: number | null | undefined): string {
  if (!hours) return "Vypnuté";
  return RENEW_OPTIONS.find((o) => o.value === hours)?.label ?? `Každých ${hours} h`;
}
