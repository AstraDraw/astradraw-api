-- AlterTable: Make oidcId optional and add passwordHash for local auth
ALTER TABLE "users" ALTER COLUMN "oidcId" DROP NOT NULL;

-- AddColumn: passwordHash for local user authentication
ALTER TABLE "users" ADD COLUMN "passwordHash" TEXT;
