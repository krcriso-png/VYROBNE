-- AlterTable
ALTER TABLE "Publication" ADD COLUMN     "viewsBase" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "viewsCheckedAt" TIMESTAMP(3),
ADD COLUMN     "viewsCurrent" INTEGER NOT NULL DEFAULT 0;
