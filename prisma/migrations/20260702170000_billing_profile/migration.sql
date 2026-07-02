-- Buyer billing/company details on the subscription (idempotent).
ALTER TABLE "Subscription"
  ADD COLUMN IF NOT EXISTS "billingName" TEXT,
  ADD COLUMN IF NOT EXISTS "billingIco" TEXT,
  ADD COLUMN IF NOT EXISTS "billingDic" TEXT,
  ADD COLUMN IF NOT EXISTS "billingVatId" TEXT,
  ADD COLUMN IF NOT EXISTS "billingStreet" TEXT,
  ADD COLUMN IF NOT EXISTS "billingCity" TEXT,
  ADD COLUMN IF NOT EXISTS "billingZip" TEXT,
  ADD COLUMN IF NOT EXISTS "billingCountry" TEXT;
