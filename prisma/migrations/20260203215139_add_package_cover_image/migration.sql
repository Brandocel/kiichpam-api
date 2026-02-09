-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "coverMediaId" TEXT;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
