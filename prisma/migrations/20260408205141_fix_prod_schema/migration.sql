ALTER TABLE "Campaign"
ADD COLUMN IF NOT EXISTS "description" TEXT,
ADD COLUMN IF NOT EXISTS "startAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "endAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "hero_carousel_slides" (
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

CREATE INDEX IF NOT EXISTS "hero_carousel_slides_order_idx"
ON "hero_carousel_slides"("order");

CREATE INDEX IF NOT EXISTS "hero_carousel_slides_isActive_idx"
ON "hero_carousel_slides"("isActive");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'hero_carousel_slides_mediaId_fkey'
      AND table_name = 'hero_carousel_slides'
  ) THEN
    ALTER TABLE "hero_carousel_slides"
    ADD CONSTRAINT "hero_carousel_slides_mediaId_fkey"
    FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  END IF;
END $$;