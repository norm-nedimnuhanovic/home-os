"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TaskForm } from "./task-form";
import { deleteTask } from "../actions/delete-task";
import type { Task } from "@prisma/client";

type MemberOption = { id: string; displayName: string };
type TagOption = { id: string; name: string };
type DueReminder = { leadTimeValue: number | null; leadTimeUnit: "minutes" | "hours" | "days" | "weeks" | null };
type NoteLinkOption = { note: { id: string; title: string | null } };

export function TaskRowActions({
  task,
  members,
  tags,
}: {
  task: Task & { tagIds?: string[]; dueReminder?: DueReminder | null; noteLinks?: NoteLinkOption[] };
  members: MemberOption[];
  tags: TagOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        Edit
      </Button>
      <Button variant="outline" size="sm" onClick={() => setDeleting(true)}>
        Delete
      </Button>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
          </DialogHeader>
          {task.noteLinks && task.noteLinks.length > 0 && (
            <div className="flex flex-col gap-1 rounded-md border p-2">
              <p className="text-xs font-medium text-muted-foreground">Linked notes</p>
              {task.noteLinks.map(({ note }) => (
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
          <TaskForm task={task} members={members} tags={tags} onDone={() => setEditing(false)} />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this task?"
        description="This hides it from your task list. You can't undo this from here yet."
        confirmLabel="Delete"
        successMessage="Task deleted"
        onConfirm={() => deleteTask(task.id)}
      />
    </>
  );
}
