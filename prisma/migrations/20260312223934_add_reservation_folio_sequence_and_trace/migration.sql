-- DropForeignKey
ALTER TABLE "PackageExtra" DROP CONSTRAINT "PackageExtra_packageId_fkey";

-- DropForeignKey
ALTER TABLE "PackageExtraTranslation" DROP CONSTRAINT "PackageExtraTranslation_extraId_fkey";

-- DropForeignKey
ALTER TABLE "PackageTranslation" DROP CONSTRAINT "PackageTranslation_packageId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_reservationId_fkey";

-- DropForeignKey
ALTER TABLE "ReservationExtra" DROP CONSTRAINT "ReservationExtra_reservationId_fkey";

-- CreateTable
CREATE TABLE "reservation_folio_sequences" (
    "id" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_folio_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_traces" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_traces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reservation_folio_sequences_dateKey_key" ON "reservation_folio_sequences"("dateKey");

-- CreateIndex
CREATE INDEX "reservation_traces_reservationId_idx" ON "reservation_traces"("reservationId");

-- CreateIndex
CREATE INDEX "reservation_traces_folio_idx" ON "reservation_traces"("folio");

-- CreateIndex
CREATE INDEX "reservation_traces_createdAt_idx" ON "reservation_traces"("createdAt");

-- CreateIndex
CREATE INDEX "Coupon_code_idx" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_packageId_idx" ON "Coupon"("packageId");

-- CreateIndex
CREATE INDEX "Coupon_campaignId_idx" ON "Coupon"("campaignId");

-- CreateIndex
CREATE INDEX "Coupon_isActive_idx" ON "Coupon"("isActive");

-- CreateIndex
CREATE INDEX "Payment_reservationId_idx" ON "Payment"("reservationId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Reservation_folio_idx" ON "Reservation"("folio");

-- CreateIndex
CREATE INDEX "Reservation_packageId_idx" ON "Reservation"("packageId");

-- CreateIndex
CREATE INDEX "Reservation_visitDate_idx" ON "Reservation"("visitDate");

-- CreateIndex
CREATE INDEX "Reservation_createdAt_idx" ON "Reservation"("createdAt");

-- CreateIndex
CREATE INDEX "ReservationExtra_code_idx" ON "ReservationExtra"("code");

-- AddForeignKey
ALTER TABLE "PackageTranslation" ADD CONSTRAINT "PackageTranslation_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageExtra" ADD CONSTRAINT "PackageExtra_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageExtraTranslation" ADD CONSTRAINT "PackageExtraTranslation_extraId_fkey" FOREIGN KEY ("extraId") REFERENCES "PackageExtra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_traces" ADD CONSTRAINT "reservation_traces_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationExtra" ADD CONSTRAINT "ReservationExtra_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
