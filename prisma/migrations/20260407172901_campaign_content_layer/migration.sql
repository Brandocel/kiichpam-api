/*
  Warnings:

  - You are about to drop the column `duration` on the `MediaAsset` table. All the data in the column will be lost.
  - You are about to drop the column `filename` on the `MediaAsset` table. All the data in the column will be lost.
  - You are about to drop the column `height` on the `MediaAsset` table. All the data in the column will be lost.
  - You are about to drop the column `path` on the `MediaAsset` table. All the data in the column will be lost.
  - You are about to drop the column `width` on the `MediaAsset` table. All the data in the column will be lost.
  - You are about to drop the `HeroCarouselSlide` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "CampaignCategory" AS ENUM ('PRICE', 'CONTENT', 'MIXED');

-- CreateEnum
CREATE TYPE "CampaignEffectMode" AS ENUM ('MERGE', 'REPLACE');

-- DropForeignKey
ALTER TABLE "HeroCarouselSlide" DROP CONSTRAINT "HeroCarouselSlide_mediaId_fkey";

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "category" "CampaignCategory" NOT NULL DEFAULT 'PRICE';

-- AlterTable
ALTER TABLE "MediaAsset" DROP COLUMN "duration",
DROP COLUMN "filename",
DROP COLUMN "height",
DROP COLUMN "path",
DROP COLUMN "width";

-- DropTable
DROP TABLE "HeroCarouselSlide";

-- CreateTable
CREATE TABLE "CampaignTranslation" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "promoName" TEXT,
    "promoDescription" TEXT,
    "addIncludes" JSONB,
    "removeIncludes" JSONB,
    "addExcludes" JSONB,
    "removeExcludes" JSONB,
    "addNotes" JSONB,
    "removeNotes" JSONB,
    "imageMediaId" TEXT,
    "effectMode" "CampaignEffectMode" NOT NULL DEFAULT 'MERGE',

    CONSTRAINT "CampaignTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CampaignTranslation_campaignId_lang_key" ON "CampaignTranslation"("campaignId", "lang");

-- AddForeignKey
ALTER TABLE "CampaignTranslation" ADD CONSTRAINT "CampaignTranslation_imageMediaId_fkey" FOREIGN KEY ("imageMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTranslation" ADD CONSTRAINT "CampaignTranslation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
