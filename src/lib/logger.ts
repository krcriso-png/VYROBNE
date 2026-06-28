import { Prisma, type LogLevel } from "@prisma/client";
import { prisma } from "./db";

// ===========================================================================
// Activity logging
//
// Writes a structured, human-readable log line both to the DB (so it shows up
// in the per-listing timeline / admin panel) and to stdout. Used heavily by
// the worker so that every publish step is auditable:
//
//   09:10 Login Bazoš · 09:11 Upload fotiek · 09:12 Published · 09:15 CAPTCHA
// ===========================================================================

export interface LogInput {
  level?: LogLevel;
  message: string;
  userId?: string | null;
  listingId?: string | null;
  portalKey?: string | null;
  meta?: Record<string, unknown>;
}

export async function logActivity(input: LogInput): Promise<void> {
  const level = input.level ?? "INFO";
  // Console mirror — picked up by the platform's log aggregation.
  const prefix = `[${level}]${input.portalKey ? ` [${input.portalKey}]` : ""}`;
  // eslint-disable-next-line no-console
  console.log(`${prefix} ${input.message}`, input.meta ?? "");

  try {
    await prisma.activityLog.create({
      data: {
        level,
        message: input.message,
        userId: input.userId ?? null,
        listingId: input.listingId ?? null,
        portalKey: input.portalKey ?? null,
        meta: (input.meta as Prisma.InputJsonValue) ?? undefined,
      },
    });
  } catch (err) {
    // Logging must never break the operation it is observing.
    // eslint-disable-next-line no-console
    console.error("Failed to persist activity log", err);
  }
}
