import { prisma } from "@/lib/db";
import { createReminder } from "@/modules/reminders";
import { getCurrentPeriodRange } from "../entities/budget";
import { emitBudgetThresholdExceeded } from "../events/emitters";

// docs/recipes.md §4.2's worked example, made real. Direct barrel import,
// not an EventSubscription (docs/recipes.md §4.1) — finance already
// declares a required dependsOnModules: ["reminders"].
//
// Looped per household, never a single cross-household bulk query — Budget
// is tenant-scoped (src/lib/db/tenant-guard.ts), so a single
// `findMany({ where: { alertOnExceeded: true } })` with no householdId
// throws `Refusing Budget.findMany: missing householdId` the instant this
// job actually runs against the real, guarded Prisma client. Confirmed
// empirically; the same bug affected every cron sweep job in the app — see
// ROADMAP.md.
export async function sweepBudgetThresholds() {
  const households = await prisma.household.findMany({ where: { status: "active" }, select: { id: true } });

  for (const { id: householdId } of households) {
    const budgets = await prisma.budget.findMany({
      where: { householdId, alertOnExceeded: true },
      include: { category: true },
    });

    for (const budget of budgets) {
      // "Current period" as of now, not as of effectiveFrom — matching
      // get-monthly-summary.ts's own interpretation of plan.md §3.4's
      // "the current period."
      const { start, end } = getCurrentPeriodRange(budget.period, new Date());

      const spendResult = await prisma.transaction.aggregate({
        where: {
          householdId,
          categoryId: budget.categoryId,
          type: "expense",
          status: "posted",
          date: { gte: start, lte: end },
          ...(budget.memberId ? { paidById: budget.memberId } : {}), // personal vs whole-household budget
        },
        _sum: { amount: true },
      });

      const spent = Number(spendResult._sum.amount ?? 0);
      const amount = Number(budget.amount);
      const percentUsed = amount > 0 ? (spent / amount) * 100 : 0;
      if (percentUsed < budget.alertThresholdPercent) continue;

      // Idempotency: don't re-fire on every sweep run once this period's
      // alert has already gone out.
      const alreadyAlerted = await prisma.reminder.findFirst({
        where: {
          householdId,
          sourceType: "budget",
          sourceEntityId: budget.id,
          status: { in: ["active", "paused"] },
          createdAt: { gte: start },
        },
      });
      if (alreadyAlerted) continue;

      // plan.md §9 Q25: a whole-household budget (memberId = null) notifies
      // EVERY active member, not just whoever tipped it over.
      const targetMemberIds = budget.memberId
        ? [budget.memberId]
        : (
            await prisma.member.findMany({
              where: { householdId, status: "active" },
              select: { id: true },
            })
          ).map((m) => m.id);

      for (const targetMemberId of targetMemberIds) {
        await createReminder({
          householdId,
          title: `Budget alert: ${budget.category.name} is at ${Math.round(percentUsed)}%`,
          targetMemberId,
          createdByMemberId: targetMemberId, // system-triggered — attributed to the recipient
          sourceType: "budget",
          sourceModule: "finance",
          sourceEntityId: budget.id,
          // plan.md §3.3: an event-driven source with no future anchor date
          // fires immediately — firstRemindAt = now, reminderType = one_off.
          reminderType: "one_off",
          firstRemindAt: new Date(),
        });
      }

      await emitBudgetThresholdExceeded(householdId, budget.id);
    }
  }
}
