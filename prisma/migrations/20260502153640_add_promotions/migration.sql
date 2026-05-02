-- CreateEnum
CREATE TYPE "PromotionSectionType" AS ENUM ('MONTHLY', 'STANDARD');

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sectionType" "PromotionSectionType" NOT NULL DEFAULT 'STANDARD',
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "buttonText" TEXT,
    "buttonUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "packageId" TEXT,
    "campaignId" TEXT,
    "imageMediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promotions_code_key" ON "promotions"("code");

-- CreateIndex
CREATE INDEX "promotions_isActive_idx" ON "promotions"("isActive");

-- CreateIndex
CREATE INDEX "promotions_sectionType_idx" ON "promotions"("sectionType");

-- CreateIndex
CREATE INDEX "promotions_startAt_idx" ON "promotions"("startAt");

-- CreateIndex
CREATE INDEX "promotions_endAt_idx" ON "promotions"("endAt");

-- CreateIndex
CREATE INDEX "promotions_order_idx" ON "promotions"("order");

-- CreateIndex
CREATE INDEX "promotions_priority_idx" ON "promotions"("priority");

-- CreateIndex
CREATE INDEX "promotions_packageId_idx" ON "promotions"("packageId");

-- CreateIndex
CREATE INDEX "promotions_campaignId_idx" ON "promotions"("campaignId");

-- CreateIndex
CREATE INDEX "promotions_imageMediaId_idx" ON "promotions"("imageMediaId");

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_imageMediaId_fkey" FOREIGN KEY ("imageMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
