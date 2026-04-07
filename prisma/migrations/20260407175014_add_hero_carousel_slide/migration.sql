-- CreateTable
CREATE TABLE "hero_carousel_slides" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT,
    "subtitle" TEXT,
    "linkUrl" TEXT,
    "linkText" TEXT,
    "altText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_carousel_slides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hero_carousel_slides_order_idx" ON "hero_carousel_slides"("order");

-- CreateIndex
CREATE INDEX "hero_carousel_slides_isActive_idx" ON "hero_carousel_slides"("isActive");

-- AddForeignKey
ALTER TABLE "hero_carousel_slides" ADD CONSTRAINT "hero_carousel_slides_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
