"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TransactionFormDialog } from "./transaction-form-dialog";
import { voidTransaction } from "../actions/void-transaction";
import type { Transaction, TransactionSplit } from "@prisma/client";

type MemberOption = { id: string; displayName: string };
type CategoryOption = { id: string; name: string; type: string };
type TransactionRow = Transaction & { splits: TransactionSplit[] };

export function TransactionRowActions({
  transaction,
  members,
  categories,
  actingMemberId,
}: {
  transaction: TransactionRow;
  members: MemberOption[];
  categories: CategoryOption[];
  actingMemberId: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  // plan.md §9 Q23: editing or voiding a transaction with any already-settled
  // split is blocked, not auto-recalculated — the settlement must be undone
  // first, so both actions grey out together.
  const locked = transaction.status === "void" || transaction.splits.some((s) => s.settled);

  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={locked} onClick={() => setEditOpen(true)}>
        Edit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={locked}
        className="text-destructive hover:text-destructive"
        onClick={() => setVoidOpen(true)}
      >
        Void
      </Button>

      <TransactionFormDialog
        transaction={transaction}
        members={members}
        categories={categories}
        actingMemberId={actingMemberId}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <ConfirmDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title="Void transaction"
        description={`"${transaction.title}" will be marked void and excluded from summaries and budgets. This cannot be undone.`}
        confirmLabel="Void"
        successMessage="Transaction voided"
        onConfirm={() => voidTransaction(transaction.id)}
      />
    </div>
  );
}
