import { Badge } from "@/components/ui/badge";
import { TransactionRowActions } from "./transaction-row-actions";
import type { Transaction, TransactionSplit, Category } from "@prisma/client";

type MemberOption = { id: string; displayName: string };
type CategoryOption = { id: string; name: string; type: string };
type TransactionRow = Transaction & {
  category: Category;
  paidBy: { displayName: string };
  splits: TransactionSplit[];
};

export function TransactionList({
  transactions,
  actingMemberId,
  members,
  categories,
}: {
  transactions: TransactionRow[];
  actingMemberId: string;
  members: MemberOption[];
  categories: CategoryOption[];
}) {
  if (transactions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No transactions yet — add one to get started.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {transactions.map((transaction) => {
        const isOwner = transaction.paidById === actingMemberId;
        return (
          <li
            key={transaction.id}
            className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{transaction.title}</p>
              <p className="text-xs text-muted-foreground">
                {transaction.category.name} · {new Date(transaction.date).toLocaleDateString()} ·{" "}
                {transaction.paidBy.displayName}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
              {transaction.splitType !== "none" && <Badge variant="outline">Split</Badge>}
              {transaction.status === "void" && <Badge variant="secondary">Void</Badge>}
              <span
                className={
                  transaction.type === "income"
                    ? "font-medium text-emerald-600 dark:text-emerald-400"
                    : "font-medium text-destructive"
                }
              >
                {transaction.type === "income" ? "+" : "-"}
                {Number(transaction.amount).toFixed(2)}
              </span>
              {isOwner && (
                <TransactionRowActions
                  transaction={transaction}
                  members={members}
                  categories={categories}
                  actingMemberId={actingMemberId}
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
