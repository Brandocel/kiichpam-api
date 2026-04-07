/*
  Warnings:

  - A unique constraint covering the columns `[filename]` on the table `MediaAsset` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "filename" TEXT,
ADD COLUMN     "path" TEXT;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "appliedCampaignCodes" JSONB,
ADD COLUMN     "campaignDiscountMXN" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "peopleSubtotalMXN" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pricingBreakdown" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_filename_key" ON "MediaAsset"("filename");
