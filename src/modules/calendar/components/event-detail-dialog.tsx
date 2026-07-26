"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EventForm } from "./event-form";
import { deleteEvent } from "../actions/delete-event";
import type { Event } from "@prisma/client";

export function EventDetailDialog({
  event,
  members,
  isOwner,
  open,
  onOpenChange,
}: {
  event: Event;
  members: { id: string; displayName: string }[];
  isOwner: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

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

            {isOwner && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditing(true)} className="w-full sm:w-auto">
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" disabled={isPending} className="w-full sm:w-auto">
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-lg">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                      <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          startTransition(async () => {
                            await deleteEvent(event.id);
                            onOpenChange(false);
                          })
                        }
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
