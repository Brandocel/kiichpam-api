ALTER TABLE "Reservation"
ADD COLUMN IF NOT EXISTS "reference" TEXT;

ALTER TABLE "Reservation"
ADD COLUMN IF NOT EXISTS "gclid" TEXT;

CREATE INDEX IF NOT EXISTS "Reservation_reference_idx"
ON "Reservation"("reference");

CREATE INDEX IF NOT EXISTS "Reservation_utmSource_idx"
ON "Reservation"("utmSource");

CREATE INDEX IF NOT EXISTS "Reservation_utmCampaign_idx"
ON "Reservation"("utmCampaign");