-- CreateTable
CREATE TABLE "promotion_translations" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "description" TEXT,
    "buttonText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promotion_translations_promotionId_idx" 
ON "promotion_translations"("promotionId");

-- CreateIndex
CREATE INDEX "promotion_translations_lang_idx" 
ON "promotion_translations"("lang");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_translations_promotionId_lang_key" 
ON "promotion_translations"("promotionId", "lang");

-- AddForeignKey
ALTER TABLE "promotion_translations" 
ADD CONSTRAINT "promotion_translations_promotionId_fkey" 
FOREIGN KEY ("promotionId") 
REFERENCES "promotions"("id") 
ON DELETE CASCADE 
ON UPDATE CASCADE;