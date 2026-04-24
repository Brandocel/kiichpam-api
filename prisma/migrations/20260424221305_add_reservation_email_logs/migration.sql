-- CreateTable
CREATE TABLE "reservation_email_logs" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'RESEND',
    "providerId" TEXT,
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservation_email_logs_reservationId_idx" ON "reservation_email_logs"("reservationId");

-- CreateIndex
CREATE INDEX "reservation_email_logs_folio_idx" ON "reservation_email_logs"("folio");

-- CreateIndex
CREATE INDEX "reservation_email_logs_status_idx" ON "reservation_email_logs"("status");
