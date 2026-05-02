-- CreateTable
CREATE TABLE "promotion_package_options" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "campaignId" TEXT,
    "label" TEXT,
    "description" TEXT,
    "displayPriceMXN" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_package_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promotion_package_options_promotionId_idx" ON "promotion_package_options"("promotionId");

-- CreateIndex
CREATE INDEX "promotion_package_options_packageId_idx" ON "promotion_package_options"("packageId");

-- CreateIndex
CREATE INDEX "promotion_package_options_campaignId_idx" ON "promotion_package_options"("campaignId");

-- CreateIndex
CREATE INDEX "promotion_package_options_isActive_idx" ON "promotion_package_options"("isActive");

-- CreateIndex
CREATE INDEX "promotion_package_options_order_idx" ON "promotion_package_options"("order");

-- AddForeignKey
ALTER TABLE "promotion_package_options" ADD CONSTRAINT "promotion_package_options_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_package_options" ADD CONSTRAINT "promotion_package_options_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_package_options" ADD CONSTRAINT "promotion_package_options_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
