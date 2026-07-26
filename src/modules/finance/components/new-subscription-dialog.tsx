"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SubscriptionForm } from "./subscription-form";

type MemberOption = { id: string; displayName: string };
type CategoryOption = { id: string; name: string };

export function NewSubscriptionDialog({
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">New subscription</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>Create a subscription</DialogTitle>
        </DialogHeader>
        <SubscriptionForm
          members={members}
          categories={categories}
          actingMemberId={actingMemberId}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
