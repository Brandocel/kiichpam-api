-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'EXPIRED', 'DISABLED');

-- CreateEnum
CREATE TYPE "CampaignRuleType" AS ENUM ('BASE_PRICE', 'FIXED_PRICE', 'PERCENT_DISCOUNT', 'TWO_FOR_ONE', 'THREE_FOR_TWO');

-- CreateEnum
CREATE TYPE "CampaignAudience" AS ENUM ('ADULT', 'CHILD', 'INFANT', 'ALL');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "audience" "CampaignAudience" NOT NULL DEFAULT 'ALL',
ADD COLUMN     "autoApply" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "discountPercent" INTEGER,
ADD COLUMN     "endAt" TIMESTAMP(3),
ADD COLUMN     "fixedAdultPriceMXN" INTEGER,
ADD COLUMN     "fixedChildPriceMXN" INTEGER,
ADD COLUMN     "fixedInfantPriceMXN" INTEGER,
ADD COLUMN     "maxUses" INTEGER,
ADD COLUMN     "minAdults" INTEGER,
ADD COLUMN     "minChildren" INTEGER,
ADD COLUMN     "minInfants" INTEGER,
ADD COLUMN     "payQty" INTEGER,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ruleType" "CampaignRuleType" NOT NULL DEFAULT 'BASE_PRICE',
ADD COLUMN     "stackable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "startAt" TIMESTAMP(3),
ADD COLUMN     "status" "CampaignStatus" NOT NULL DEFAULT 'SCHEDULED',
ADD COLUMN     "takeQty" INTEGER,
ADD COLUMN     "usedCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Campaign_packageId_idx" ON "Campaign"("packageId");

-- CreateIndex
CREATE INDEX "Campaign_isActive_idx" ON "Campaign"("isActive");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Campaign_startAt_idx" ON "Campaign"("startAt");

-- CreateIndex
CREATE INDEX "Campaign_endAt_idx" ON "Campaign"("endAt");

-- CreateIndex
CREATE INDEX "Campaign_packageId_status_startAt_endAt_idx" ON "Campaign"("packageId", "status", "startAt", "endAt");
