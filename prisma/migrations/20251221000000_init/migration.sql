-- AstraDraw Complete Database Schema
-- Consolidated migration for fresh installations
-- 
-- This migration creates all tables needed for AstraDraw:
-- - Users (OIDC and local authentication, super admin flag)
-- - Workspaces (personal and shared, with types)
-- - WorkspaceMembers (user membership with roles)
-- - Teams (named groups within workspaces)
-- - TeamMembers (team membership)
-- - TeamCollections (team access to collections with access levels)
-- - Collections (folders for organizing scenes)
-- - Scenes (Excalidraw drawings with collaboration support)
-- - TalktrackRecordings (video recordings linked to scenes)
-- - InviteLinks (shareable workspace invitations)

-- =============================================================================
-- Enums
-- =============================================================================

-- WorkspaceRole: defines user permissions within a workspace
CREATE TYPE "WorkspaceRole" AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');

-- WorkspaceType: distinguishes personal workspaces from shared ones
CREATE TYPE "WorkspaceType" AS ENUM ('PERSONAL', 'SHARED');

-- CollectionAccessLevel: defines team access level to collections
CREATE TYPE "CollectionAccessLevel" AS ENUM ('VIEW', 'EDIT');

-- =============================================================================
-- Users Table
-- =============================================================================

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "oidcId" TEXT,
    "passwordHash" TEXT,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_oidcId_key" ON "users"("oidcId");

-- =============================================================================
-- Workspaces Table
-- =============================================================================

CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "type" "WorkspaceType" NOT NULL DEFAULT 'PERSONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- =============================================================================
-- Workspace Members Table
-- =============================================================================

CREATE TABLE "workspace_members" (
    "id" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_members_workspaceId_userId_key" ON "workspace_members"("workspaceId", "userId");
CREATE INDEX "workspace_members_workspaceId_idx" ON "workspace_members"("workspaceId");
CREATE INDEX "workspace_members_userId_idx" ON "workspace_members"("userId");

ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspaceId_fkey" 
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Invite Links Table
-- =============================================================================

CREATE TABLE "invite_links" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "workspaceId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invite_links_code_key" ON "invite_links"("code");
CREATE INDEX "invite_links_workspaceId_idx" ON "invite_links"("workspaceId");

ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_workspaceId_fkey" 
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Teams Table
-- =============================================================================

CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "teams_workspaceId_idx" ON "teams"("workspaceId");

ALTER TABLE "teams" ADD CONSTRAINT "teams_workspaceId_fkey" 
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Team Members Table
-- =============================================================================

CREATE TABLE "team_members" (
    "teamId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("teamId","memberId")
);

ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_fkey" 
    FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_memberId_fkey" 
    FOREIGN KEY ("memberId") REFERENCES "workspace_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Collections Table
-- =============================================================================

CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "collections_userId_idx" ON "collections"("userId");
CREATE INDEX "collections_workspaceId_idx" ON "collections"("workspaceId");

ALTER TABLE "collections" ADD CONSTRAINT "collections_workspaceId_fkey" 
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Team Collections Table (access matrix)
-- =============================================================================

CREATE TABLE "team_collections" (
    "teamId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "accessLevel" "CollectionAccessLevel" NOT NULL DEFAULT 'EDIT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_collections_pkey" PRIMARY KEY ("teamId","collectionId")
);

ALTER TABLE "team_collections" ADD CONSTRAINT "team_collections_teamId_fkey" 
    FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_collections" ADD CONSTRAINT "team_collections_collectionId_fkey" 
    FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Scenes Table
-- =============================================================================

CREATE TABLE "scenes" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "thumbnailUrl" TEXT,
    "storageKey" TEXT NOT NULL,
    "roomId" TEXT,
    "roomKeyEncrypted" TEXT,
    "collaborationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    "collectionId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "lastOpenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scenes_storageKey_key" ON "scenes"("storageKey");
CREATE INDEX "scenes_userId_idx" ON "scenes"("userId");
CREATE INDEX "scenes_collectionId_idx" ON "scenes"("collectionId");

ALTER TABLE "scenes" ADD CONSTRAINT "scenes_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_collectionId_fkey" 
    FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- Talktrack Recordings Table
-- =============================================================================

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

CREATE UNIQUE INDEX "talktrack_recordings_kinescopeVideoId_key" ON "talktrack_recordings"("kinescopeVideoId");
CREATE INDEX "talktrack_recordings_sceneId_idx" ON "talktrack_recordings"("sceneId");
CREATE INDEX "talktrack_recordings_userId_idx" ON "talktrack_recordings"("userId");

ALTER TABLE "talktrack_recordings" ADD CONSTRAINT "talktrack_recordings_sceneId_fkey" 
    FOREIGN KEY ("sceneId") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "talktrack_recordings" ADD CONSTRAINT "talktrack_recordings_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

