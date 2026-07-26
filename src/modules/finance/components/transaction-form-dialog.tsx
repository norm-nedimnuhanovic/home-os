"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TransactionForm } from "./transaction-form";
import type { Transaction, TransactionSplit } from "@prisma/client";

type MemberOption = { id: string; displayName: string };
type CategoryOption = { id: string; name: string; type: string };

export function TransactionFormDialog({
  transaction,
  members,
  categories,
  actingMemberId,
  open,
  onOpenChange,
}: {
  transaction?: Transaction & { splits?: TransactionSplit[] };
  members: MemberOption[];
  categories: CategoryOption[];
  actingMemberId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>{transaction ? "Edit transaction" : "New transaction"}</DialogTitle>
        </DialogHeader>
        <TransactionForm
          transaction={transaction}
          members={members}
          categories={categories}
          actingMemberId={actingMemberId}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
