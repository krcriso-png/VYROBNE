import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "./auth";
import { prisma } from "./db";

// ===========================================================================
// API helpers
//
// Small utilities shared by route handlers: authenticated-user resolution,
// consistent JSON error envelopes, and a wrapper that turns thrown errors
// (including zod validation errors) into proper HTTP responses. This keeps the
// individual route handlers terse and uniform — important for an API-first
// product that a mobile client will also consume.
// ===========================================================================

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function error(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export interface SessionUser {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
}

/** Resolve the current user or throw 401. Also enforces the block flag. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new HttpError(401, "Neprihlásený používateľ");
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, role: true, blocked: true },
  });
  if (!user || user.blocked) {
    throw new HttpError(403, "Účet je zablokovaný");
  }
  return { id: user.id, email: user.email, role: user.role };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new HttpError(403, "Vyžaduje sa rola administrátora");
  }
  return user;
}

/** Wrap a route handler so thrown errors become clean JSON responses. */
export function route<T extends unknown[]>(
  handler: (...args: T) => Promise<Response>,
) {
  return async (...args: T): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof HttpError) return error(err.status, err.message);
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: "Neplatné dáta", issues: err.flatten() },
          { status: 422 },
        );
      }
      // eslint-disable-next-line no-console
      console.error("Unhandled API error", err);
      return error(500, "Interná chyba servera");
    }
  };
}
