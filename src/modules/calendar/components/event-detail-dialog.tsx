"use client";

import { useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EventForm } from "./event-form";
import { deleteEvent } from "../actions/delete-event";
import type { Event } from "@prisma/client";

type EventWithNoteLinks = Event & { noteLinks?: { note: { id: string; title: string | null } }[] };

export function EventDetailDialog({
  event,
  members,
  isOwner,
  open,
  onOpenChange,
}: {
  event: EventWithNoteLinks;
  members: { id: string; displayName: string }[];
  isOwner: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setEditing(false);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit event" : event.title}</DialogTitle>
        </DialogHeader>

        {editing ? (
          <EventForm event={event} members={members} onDone={() => onOpenChange(false)} />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {event.allDay
                ? format(event.startAt, "PPP")
                : `${format(event.startAt, "PPp")} – ${format(event.endAt, "p")}`}
            </p>
            {event.location && <p className="text-sm">{event.location}</p>}
            {event.description && <p className="whitespace-pre-wrap text-sm">{event.description}</p>}

            {event.noteLinks && event.noteLinks.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">Linked notes</p>
                {event.noteLinks.map(({ note }) => (
                  <Link
                    key={note.id}
                    href={`/notes/${note.id}`}
                    className="text-sm text-primary underline-offset-4 hover:underline"
                  >
                    {note.title ?? "Untitled note"}
                  </Link>
                ))}
              </div>
            )}

            {isOwner && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditing(true)} className="w-full sm:w-auto">
                  Edit
                </Button>
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDeleteOpen(true)}>
                  Delete
                </Button>

                <ConfirmDialog
                  open={deleteOpen}
                  onOpenChange={setDeleteOpen}
                  title="Delete this event?"
                  description="This can't be undone."
                  confirmLabel="Delete"
                  successMessage="Event deleted"
                  onConfirm={async () => {
                    await deleteEvent(event.id);
                    onOpenChange(false);
                  }}
                />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
