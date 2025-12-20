-- AstraDraw Database Schema
-- This migration creates all tables needed for the AstraDraw workspace system:
-- - Users (OIDC and local authentication)
-- - Scenes (Excalidraw drawings with metadata)
-- - Collections (folders for organizing scenes)
-- - TalktrackRecordings (video recordings linked to scenes)

-- CreateTable: Users
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "oidcId" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Scenes
CREATE TABLE "scenes" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "thumbnailUrl" TEXT,
    "storageKey" TEXT NOT NULL,
    "roomId" TEXT,
    "userId" TEXT NOT NULL,
    "collectionId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "lastOpenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Collections
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TalktrackRecordings
CREATE TABLE "talktrack_recordings" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kinescopeVideoId" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "processingStatus" TEXT NOT NULL DEFAULT 'processing',
    "sceneId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "talktrack_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Users
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_oidcId_key" ON "users"("oidcId");

-- CreateIndex: Scenes
CREATE UNIQUE INDEX "scenes_storageKey_key" ON "scenes"("storageKey");
CREATE INDEX "scenes_userId_idx" ON "scenes"("userId");
CREATE INDEX "scenes_collectionId_idx" ON "scenes"("collectionId");

-- CreateIndex: Collections
CREATE INDEX "collections_userId_idx" ON "collections"("userId");

-- CreateIndex: TalktrackRecordings
CREATE UNIQUE INDEX "talktrack_recordings_kinescopeVideoId_key" ON "talktrack_recordings"("kinescopeVideoId");
CREATE INDEX "talktrack_recordings_sceneId_idx" ON "talktrack_recordings"("sceneId");
CREATE INDEX "talktrack_recordings_userId_idx" ON "talktrack_recordings"("userId");

-- AddForeignKey: Scenes -> Users
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Scenes -> Collections
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Collections -> Users
ALTER TABLE "collections" ADD CONSTRAINT "collections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: TalktrackRecordings -> Scenes
ALTER TABLE "talktrack_recordings" ADD CONSTRAINT "talktrack_recordings_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: TalktrackRecordings -> Users
ALTER TABLE "talktrack_recordings" ADD CONSTRAINT "talktrack_recordings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

