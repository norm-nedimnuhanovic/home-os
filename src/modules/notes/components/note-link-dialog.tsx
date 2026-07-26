"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { linkNote } from "../actions/link-note";
import type { NoteLinkedEntityType } from "@prisma/client";

type LinkableOption = { id: string; label: string };

export function NoteLinkDialog({
  noteId,
  tasks,
  events,
}: {
  noteId: string;
  tasks: LinkableOption[];
  events: LinkableOption[];
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<NoteLinkedEntityType>("task");
  const [entityId, setEntityId] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  const options = type === "task" ? tasks : events;

  function handleLink() {
    if (!entityId) return;
    startTransition(async () => {
      await linkNote(noteId, {
        linkedEntityModule: type === "task" ? "tasks" : "calendar",
        linkedEntityType: type,
        linkedEntityId: entityId,
      });
      setOpen(false);
      setEntityId(undefined);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full sm:w-auto">
          Link to…
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle>Link this note</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Select
            value={type}
            onValueChange={(value) => {
              setType(value as NoteLinkedEntityType);
              setEntityId(undefined);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="task">Task</SelectItem>
              <SelectItem value="event">Event</SelectItem>
            </SelectContent>
          </Select>

          <Select value={entityId} onValueChange={setEntityId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={options.length ? "Pick one" : "Nothing to link yet"} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            disabled={!entityId || isPending}
            onClick={handleLink}
            className="w-full sm:w-auto"
          >
            Add link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
