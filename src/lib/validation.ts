import { z } from "zod";

// ===========================================================================
// Request validation schemas (zod)
//
// Shared between API routes and (optionally) the client. Keeping them here
// makes the API contract explicit and is the first line of input defence.
// ===========================================================================

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Heslo musí mať aspoň 8 znakov"),
  name: z.string().min(1).max(120).optional(),
});

export const listingInputSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().min(1).max(20_000),
  price: z.number().nonnegative().nullable().optional(),
  currency: z.string().length(3).default("EUR"),
  category: z.string().min(1).max(120),
  parameters: z.record(z.unknown()).default({}),
  tags: z.array(z.string().max(40)).max(30).default([]),
  location: z.string().max(160).nullable().optional(),
  zip: z.string().max(16).nullable().optional(),
  contactName: z.string().max(120).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  web: z.string().url().max(300).nullable().optional(),
  renewIntervalHours: z
    .number()
    .int()
    .refine((v) => [24, 48, 168].includes(v), "Povolené: 24, 48 alebo 168 h")
    .nullable()
    .optional(),
});

export const listingUpdateSchema = listingInputSchema.partial();

export const publishSchema = z.object({
  portalKeys: z.array(z.string().min(1)).min(1, "Vyber aspoň jeden portál"),
});

export const portalAccountSchema = z.object({
  portalKey: z.string().min(1),
  label: z.string().max(120).optional(),
  login: z.string().max(200).optional(),
  password: z.string().max(400).optional(),
  verifyPhone: z.string().max(40).optional(),
});

export const checkoutSchema = z.object({
  plan: z.enum(["BASIC", "PRO"]),
  interval: z.enum(["monthly", "yearly"]).default("monthly"),
});

export type ListingInput = z.infer<typeof listingInputSchema>;
export type PortalAccountInput = z.infer<typeof portalAccountSchema>;
