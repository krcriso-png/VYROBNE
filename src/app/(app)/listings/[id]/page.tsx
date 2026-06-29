import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Phone } from "lucide-react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PublishPanel } from "@/components/PublishPanel";
import { ListingActions } from "@/components/ListingActions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LISTING_STATUS } from "@/lib/status";
import { formatPrice } from "@/lib/utils";

// Listing detail: content, photos, portal publishing + live status.
export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const listing = await prisma.listing.findFirst({
    where: { id, userId },
    include: {
      images: { orderBy: { position: "asc" } },
      publications: { include: { portal: true } },
    },
  });
  if (!listing) notFound();

  const portals = await prisma.portal.findMany({
    where: { enabled: true },
    orderBy: { name: "asc" },
    include: { accounts: { where: { userId }, select: { id: true } } },
  });

  const st = LISTING_STATUS[listing.status];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/listings"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Späť na inzeráty
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{listing.title}</h1>
            <Badge tone={st.tone}>{st.label}</Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            {listing.category} ·{" "}
            <span className="font-semibold text-foreground">
              {formatPrice(listing.price?.toString(), listing.currency)}
            </span>
          </p>
        </div>
        <ListingActions listingId={listing.id} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {listing.images.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {listing.images.map((img, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={img.id}
                  src={img.url}
                  alt=""
                  className={
                    "aspect-square w-full rounded-lg border object-cover " +
                    (i === 0 ? "col-span-2 row-span-2" : "")
                  }
                />
              ))}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Popis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {listing.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-4 border-t pt-4 text-sm text-muted-foreground">
                {(listing.location || listing.zip) && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-4" />
                    {[listing.location, listing.zip].filter(Boolean).join(", ")}
                  </span>
                )}
                {listing.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="size-4" />
                    {listing.phone}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <PublishPanel
            listingId={listing.id}
            portals={portals.map((p) => ({
              key: p.key,
              name: p.name,
              integration: p.integration,
              hasAccount: p.accounts.length > 0,
            }))}
            publications={listing.publications.map((pub) => ({
              id: pub.id,
              portalKey: pub.portal.key,
              status: pub.status,
              remoteUrl: pub.remoteUrl,
              smsPrompt: pub.smsPrompt,
              lastError: pub.lastError,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
