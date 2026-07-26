import { prisma } from "../../src/lib/db";
import type { Household, Member } from "@prisma/client";

export async function seedLifeAdmin(household: Household, members: { owner: Member; admin: Member; member: Member }) {
  const { owner, admin, member } = members;

  const renewal = await prisma.renewal.create({
    data: {
      householdId: household.id,
      title: "Car registration",
      type: "registration_license",
      provider: "State DMV",
      purchaseOrIssueDate: monthsAgo(11),
      expiryDate: inDays(25),
      reminderOffsetsDays: [30, 7],
      recurrence: "annual",
      status: "active",
      responsibleMemberId: owner.id,
      visibility: "household",
      createdById: owner.id,
    },
  });

  // One Reminder per reminderOffsetsDays entry — what
  // regenerateRenewalReminders() (real code, called from createRenewal())
  // would have created. Hand-rolled instead of calling that function
  // directly: it calls createReminder() (@/modules/reminders), whose
  // module chain isn't tsx-safe (see reminders-notes.ts's comment) — this
  // seed script runs under tsx, not Next's bundler.
  await prisma.reminder.createMany({
    data: renewal.reminderOffsetsDays.map((offsetDays) => ({
      householdId: household.id,
      title: `${renewal.title} expires ${offsetDays === 0 ? "today" : `in ${offsetDays} day${offsetDays === 1 ? "" : "s"}`}`,
      reminderType: "one_off" as const,
      targetMemberId: renewal.responsibleMemberId!,
      createdByMemberId: owner.id,
      sourceType: "renewal" as const,
      sourceModule: "life_admin",
      sourceEntityId: renewal.id,
      // The polymorphic convenience FK, matching what createReminder()
      // itself now sets (a real bug fixed this phase — see
      // create-reminder.ts's own comment) — kept consistent here since this
      // hand-rolls the same shape that function would have written.
      sourceRenewalId: renewal.id,
      firstRemindAt: subtractDays(renewal.expiryDate, offsetDays),
      status: "active" as const,
      emailEnabled: true,
    })),
  });
  // createMany() can't do a nested occurrences create — add them separately.
  const renewalReminders = await prisma.reminder.findMany({
    where: { householdId: household.id, sourceType: "renewal", sourceEntityId: renewal.id },
  });
  await prisma.reminderOccurrence.createMany({
    data: renewalReminders.map((reminder) => ({
      householdId: household.id,
      reminderId: reminder.id,
      remindAt: reminder.firstRemindAt,
      status: "pending" as const,
    })),
  });

  const contact = await prisma.contact.create({
    data: {
      householdId: household.id,
      name: "Dr. Alvarez — Family Physician",
      category: "medical",
      phone: "+1-555-0142",
      visibility: "household",
      createdById: admin.id,
    },
  });

  const shoppingList = await prisma.shoppingList.create({
    data: {
      householdId: household.id,
      name: "Weekly groceries",
      type: "shopping",
      visibility: "household",
      createdById: admin.id,
      items: {
        create: [
          { householdId: household.id, name: "Milk", quantity: "2", addedById: admin.id, sortOrder: 0 },
          { householdId: household.id, name: "Eggs", quantity: "1 dozen", addedById: admin.id, sortOrder: 1 },
          // Checked, but note: checking an item never auto-creates a
          // Finance Transaction (plan.md) — that stays a separate,
          // explicit manual step this seed does NOT perform.
          {
            householdId: household.id,
            name: "Bin liners",
            quantity: "1 box",
            addedById: member.id,
            isChecked: true,
            checkedById: member.id,
            checkedAt: new Date(),
            sortOrder: 2,
          },
        ],
      },
    },
  });

  return { renewal, contact, shoppingList };
}

function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}
function monthsAgo(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}
function subtractDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() - n);
  return d;
}
