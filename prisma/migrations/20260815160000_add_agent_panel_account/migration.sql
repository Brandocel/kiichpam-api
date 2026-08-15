-- Cuenta de panel para los agentes de reservas.
-- El nuevo valor del enum se agrega en su propia sentencia: PostgreSQL no
-- permite usar un valor de enum en la misma transacción en que se crea, y aquí
-- solo lo declaramos, no lo asignamos.

-- AlterEnum
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'AGENT';

-- AlterTable
ALTER TABLE "sales_agents" ADD COLUMN "adminUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sales_agents_adminUserId_key" ON "sales_agents"("adminUserId");

-- AddForeignKey
ALTER TABLE "sales_agents" ADD CONSTRAINT "sales_agents_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
