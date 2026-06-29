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
