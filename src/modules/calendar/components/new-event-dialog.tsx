"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EventForm } from "./event-form";

export function NewEventDialog({
  defaultDate,
  members,
}: {
  defaultDate?: Date;
  members: { id: string; displayName: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">New event</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>Create an event</DialogTitle>
        </DialogHeader>
        <EventForm defaultDate={defaultDate} members={members} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
