// Display metadata for publication statuses, shared by UI components.
import type { PublicationStatus } from "@prisma/client";

type Tone = "neutral" | "primary" | "success" | "warning" | "destructive";

export const PUBLICATION_STATUS: Record<
  PublicationStatus,
  { label: string; tone: Tone }
> = {
  PENDING: { label: "Čaká", tone: "warning" },
  PUBLISHING: { label: "Publikuje sa", tone: "warning" },
  WAITING_SMS: { label: "Čaká na SMS kód", tone: "warning" },
  PUBLISHED: { label: "Publikované", tone: "success" },
  UPDATING: { label: "Aktualizuje sa", tone: "warning" },
  REMOVING: { label: "Odstraňuje sa", tone: "warning" },
  REMOVED: { label: "Odstránené", tone: "neutral" },
  ERROR: { label: "Chyba", tone: "destructive" },
};

export const LISTING_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Koncept", tone: "neutral" },
  ACTIVE: { label: "Aktívny", tone: "success" },
  ARCHIVED: { label: "Archív", tone: "warning" },
};

// The status to SHOW the user — derived from reality, not just the stored flag.
// An ACTIVE listing that isn't live on any portal must NOT read "Aktívny"; it's
// "Nezverejnený" so it's obvious it's not published anywhere.
export function displayListingStatus(
  status: string,
  publishedCount: number,
): { label: string; tone: Tone } {
  if (status === "DRAFT") return { label: "Koncept", tone: "neutral" };
  if (status === "ARCHIVED") return { label: "Archív", tone: "warning" };
  // ACTIVE (or anything else): live only if it's published on ≥1 portal.
  if (publishedCount > 0) return { label: "Aktívny", tone: "success" };
  return { label: "Nezverejnený", tone: "warning" };
}
