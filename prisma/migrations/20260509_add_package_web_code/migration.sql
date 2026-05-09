CREATE SEQUENCE IF NOT EXISTS package_web_code_seq
  START WITH 10000
  INCREMENT BY 1
  MINVALUE 10000;

ALTER TABLE "Package"
ADD COLUMN IF NOT EXISTS "codigoweb" INTEGER;

WITH numbered_packages AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "Package"
  WHERE "codigoweb" IS NULL
)
UPDATE "Package" AS p
SET "codigoweb" = 9999 + numbered_packages.rn
FROM numbered_packages
WHERE p."id" = numbered_packages."id";

SELECT setval(
  'package_web_code_seq',
  GREATEST(
    (
      SELECT COALESCE(MAX("codigoweb"), 9999) + 1
      FROM "Package"
    ),
    10000
  ),
  false
);

ALTER TABLE "Package"
ALTER COLUMN "codigoweb" SET DEFAULT nextval('package_web_code_seq'::regclass);

ALTER TABLE "Package"
ALTER COLUMN "codigoweb" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Package_codigoweb_key"
ON "Package"("codigoweb");