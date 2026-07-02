-- Private admin note on support threads (idempotent).
ALTER TABLE "SupportThread" ADD COLUMN IF NOT EXISTS "internalNote" TEXT;
