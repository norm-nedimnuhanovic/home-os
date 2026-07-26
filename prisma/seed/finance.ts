import { prisma } from "../../src/lib/db";
import { seedStarterCategories } from "../../src/modules/finance/actions/seed-starter-categories";
import type { Household, Member } from "@prisma/client";

export async function seedFinance(household: Household, members: { owner: Member; admin: Member; member: Member }) {
  const { owner, admin } = members;

  // Reuses the real starter-category list/function (the same one
  // signUpAndCreateHousehold() calls) rather than hand-rolling a second
  // copy — createMany() doesn't return rows, so fetch them back after.
  await seedStarterCategories(prisma, household.id);
  const categories = await prisma.category.findMany({ where: { householdId: household.id } });
  const groceries = categories.find((c) => c.name === "Groceries")!;
  const utilities = categories.find((c) => c.name === "Utilities")!;

  const subscription = await prisma.subscription.create({
    data: {
      householdId: household.id,
      name: "Internet service",
      merchant: "Comet Broadband",
      categoryId: utilities.id,
      amount: 65.0,
      frequency: "monthly",
      startDate: monthsAgo(6),
      nextDueDate: inDays(5),
      alertDaysBefore: 3,
      responsibleMemberId: admin.id,
      autoCreateTransaction: false,
      status: "active",
    },
  });

  // Simulates what subscriptions-sweep would have created once this
  // subscription entered its alert window — hand-rolled, not via
  // createReminder() (see reminders-notes.ts's comment on why: that
  // function's module chain isn't tsx-safe, and this seed script runs
  // under tsx).
  await prisma.reminder.create({
    data: {
      householdId: household.id,
      title: `${subscription.name} is due soon`,
      reminderType: "one_off",
      targetMemberId: subscription.responsibleMemberId,
      createdByMemberId: admin.id,
      sourceType: "subscription",
      sourceModule: "finance",
      sourceEntityId: subscription.id,
      // The polymorphic convenience FK, matching what createReminder()
      // itself now sets (a real bug fixed this phase — see
      // create-reminder.ts's own comment) — kept consistent here since this
      // hand-rolls the same shape that function would have written.
      sourceSubscriptionId: subscription.id,
      firstRemindAt: subtractDays(subscription.nextDueDate, subscription.alertDaysBefore),
      status: "active",
      emailEnabled: true,
      occurrences: {
        create: [
          {
            householdId: household.id,
            remindAt: subtractDays(subscription.nextDueDate, subscription.alertDaysBefore),
            status: "pending",
          },
        ],
      },
    },
  });

  // Equal split between owner (who paid) and admin (who owes their half) —
  // owner's own share is trivially settled; admin's is settled via the
  // Settlement below.
  const groceryRun = await prisma.transaction.create({
    data: {
      householdId: household.id,
      type: "expense",
      amount: 84.32,
      currency: household.baseCurrency,
      categoryId: groceries.id,
      title: "Weekly grocery run",
      date: inDays(-2),
      paidById: owner.id,
      source: "manual",
      visibility: "household",
      splitType: "equal",
      status: "posted",
      splits: {
        create: [
          { householdId: household.id, memberId: owner.id, shareAmount: 42.16, settled: true },
          { householdId: household.id, memberId: admin.id, shareAmount: 42.16, settled: false },
        ],
      },
    },
    include: { splits: true },
  });
  const adminSplit = groceryRun.splits.find((s) => s.memberId === admin.id)!;

  // Settlement is the fact that flips TransactionSplit.settled in the real
  // app (settleTransactionSplits(), plan.md: "always derived, never edited
  // directly") — this seed sets both directly for brevity, bypassing that
  // Server Action; never do that outside a seed script.
  const settlement = await prisma.settlement.create({
    data: {
      householdId: household.id,
      fromMemberId: admin.id,
      toMemberId: owner.id,
      amount: 42.16,
      date: inDays(-1),
      method: "cash",
      status: "recorded",
      appliesTo: { connect: [{ id: adminSplit.id }] },
    },
  });
  await prisma.transactionSplit.update({
    where: { id: adminSplit.id, householdId: household.id },
    data: { settled: true, settledById: settlement.id },
  });

  const budget = await prisma.budget.create({
    data: {
      householdId: household.id,
      categoryId: groceries.id,
      memberId: null, // whole-household — alert notifies ALL members, not just whoever tipped it over
      period: "monthly",
      amount: 500,
      effectiveFrom: startOfMonth(),
      alertThresholdPercent: 80,
      alertOnExceeded: true,
      rolloverUnused: false,
    },
  });

  return { categories, subscription, groceryRun, settlement, budget };
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
function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
