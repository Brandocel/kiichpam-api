-- CreateEnum
CREATE TYPE "SalesAgentType" AS ENUM ('INTERNAL', 'HOTEL', 'TAXI', 'AGENCY', 'INFLUENCER', 'OTHER');

-- CreateTable
CREATE TABLE "sales_agents" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "type" "SalesAgentType" NOT NULL DEFAULT 'INTERNAL',
    "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_agents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_agents_code_key" ON "sales_agents"("code");

-- CreateIndex
CREATE INDEX "sales_agents_code_idx" ON "sales_agents"("code");

-- CreateIndex
CREATE INDEX "sales_agents_isActive_idx" ON "sales_agents"("isActive");

-- CreateIndex
CREATE INDEX "sales_agents_type_idx" ON "sales_agents"("type");

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN "salesAgentId" TEXT,
ADD COLUMN "salesAgentCode" TEXT,
ADD COLUMN "agentCommissionPercent" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Reservation_salesAgentId_idx" ON "Reservation"("salesAgentId");

-- CreateIndex
CREATE INDEX "Reservation_salesAgentCode_idx" ON "Reservation"("salesAgentCode");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_salesAgentId_fkey" FOREIGN KEY ("salesAgentId") REFERENCES "sales_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
