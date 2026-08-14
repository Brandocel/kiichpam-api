-- Token opaco para el link público del agente.
-- Se agrega nullable, se rellenan los agentes existentes y recién entonces se
-- vuelve obligatorio y único, para no romper filas ya creadas.

-- AlterTable
ALTER TABLE "sales_agents" ADD COLUMN "linkToken" TEXT;

-- Backfill: token derivado del id, en mayúsculas y sin guiones.
UPDATE "sales_agents"
SET "linkToken" = upper(substr(md5(random()::text || "id"), 1, 8))
WHERE "linkToken" IS NULL;

-- Si por colisión quedara algún duplicado, se vuelve a generar.
DO $$
DECLARE
  duplicated RECORD;
BEGIN
  LOOP
    SELECT "id" INTO duplicated
    FROM (
      SELECT "id", row_number() OVER (PARTITION BY "linkToken" ORDER BY "createdAt") AS position
      FROM "sales_agents"
    ) ranked
    WHERE position > 1
    LIMIT 1;

    EXIT WHEN NOT FOUND;

    UPDATE "sales_agents"
    SET "linkToken" = upper(substr(md5(random()::text || "id"), 1, 8))
    WHERE "id" = duplicated."id";
  END LOOP;
END $$;

-- AlterTable
ALTER TABLE "sales_agents" ALTER COLUMN "linkToken" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "sales_agents_linkToken_key" ON "sales_agents"("linkToken");

-- CreateIndex
CREATE INDEX "sales_agents_linkToken_idx" ON "sales_agents"("linkToken");
