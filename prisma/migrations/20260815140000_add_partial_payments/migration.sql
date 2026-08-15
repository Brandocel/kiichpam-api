-- Cobros parciales / anticipos.
-- `paidMXN` guarda lo efectivamente liquidado (en centavos) y `kind` distingue
-- un anticipo de un cobro completo o de una liquidación en sitio.

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN "paidMXN" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'FULL';

-- Backfill: las reservaciones ya pagadas quedan con su total como monto
-- liquidado, para que el saldo pendiente arranque en cero y no aparezcan
-- como si debieran dinero.
UPDATE "Reservation"
SET "paidMXN" = "totalMXN"
WHERE "status" = 'PAID';

-- El resto toma la suma de sus pagos liquidados, si tiene alguno.
UPDATE "Reservation" r
SET "paidMXN" = COALESCE(sumas.total, 0)
FROM (
  SELECT "reservationId", SUM("amountMXN") AS total
  FROM "Payment"
  WHERE "status" = 'SUCCEEDED'
  GROUP BY "reservationId"
) sumas
WHERE r."id" = sumas."reservationId"
  AND r."status" <> 'PAID';
