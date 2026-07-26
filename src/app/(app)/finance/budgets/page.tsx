import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { getMembers } from "@/lib/household";
import { BackLink } from "@/components/back-link";
import { getCategories, getBudgets } from "@/modules/finance";
import { NewBudgetDialog } from "@/modules/finance/components/new-budget-dialog";
import { BudgetList } from "@/modules/finance/components/budget-list";

export default async function BudgetsPage() {
  const member = await requireMember();
  if (!member) redirect("/login");

  const [members, categories, budgets] = await Promise.all([
    getMembers(member.householdId),
    getCategories(member.householdId),
    getBudgets(member.householdId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/finance" label="Finance" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Budgets</h1>
        <NewBudgetDialog members={members} categories={categories} />
      </div>
      <BudgetList budgets={budgets} members={members} categories={categories} />
    </div>
  );
}
