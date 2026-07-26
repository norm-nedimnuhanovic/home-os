"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ShoppingListForm } from "./shopping-list-form";

type MemberOption = { id: string; displayName: string };

export function NewShoppingListDialog({ members }: { members: MemberOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">New list</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>Create a list</DialogTitle>
        </DialogHeader>
        <ShoppingListForm members={members} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
