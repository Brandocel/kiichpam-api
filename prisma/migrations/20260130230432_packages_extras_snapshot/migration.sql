-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "ageRules" JSONB;

-- AlterTable
ALTER TABLE "PackageTranslation" ADD COLUMN     "excludes" JSONB,
ADD COLUMN     "includes" JSONB,
ADD COLUMN     "notes" JSONB;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'MXN',
ADD COLUMN     "extrasMXN" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "snapshotAgeRules" JSONB,
ADD COLUMN     "snapshotDescription" TEXT,
ADD COLUMN     "snapshotExcludes" JSONB,
ADD COLUMN     "snapshotIncludes" JSONB,
ADD COLUMN     "snapshotLang" TEXT,
ADD COLUMN     "snapshotName" TEXT,
ADD COLUMN     "snapshotNotes" JSONB;

-- CreateTable
CREATE TABLE "PackageExtra" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "priceMXN" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PackageExtra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageExtraTranslation" (
    "id" TEXT NOT NULL,
    "extraId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "PackageExtraTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationExtra" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "extraId" TEXT,
    "code" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "priceMXN" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "name" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationExtra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PackageExtra_packageId_code_key" ON "PackageExtra"("packageId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PackageExtraTranslation_extraId_lang_key" ON "PackageExtraTranslation"("extraId", "lang");

-- CreateIndex
CREATE INDEX "ReservationExtra_reservationId_idx" ON "ReservationExtra"("reservationId");

-- AddForeignKey
ALTER TABLE "PackageExtra" ADD CONSTRAINT "PackageExtra_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageExtraTranslation" ADD CONSTRAINT "PackageExtraTranslation_extraId_fkey" FOREIGN KEY ("extraId") REFERENCES "PackageExtra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationExtra" ADD CONSTRAINT "ReservationExtra_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
