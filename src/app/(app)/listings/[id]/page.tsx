import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PublishPanel } from "@/components/PublishPanel";

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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{listing.title}</h1>
        <p className="text-muted-foreground">
          {listing.category}
          {listing.price ? ` · ${listing.price} ${listing.currency}` : ""}
        </p>
      </div>

      {listing.images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {listing.images.map((img) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={img.id}
              src={img.url}
              alt=""
              className="h-28 w-28 rounded-md border object-cover"
            />
          ))}
        </div>
      )}

      <p className="whitespace-pre-wrap rounded-xl border bg-card p-5 text-sm">
        {listing.description}
      </p>

      <PublishPanel
        listingId={listing.id}
        portals={portals.map((p) => ({
          key: p.key,
          name: p.name,
          hasAccount: p.accounts.length > 0,
        }))}
        publications={listing.publications.map((pub) => ({
          portalKey: pub.portal.key,
          status: pub.status,
          remoteUrl: pub.remoteUrl,
        }))}
      />
    </div>
  );
}
