import { ExternalLink, ImageOff, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminListingRemove } from "@/components/AdminListingRemove";
import type { ModerationFlag } from "@/lib/moderation";

type Tone = "neutral" | "primary" | "success" | "warning" | "destructive";

export interface AdminListingCardData {
  id: string;
  title: string;
  description: string;
  price: string | null;
  currency: string;
  category: string;
  statusLabel: string;
  statusTone: Tone;
  /** Owner e-mail — omit on a per-user page where it's redundant. */
  ownerEmail?: string;
  mainUrl: string | null;
  portals: { id: string; name: string; url: string | null }[];
  flags: ModerationFlag[];
}

// One listing row for the admin moderation views. Highlights forbidden-content
// flags (with the exact matched terms so the admin sees *why*) and offers the
// remove-with-reason action.
export function AdminListingCard({ data }: { data: AdminListingCardData }) {
  const highest = data.flags.some((f) => f.severity === "high")
    ? "high"
    : data.flags.length
      ? "medium"
      : null;

  return (
    <Card
      className={
        "p-4 " +
        (highest === "high"
          ? "border-destructive/50 bg-destructive/[0.03]"
          : highest === "medium"
            ? "border-warning/50 bg-warning/[0.03]"
            : "")
      }
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="size-16 shrink-0 overflow-hidden rounded-lg border bg-muted">
          {data.mainUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.mainUrl} alt="" className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center text-muted-foreground">
              <ImageOff className="size-5" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{data.title}</p>
            <Badge tone={data.statusTone}>{data.statusLabel}</Badge>
          </div>

          {data.flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.flags.map((f) => (
                <span
                  key={f.category}
                  className={
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium " +
                    (f.severity === "high"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-warning/15 text-warning")
                  }
                  title={`Zhoda: ${f.terms.join(", ")}`}
                >
                  <AlertTriangle className="size-3" /> {f.label}
                  <span className="font-normal opacity-70">
                    ({f.terms.slice(0, 3).join(", ")})
                  </span>
                </span>
              ))}
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {data.ownerEmail && <>{data.ownerEmail} · </>}
            {data.price != null && (
              <>
                {data.price} {data.currency} ·{" "}
              </>
            )}
            {data.category}
          </p>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {data.description}
          </p>

          {data.portals.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {data.portals.map((p) =>
                p.url ? (
                  <a
                    key={p.id}
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-primary hover:bg-primary/5"
                  >
                    <ExternalLink className="size-3" /> {p.name}
                  </a>
                ) : (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground"
                  >
                    {p.name}
                  </span>
                ),
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 sm:w-64">
          <AdminListingRemove listingId={data.id} title={data.title} />
        </div>
      </div>
    </Card>
  );
}
