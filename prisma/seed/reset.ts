import { prisma } from "../../src/lib/db";
import { SEED_HOUSEHOLD_ID } from "./constants";

// Household-scoped seed data uses delete-then-recreate (docs/seeding.md §3),
// so every seed run starts by clearing out whatever the last run left
// behind. Children before parents, in real FK dependency order (verified
// against the actual prisma/schema.prisma relations, not assumed) — a
// leftover row should fail loudly here rather than a silent cascade
// quietly deleting more than intended.
//
// Deliberately does NOT delete EventOccurrence/Notification rows beyond
// what's listed below — this seed never calls emitEvent() (see household.ts's
// own comment on why), so none exist for this household in the first place.
export async function resetSeedHousehold() {
  const householdId = SEED_HOUSEHOLD_ID;

  await prisma.$transaction([
    prisma.transactionSplit.deleteMany({ where: { householdId } }),
    prisma.settlement.deleteMany({ where: { householdId } }),
    prisma.transaction.deleteMany({ where: { householdId } }),
    prisma.reminderOccurrence.deleteMany({ where: { householdId } }),
    prisma.reminder.deleteMany({ where: { householdId } }),
    prisma.budget.deleteMany({ where: { householdId } }),
    prisma.subscription.deleteMany({ where: { householdId } }),
    prisma.category.deleteMany({ where: { householdId } }),
    prisma.document.deleteMany({ where: { householdId } }),
    prisma.renewal.deleteMany({ where: { householdId } }),
    prisma.contact.deleteMany({ where: { householdId } }),
    prisma.shoppingListItem.deleteMany({ where: { householdId } }),
    prisma.shoppingList.deleteMany({ where: { householdId } }),
    prisma.noteLink.deleteMany({ where: { householdId } }),
    prisma.noteTag.deleteMany({ where: { householdId } }),
    prisma.note.deleteMany({ where: { householdId } }),
    prisma.event.deleteMany({ where: { householdId } }),
    prisma.taskTag.deleteMany({ where: { householdId } }),
    prisma.task.deleteMany({ where: { householdId } }),
    prisma.taskRecurrenceRule.deleteMany({ where: { householdId } }),
    prisma.kanbanColumn.deleteMany({ where: { householdId } }),
    prisma.kanbanBoard.deleteMany({ where: { householdId } }),
    prisma.tag.deleteMany({ where: { householdId } }),
    prisma.objectShare.deleteMany({ where: { householdId } }),
    prisma.moduleGrant.deleteMany({ where: { householdId } }),
    prisma.notification.deleteMany({ where: { householdId } }),
    prisma.invite.deleteMany({ where: { householdId } }),
    prisma.member.deleteMany({ where: { householdId } }),
    prisma.household.deleteMany({ where: { id: householdId } }),
  ]);
}
