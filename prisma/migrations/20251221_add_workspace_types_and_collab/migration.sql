-- CreateEnum
CREATE TYPE "WorkspaceType" AS ENUM ('PERSONAL', 'SHARED');

-- CreateEnum
CREATE TYPE "CollectionAccessLevel" AS ENUM ('VIEW', 'EDIT');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "type" "WorkspaceType" NOT NULL DEFAULT 'PERSONAL';

-- AlterTable
ALTER TABLE "team_collections" DROP COLUMN "canWrite",
ADD COLUMN     "accessLevel" "CollectionAccessLevel" NOT NULL DEFAULT 'EDIT';

-- AlterTable
ALTER TABLE "scenes" ADD COLUMN     "collaborationEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "roomKeyEncrypted" TEXT;

