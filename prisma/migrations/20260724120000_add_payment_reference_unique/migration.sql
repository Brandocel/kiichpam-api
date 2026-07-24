-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_reservationId_reference_key"
ON "Payment"("reservationId", "reference");
