-- AstraDraw Workspaces, Teams, and Collections Migration
-- This migration adds:
-- - Workspaces (shared collaboration spaces)
-- - WorkspaceMembers (user membership with roles)
-- - Teams (named groups within workspaces)
-- - TeamMembers (team membership)
-- - TeamCollections (team access to collections)
-- - InviteLinks (shareable workspace invitations)
-- - Updates Collections to support workspaces

-- CreateEnum: WorkspaceRole
CREATE TYPE "WorkspaceRole" AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');

-- CreateTable: Workspaces
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WorkspaceMembers
CREATE TABLE "workspace_members" (
    "id" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable: InviteLinks
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

-- CreateTable: Teams
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TeamMembers
CREATE TABLE "team_members" (
    "teamId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("teamId","memberId")
);

-- CreateTable: TeamCollections
CREATE TABLE "team_collections" (
    "teamId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "canWrite" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_collections_pkey" PRIMARY KEY ("teamId","collectionId")
);

-- CreateIndex: Workspaces
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex: WorkspaceMembers
CREATE UNIQUE INDEX "workspace_members_workspaceId_userId_key" ON "workspace_members"("workspaceId", "userId");
CREATE INDEX "workspace_members_workspaceId_idx" ON "workspace_members"("workspaceId");
CREATE INDEX "workspace_members_userId_idx" ON "workspace_members"("userId");

-- CreateIndex: InviteLinks
CREATE UNIQUE INDEX "invite_links_code_key" ON "invite_links"("code");
CREATE INDEX "invite_links_workspaceId_idx" ON "invite_links"("workspaceId");

-- CreateIndex: Teams
CREATE INDEX "teams_workspaceId_idx" ON "teams"("workspaceId");

-- AlterTable: Collections - Add workspace support
ALTER TABLE "collections" ADD COLUMN "icon" TEXT;
ALTER TABLE "collections" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "collections" ADD COLUMN "workspaceId" TEXT;

-- CreateIndex: Collections workspaceId
CREATE INDEX "collections_workspaceId_idx" ON "collections"("workspaceId");

-- AddForeignKey: WorkspaceMembers -> Workspaces
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: WorkspaceMembers -> Users
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: InviteLinks -> Workspaces
ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Teams -> Workspaces
ALTER TABLE "teams" ADD CONSTRAINT "teams_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: TeamMembers -> Teams
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: TeamMembers -> WorkspaceMembers
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "workspace_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: TeamCollections -> Teams
ALTER TABLE "team_collections" ADD CONSTRAINT "team_collections_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: TeamCollections -> Collections
ALTER TABLE "team_collections" ADD CONSTRAINT "team_collections_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Collections -> Workspaces (nullable for migration)
ALTER TABLE "collections" ADD CONSTRAINT "collections_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropForeignKey: Collections -> Users (we keep userId but remove the FK constraint)
ALTER TABLE "collections" DROP CONSTRAINT "collections_userId_fkey";

-- =============================================================================
-- Data Migration: Create personal workspaces for existing users
-- =============================================================================

-- Create a personal workspace for each existing user
INSERT INTO "workspaces" ("id", "name", "slug", "createdAt", "updatedAt")
SELECT 
    'ws_' || "id",
    COALESCE("name", 'Personal') || '''s Workspace',
    LOWER(REPLACE(REPLACE("email", '@', '_at_'), '.', '_')),
    NOW(),
    NOW()
FROM "users";

-- Add each user as ADMIN of their personal workspace
INSERT INTO "workspace_members" ("id", "role", "workspaceId", "userId", "createdAt", "updatedAt")
SELECT 
    'wm_' || "id",
    'ADMIN'::"WorkspaceRole",
    'ws_' || "id",
    "id",
    NOW(),
    NOW()
FROM "users";

-- Move existing collections to their owner's personal workspace
UPDATE "collections" 
SET "workspaceId" = 'ws_' || "userId"
WHERE "workspaceId" IS NULL;

-- Now make workspaceId required
ALTER TABLE "collections" ALTER COLUMN "workspaceId" SET NOT NULL;

