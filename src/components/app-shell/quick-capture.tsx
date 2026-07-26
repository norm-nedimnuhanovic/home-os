import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { getMembers } from "@/lib/household";
import { getHouseholdTags } from "@/modules/tasks";
import { QuickCaptureButton } from "./quick-capture-button";

// Cross-module composite (docs/project-structure.md §8), same shape as
// Nav: a module plugs into quick capture purely by seeding a
// `quick_capture_target` ModuleSurfaceRegistration row — this file never
// hardcodes which modules are captureable (plan.md §4.1).
export async function QuickCapture() {
  const member = await requireMember();
  if (!member) return null;

  const [registrations, members, tags] = await Promise.all([
    prisma.moduleSurfaceRegistration.findMany({
      where: { surface: "quick_capture_target", enabled: true, module: { status: "active" } },
      orderBy: { sortOrder: "asc" },
      include: { module: { select: { key: true } } },
    }),
    getMembers(member.householdId),
    getHouseholdTags(member.householdId),
  ]);

  const targets = registrations
    .map((r) => ({ moduleKey: r.module.key, label: r.label }))
    .filter((t) => t.moduleKey === "tasks" || t.moduleKey === "notes" || t.moduleKey === "reminders");

  if (targets.length === 0) return null;

  return <QuickCaptureButton targets={targets} members={members} tags={tags} />;
}
