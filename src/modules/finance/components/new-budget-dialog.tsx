"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BudgetForm } from "./budget-form";

type MemberOption = { id: string; displayName: string };
type CategoryOption = { id: string; name: string };

export function NewBudgetDialog({
  members,
  categories,
}: {
  members: MemberOption[];
  categories: CategoryOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">New budget</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>Create a budget</DialogTitle>
        </DialogHeader>
        <BudgetForm members={members} categories={categories} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
