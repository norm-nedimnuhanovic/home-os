"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NoteForm } from "./note-form";

export function NewNoteDialog({
  members,
  tags,
}: {
  members: { id: string; displayName: string }[];
  tags: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">New note</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>Create a note</DialogTitle>
        </DialogHeader>
        <NoteForm members={members} tags={tags} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
