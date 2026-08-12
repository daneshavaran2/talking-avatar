-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "AvatarProfile" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "landmarksJson" JSONB,
    "embeddingJson" JSONB,
    "idleLoopUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvatarProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceProfile" (
    "id" TEXT NOT NULL,
    "sourceAudioUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "providerName" TEXT NOT NULL,
    "providerVoiceId" TEXT,
    "durationSeconds" DOUBLE PRECISION,
    "consentConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),
    "consentIp" TEXT,
    "consentUserId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "pageCount" INTEGER,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "byteSize" INTEGER,
    "uploadKey" TEXT,
    "indexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "page" INTEGER,
    "section" TEXT,
    "ordinal" INTEGER NOT NULL DEFAULT 0,
    "tokenCount" INTEGER,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "summary" TEXT,
    "topic" TEXT,
    "inputMode" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "inputType" TEXT NOT NULL DEFAULT 'text',
    "topic" TEXT,
    "wasRefused" BOOLEAN NOT NULL DEFAULT false,
    "refusalReason" TEXT,
    "refusalLayer" TEXT,
    "injectionFlag" BOOLEAN NOT NULL DEFAULT false,
    "ragUsed" BOOLEAN NOT NULL DEFAULT false,
    "ragChunkIds" TEXT[],
    "latencyMs" INTEGER,
    "turnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turn" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "inputType" TEXT NOT NULL DEFAULT 'text',
    "vadStartAt" TIMESTAMP(3),
    "sttStartAt" TIMESTAMP(3),
    "sttEndAt" TIMESTAMP(3),
    "llmStartAt" TIMESTAMP(3),
    "firstTokenAt" TIMESTAMP(3),
    "ttsStartAt" TIMESTAMP(3),
    "firstAudioAt" TIMESTAMP(3),
    "avatarStartAt" TIMESTAMP(3),
    "firstFrameAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Turn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolCall" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "turnId" TEXT,
    "name" TEXT NOT NULL,
    "argumentsJson" JSONB NOT NULL,
    "resultJson" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "businessName" TEXT NOT NULL DEFAULT 'کسب‌وکار شما',
    "systemPrompt" TEXT NOT NULL,
    "llmProvider" TEXT NOT NULL DEFAULT 'gemini',
    "llmModel" TEXT NOT NULL DEFAULT 'gemini-2.0-flash',
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "maxTokens" INTEGER NOT NULL DEFAULT 1024,
    "ragTopK" INTEGER NOT NULL DEFAULT 5,
    "ragThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "blockedCategories" TEXT[],
    "refusalMessages" JSONB NOT NULL,
    "customBlockedKeywords" TEXT[],
    "enabledTools" TEXT[],
    "kioskResetSeconds" INTEGER NOT NULL DEFAULT 120,
    "setupCompleted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnansweredQuestion" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "askCount" INTEGER NOT NULL DEFAULT 1,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "lastAskedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnansweredQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceError" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" TEXT,
    "turnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvatarProfile_isActive_idx" ON "AvatarProfile"("isActive");

-- CreateIndex
CREATE INDEX "VoiceProfile_isActive_idx" ON "VoiceProfile"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Document_uploadKey_key" ON "Document"("uploadKey");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");

-- CreateIndex
CREATE INDEX "Conversation_startedAt_idx" ON "Conversation"("startedAt");

-- CreateIndex
CREATE INDEX "Conversation_topic_idx" ON "Conversation"("topic");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "Message_topic_idx" ON "Message"("topic");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- CreateIndex
CREATE INDEX "Message_wasRefused_idx" ON "Message"("wasRefused");

-- CreateIndex
CREATE INDEX "Turn_conversationId_idx" ON "Turn"("conversationId");

-- CreateIndex
CREATE INDEX "Turn_status_idx" ON "Turn"("status");

-- CreateIndex
CREATE INDEX "Turn_createdAt_idx" ON "Turn"("createdAt");

-- CreateIndex
CREATE INDEX "ToolCall_conversationId_idx" ON "ToolCall"("conversationId");

-- CreateIndex
CREATE INDEX "ToolCall_name_idx" ON "ToolCall"("name");

-- CreateIndex
CREATE INDEX "ToolCall_createdAt_idx" ON "ToolCall"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UnansweredQuestion_normalized_key" ON "UnansweredQuestion"("normalized");

-- CreateIndex
CREATE INDEX "UnansweredQuestion_resolved_idx" ON "UnansweredQuestion"("resolved");

-- CreateIndex
CREATE INDEX "UnansweredQuestion_askCount_idx" ON "UnansweredQuestion"("askCount");

-- CreateIndex
CREATE INDEX "ServiceError_service_idx" ON "ServiceError"("service");

-- CreateIndex
CREATE INDEX "ServiceError_createdAt_idx" ON "ServiceError"("createdAt");

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turn" ADD CONSTRAINT "Turn_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolCall" ADD CONSTRAINT "ToolCall_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── ایندکس برداری برای جستجوی شباهت (§۱۰.۱: بودجهٔ ۱۰۰ میلی‌ثانیه) ──
-- HNSW برای جستجوی تقریبی نزدیک‌ترین همسایه با فاصلهٔ کسینوسی.
CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw_idx"
    ON "DocumentChunk" USING hnsw ("embedding" vector_cosine_ops);
