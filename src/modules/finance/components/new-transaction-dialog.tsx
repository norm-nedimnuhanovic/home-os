"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TransactionFormDialog } from "./transaction-form-dialog";

type MemberOption = { id: string; displayName: string };
type CategoryOption = { id: string; name: string; type: string };

export function NewTransactionDialog({
  members,
  categories,
  actingMemberId,
}: {
  members: MemberOption[];
  categories: CategoryOption[];
  actingMemberId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        New transaction
      </Button>
      <TransactionFormDialog
        members={members}
        categories={categories}
        actingMemberId={actingMemberId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
