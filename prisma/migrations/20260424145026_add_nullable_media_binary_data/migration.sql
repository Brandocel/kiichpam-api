DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'MediaAsset'
      AND column_name = 'data'
  ) THEN
    ALTER TABLE "MediaAsset" ADD COLUMN "data" BYTEA;
  ELSE
    ALTER TABLE "MediaAsset" ALTER COLUMN "data" DROP NOT NULL;
  END IF;
END $$;