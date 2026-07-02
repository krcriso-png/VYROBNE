-- AlterTable: add the admin "pause for customers" switch (idempotent so a
-- re-run never crashes the boot migration step).
ALTER TABLE "Portal" ADD COLUMN IF NOT EXISTS "pausedForUsers" BOOLEAN NOT NULL DEFAULT false;
