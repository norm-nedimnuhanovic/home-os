"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BudgetForm } from "./budget-form";
import { getCurrentPeriodRange } from "../entities/budget";
import type { Budget, Category } from "@prisma/client";

type MemberOption = { id: string; displayName: string };
type CategoryOption = { id: string; name: string };
type BudgetRow = Budget & { category: Category; member: { displayName: string } | null };

export function BudgetList({
  budgets,
  members,
  categories,
}: {
  budgets: BudgetRow[];
  members: MemberOption[];
  categories: CategoryOption[];
}) {
  const [editing, setEditing] = useState<BudgetRow | null>(null);

  if (budgets.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No budgets yet — add one to get started.
      </p>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {budgets.map((budget) => {
          const { end } = getCurrentPeriodRange(budget.period, new Date());
          const ended = budget.endDate ? new Date(budget.endDate) < new Date() : false;
          return (
            <li
              key={budget.id}
              className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{budget.category.name}</p>
                <p className="text-xs text-muted-foreground">
                  {budget.member?.displayName ?? "Whole household"} · {budget.period} · Period ends{" "}
                  {end.toLocaleDateString()}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                <Badge variant="outline">{Number(budget.amount).toFixed(2)}</Badge>
                {ended && <Badge variant="secondary">Ended</Badge>}
                <Button variant="outline" size="sm" onClick={() => setEditing(budget)}>
                  Edit
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
          <DialogHeader>
            <DialogTitle>Edit budget</DialogTitle>
          </DialogHeader>
          {editing && (
            <BudgetForm budget={editing} members={members} categories={categories} onDone={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
