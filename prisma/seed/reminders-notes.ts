import { prisma } from "../../src/lib/db";
import type { Household, Member, Task } from "@prisma/client";

// Reminder creation here is a direct, hand-rolled prisma.reminder.create()
// — NOT a call to createReminder() (@/modules/reminders). That function's
// module chain transitively imports src/lib/email/send-category-email.tsx
// (via emitReminderCreated -> emitEvent -> dispatchToSubscribers ->
// fanOutNotificationsForOccurrence), which carries `import "server-only"`.
// Confirmed empirically: `tsx`-executing anything that imports
// @/modules/reminders throws `Cannot find module 'server-only'` (same
// class of gotcha as docs/toolkit.md §1 point 3, just reached through a
// different chain this time — the reminders module itself is tsx-safe,
// but its own event-emission side effect isn't). Reusing the real action
// isn't an option here the way seedModuleGrantsForHousehold()/
// seedStarterCategories() are reused elsewhere in this seed — this file
// mirrors what createReminder() would have written instead.
export async function seedRemindersAndNotes(household: Household, members: { owner: Member; admin: Member; member: Member }, tasks: { boardTask: Task }) {
  const { owner, admin, member } = members;

  await prisma.reminder.create({
    data: {
      householdId: household.id,
      title: "Call the plumber about the leak",
      reminderType: "one_off",
      targetMemberId: owner.id,
      createdByMemberId: owner.id,
      sourceType: "manual",
      firstRemindAt: inDays(1),
      status: "active",
      emailEnabled: true,
      occurrences: { create: [{ householdId: household.id, remindAt: inDays(1), status: "pending" }] },
    },
  });

  const standardNote = await prisma.note.create({
    data: {
      householdId: household.id,
      authorMemberId: admin.id,
      title: "Wifi password for guests",
      body: "Network: RiveraHome-Guest — password is on the fridge whiteboard.",
      noteType: "standard",
      visibility: "household",
      links: {
        create: [
          {
            householdId: household.id,
            linkedEntityModule: "tasks",
            linkedEntityType: "task",
            linkedEntityId: tasks.boardTask.id,
            linkedTaskId: tasks.boardTask.id,
            createdByMemberId: admin.id,
          },
        ],
      },
    },
  });

  // Journal — one entry per member per day (@@unique([authorMemberId, entryDate])).
  const journalNote = await prisma.note.create({
    data: {
      householdId: household.id,
      authorMemberId: member.id,
      title: null,
      body: "Long day — finally finished unpacking the last moving box.",
      noteType: "journal",
      entryDate: today(),
      visibility: "private",
    },
  });

  return { standardNote, journalNote };
}

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}
