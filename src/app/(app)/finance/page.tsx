import { redirect } from "next/navigation";
import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { getMembers } from "@/lib/household";
import {
  getCategories,
  getVisibleTransactions,
  getMonthlySummary,
  getMemberBalances,
} from "@/modules/finance";
import { NewTransactionDialog } from "@/modules/finance/components/new-transaction-dialog";
import { TransactionList } from "@/modules/finance/components/transaction-list";
import { MonthlySummary } from "@/modules/finance/components/monthly-summary";
import { MemberBalances } from "@/modules/finance/components/member-balances";
import { CategoryList } from "@/modules/finance/components/category-list";
import { Button } from "@/components/ui/button";

export default async function FinancePage() {
  const member = await requireMember();
  if (!member) redirect("/login");

  const [members, categories, transactions, summary, balances] = await Promise.all([
    getMembers(member.householdId),
    getCategories(member.householdId),
    getVisibleTransactions(member),
    getMonthlySummary(member.householdId, new Date()),
    getMemberBalances(member.householdId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Finance</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/finance/budgets">Budgets</Link>
          </Button>
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/finance/subscriptions">Subscriptions</Link>
          </Button>
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/finance/settlements">Settlements</Link>
          </Button>
          <NewTransactionDialog members={members} categories={categories} actingMemberId={member.id} />
        </div>
      </div>

      <MonthlySummary summary={summary} />

      <div>
        <h2 className="mb-2 text-lg font-medium">Who owes whom</h2>
        <MemberBalances balances={balances} members={members} />
      </div>

      <CategoryList categories={categories} />

      <div>
        <h2 className="mb-2 text-lg font-medium">Recent transactions</h2>
        <TransactionList
          transactions={transactions}
          actingMemberId={member.id}
          members={members}
          categories={categories}
        />
      </div>
    </div>
  );
}
