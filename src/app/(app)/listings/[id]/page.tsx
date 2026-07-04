import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Phone } from "lucide-react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PublishPanel } from "@/components/PublishPanel";
import { PhotoManager } from "@/components/PhotoManager";
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
  const isAdmin = session!.user.role === "ADMIN";

  const listing = await prisma.listing.findFirst({
    where: { id, userId },
    include: {
      images: { orderBy: { position: "asc" } },
      publications: { include: { portal: true } },
    },
  });
  if (!listing) notFound();

  const portals = await prisma.portal.findMany({
    // The "mock" portal is a dev-only test target — never show it to users.
    // Portals paused for customers stay visible to admins for testing.
    where: {
      enabled: true,
      key: { not: "mock" },
      ...(isAdmin ? {} : { pausedForUsers: false }),
    },
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
          <PhotoManager
            listingId={listing.id}
            images={listing.images.map((img) => ({ id: img.id, url: img.url }))}
          />

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
              paused: p.pausedForUsers,
            }))}
            publications={listing.publications.map((pub) => ({
              id: pub.id,
              portalKey: pub.portal.key,
              status: pub.status,
              remoteUrl: pub.remoteUrl,
              smsPrompt: pub.smsPrompt,
              lastError: pub.lastError,
              statusNote: pub.statusNote,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
