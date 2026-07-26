"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ReminderForm } from "./reminder-form";

export function NewReminderDialog({ members }: { members: { id: string; displayName: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">New reminder</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>Create a reminder</DialogTitle>
        </DialogHeader>
        <ReminderForm members={members} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
