/*
  Warnings:

  - You are about to drop the column `basePriceMXN` on the `Package` table. All the data in the column will be lost.
  - Added the required column `adultPriceMXN` to the `Package` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Package" DROP COLUMN "basePriceMXN",
ADD COLUMN     "adultPriceMXN" INTEGER NOT NULL,
ADD COLUMN     "childPriceMXN" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "infantPriceMXN" INTEGER NOT NULL DEFAULT 0;
