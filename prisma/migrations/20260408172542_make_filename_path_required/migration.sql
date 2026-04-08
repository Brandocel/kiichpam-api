-- Primero llenamos los valores NULL existentes
UPDATE "MediaAsset"
SET filename = 'legacy-' || id || '.jpg',   -- o el nombre que quieras
    path     = 'uploads/legacy/' || id || '.jpg'
WHERE filename IS NULL OR path IS NULL;

-- Luego hacemos las columnas required
ALTER TABLE "MediaAsset" 
ALTER COLUMN "filename" SET NOT NULL,
ALTER COLUMN "path" SET NOT NULL;