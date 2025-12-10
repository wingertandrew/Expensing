-- AlterTable
ALTER TABLE "users" ADD COLUMN "is_admin" BOOLEAN NOT NULL DEFAULT false;

-- Set the first user (self-hosted user) as admin
UPDATE "users" SET "is_admin" = true WHERE "email" = 'taxhacker@localhost';
