-- AlterTable
ALTER TABLE "Member" ADD COLUMN "supabaseUserId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Member_supabaseUserId_key" ON "Member"("supabaseUserId");
