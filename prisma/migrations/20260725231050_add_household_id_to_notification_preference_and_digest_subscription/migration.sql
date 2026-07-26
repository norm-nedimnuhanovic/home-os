/*
  Warnings:

  - Added the required column `householdId` to the `DigestSubscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `householdId` to the `NotificationPreference` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DigestSubscription" ADD COLUMN     "householdId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "householdId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "DigestSubscription_householdId_idx" ON "DigestSubscription"("householdId");

-- CreateIndex
CREATE INDEX "NotificationPreference_householdId_idx" ON "NotificationPreference"("householdId");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigestSubscription" ADD CONSTRAINT "DigestSubscription_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
