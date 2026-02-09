/*
  Warnings:

  - Changed the type of `type` on the `Coupon` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `scope` on the `Coupon` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "CouponScope" AS ENUM ('ALL', 'PACKAGE_ONLY', 'CAMPAIGN_ONLY');

-- AlterTable
ALTER TABLE "Coupon" DROP COLUMN "type",
ADD COLUMN     "type" "CouponType" NOT NULL,
DROP COLUMN "scope",
ADD COLUMN     "scope" "CouponScope" NOT NULL;
