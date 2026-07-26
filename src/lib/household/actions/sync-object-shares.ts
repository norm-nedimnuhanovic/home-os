import "server-only";
import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/events/emit";

// Every Server Action that writes an entity with `visibility` needs to
// reconcile that entity's ObjectShare rows after the write. Identical for
// every entity — only moduleKey/objectType/objectId differ — so it's one
// platform-level helper, not copy-pasted per module (docs/forms.md §3.2).
export async function syncObjectShares(params: {
  householdId: string;
  moduleKey: string; // e.g. "tasks", "life_admin" — the Module.key this entity belongs to
  objectType: string; // e.g. "Task", "Contact" — matches ObjectShare.objectType
  objectId: string;
  sharedByMemberId: string; // must be the object's owner, or an admin/owner moderating
  sharedWithMemberIds: string[];
}) {
  const { householdId, moduleKey, objectType, objectId, sharedByMemberId, sharedWithMemberIds } = params;

  // Diffed against the previous set, purely to know who's newly shared with
  // (docs/email.md §2.1's share.received) — the rows themselves are still a
  // full delete-and-recreate rather than a real diff-update, since
  // ObjectShare carries no other state worth preserving and this keeps
  // every call site's own logic trivial (idempotent no matter what the
  // previous set was).
  const existingShares = await prisma.objectShare.findMany({
    where: { householdId, moduleKey, objectType, objectId },
    select: { sharedWithMemberId: true },
  });
  const previouslySharedWithIds = new Set(existingShares.map((share) => share.sharedWithMemberId));
  const newlySharedWithIds = sharedWithMemberIds.filter((id) => !previouslySharedWithIds.has(id));

  await prisma.objectShare.deleteMany({ where: { householdId, moduleKey, objectType, objectId } });
  if (sharedWithMemberIds.length > 0) {
    await prisma.objectShare.createMany({
      data: sharedWithMemberIds.map((sharedWithMemberId) => ({
        householdId,
        moduleKey,
        objectType,
        objectId,
        sharedWithMemberId,
        sharedByMemberId,
      })),
    });
  }

  for (const sharedWithMemberId of newlySharedWithIds) {
    await emitEvent(
      householdId,
      "share.received",
      { moduleKey, objectType, objectId, sharedWithMemberId, sharedByMemberId },
      sharedByMemberId,
    );
  }
}
