import { Badge } from "@/components/ui/badge";
import type { getMonthlySummary } from "../queries/get-monthly-summary";

export function MonthlySummary({ summary }: { summary: Awaited<ReturnType<typeof getMonthlySummary>> }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Income</p>
          <p className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">
            {summary.totalIncome.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Expenses</p>
          <p className="text-xl font-semibold text-destructive">{summary.totalExpense.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Net</p>
          <p className="text-xl font-semibold">{summary.netBalance.toFixed(2)}</p>
        </div>
      </div>

      {summary.byCategoryBreakdown.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">By category</p>
          <ul className="flex flex-wrap gap-2">
            {summary.byCategoryBreakdown.map((c) => (
              <li key={c.categoryId}>
                <Badge variant="outline">
                  {c.category}: {c.total.toFixed(2)}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.budgetsVsActual.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Budgets this period</p>
          <ul className="flex flex-col gap-1">
            {summary.budgetsVsActual.map((b) => (
              <li key={b.budgetId} className="flex items-center justify-between text-sm">
                <span>{b.category}</span>
                <span className={b.percentUsed >= 100 ? "text-destructive" : "text-muted-foreground"}>
                  {b.amountSpent.toFixed(2)} / {b.amount.toFixed(2)} ({b.percentUsed}%)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.subscriptionsDueCount > 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          {summary.subscriptionsDueCount} subscription{summary.subscriptionsDueCount === 1 ? "" : "s"} due this
          month
        </p>
      )}
    </div>
  );
}
