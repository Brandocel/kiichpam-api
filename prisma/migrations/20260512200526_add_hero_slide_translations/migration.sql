-- AlterTable
ALTER TABLE "Package" ALTER COLUMN "codigoweb" SET DEFAULT nextval('package_web_code_seq'::regclass),
ALTER COLUMN "codigoweb" DROP DEFAULT;
DROP SEQUENCE "package_web_code_seq";

-- CreateTable
CREATE TABLE "hero_carousel_slide_translations" (
    "id" TEXT NOT NULL,
    "slideId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "linkText" TEXT,
    "altText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_carousel_slide_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hero_carousel_slide_translations_slideId_idx" ON "hero_carousel_slide_translations"("slideId");

-- CreateIndex
CREATE INDEX "hero_carousel_slide_translations_lang_idx" ON "hero_carousel_slide_translations"("lang");

-- CreateIndex
CREATE UNIQUE INDEX "hero_carousel_slide_translations_slideId_lang_key" ON "hero_carousel_slide_translations"("slideId", "lang");

-- AddForeignKey
ALTER TABLE "hero_carousel_slide_translations" ADD CONSTRAINT "hero_carousel_slide_translations_slideId_fkey" FOREIGN KEY ("slideId") REFERENCES "hero_carousel_slides"("id") ON DELETE CASCADE ON UPDATE CASCADE;
