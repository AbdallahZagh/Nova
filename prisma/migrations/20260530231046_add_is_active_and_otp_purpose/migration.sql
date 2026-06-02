-- AlterTable
ALTER TABLE "otps" ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'REGISTER';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false;
