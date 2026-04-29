-- CreateEnum
CREATE TYPE "AgentConversationStatus" AS ENUM ('BOT_ACTIVE', 'HUMAN_ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "AgentMessageSender" AS ENUM ('CUSTOMER', 'BOT', 'HUMAN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AgentMessageChannel" AS ENUM ('WHATSAPP', 'WEB');

-- CreateEnum
CREATE TYPE "AgentMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateTable
CREATE TABLE "agent_conversations" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "channel" "AgentMessageChannel" NOT NULL DEFAULT 'WHATSAPP',
    "status" "AgentConversationStatus" NOT NULL DEFAULT 'BOT_ACTIVE',
    "botEnabled" BOOLEAN NOT NULL DEFAULT true,
    "humanMode" BOOLEAN NOT NULL DEFAULT false,
    "assignedTo" TEXT,
    "assignedAt" TIMESTAMP(3),
    "lastIntent" TEXT,
    "lastIntentScore" DOUBLE PRECISION,
    "lastMessage" TEXT,
    "matchedWords" JSONB,
    "packageCode" TEXT,
    "visitDate" TEXT,
    "adults" INTEGER,
    "children" INTEGER,
    "infants" INTEGER,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "lastCustomerAt" TIMESTAMP(3),
    "lastBotAt" TIMESTAMP(3),
    "lastHumanAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_conversation_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sender" "AgentMessageSender" NOT NULL,
    "channel" "AgentMessageChannel" NOT NULL DEFAULT 'WHATSAPP',
    "direction" "AgentMessageDirection" NOT NULL,
    "message" TEXT NOT NULL,
    "intent" TEXT,
    "intentScore" DOUBLE PRECISION,
    "packageCode" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_conversations_sessionId_key" ON "agent_conversations"("sessionId");

-- CreateIndex
CREATE INDEX "agent_conversations_sessionId_idx" ON "agent_conversations"("sessionId");

-- CreateIndex
CREATE INDEX "agent_conversations_status_idx" ON "agent_conversations"("status");

-- CreateIndex
CREATE INDEX "agent_conversations_botEnabled_idx" ON "agent_conversations"("botEnabled");

-- CreateIndex
CREATE INDEX "agent_conversations_humanMode_idx" ON "agent_conversations"("humanMode");

-- CreateIndex
CREATE INDEX "agent_conversations_packageCode_idx" ON "agent_conversations"("packageCode");

-- CreateIndex
CREATE INDEX "agent_conversations_lastCustomerAt_idx" ON "agent_conversations"("lastCustomerAt");

-- CreateIndex
CREATE INDEX "agent_conversation_messages_conversationId_idx" ON "agent_conversation_messages"("conversationId");

-- CreateIndex
CREATE INDEX "agent_conversation_messages_sender_idx" ON "agent_conversation_messages"("sender");

-- CreateIndex
CREATE INDEX "agent_conversation_messages_direction_idx" ON "agent_conversation_messages"("direction");

-- CreateIndex
CREATE INDEX "agent_conversation_messages_intent_idx" ON "agent_conversation_messages"("intent");

-- CreateIndex
CREATE INDEX "agent_conversation_messages_createdAt_idx" ON "agent_conversation_messages"("createdAt");

-- AddForeignKey
ALTER TABLE "agent_conversation_messages" ADD CONSTRAINT "agent_conversation_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
