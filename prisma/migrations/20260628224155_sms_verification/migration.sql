-- AlterEnum
ALTER TYPE "PublicationStatus" ADD VALUE 'WAITING_SMS';

-- AlterTable
ALTER TABLE "Publication" ADD COLUMN     "smsCode" TEXT,
ADD COLUMN     "smsPrompt" TEXT;
