-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'INCOMPLETE', 'PENDING_VERIFICATION', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "DocumentCategory" ADD VALUE 'ADDRESS_PROOF';
ALTER TYPE "FileOwnerType" ADD VALUE 'KYC';

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "gender" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "pinCode" TEXT,
ADD COLUMN "panEnc" TEXT,
ADD COLUMN "panLast4" TEXT,
ADD COLUMN "govIdType" TEXT,
ADD COLUMN "govIdNumberEnc" TEXT,
ADD COLUMN "govIdLast4" TEXT,
ADD COLUMN "kycStatus" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "kycSubmittedAt" TIMESTAMP(3),
ADD COLUMN "kycReviewedAt" TIMESTAMP(3),
ADD COLUMN "kycReviewedById" TEXT,
ADD COLUMN "kycRejectionReason" TEXT,
ADD COLUMN "kycDeclarationAt" TIMESTAMP(3);

CREATE INDEX "Employee_kycStatus_idx" ON "Employee"("kycStatus");

ALTER TABLE "Employee" ADD CONSTRAINT "Employee_kycReviewedById_fkey" FOREIGN KEY ("kycReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
