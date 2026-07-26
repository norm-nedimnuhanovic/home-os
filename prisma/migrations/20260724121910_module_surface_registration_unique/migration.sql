-- DropIndex
DROP INDEX "ModuleSurfaceRegistration_moduleId_idx";

-- CreateIndex
-- Needed so the platform-catalog seed can upsert on (moduleId, surface,
-- target) instead of inserting duplicates on every re-seed (docs/seeding.md §5.3).
CREATE UNIQUE INDEX "ModuleSurfaceRegistration_moduleId_surface_target_key" ON "ModuleSurfaceRegistration"("moduleId", "surface", "target");
