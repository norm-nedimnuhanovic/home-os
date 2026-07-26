"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TaskForm } from "./task-form";
import { deleteTask } from "../actions/delete-task";
import type { Task } from "@prisma/client";

type MemberOption = { id: string; displayName: string };
type TagOption = { id: string; name: string };
type DueReminder = { leadTimeValue: number | null; leadTimeUnit: "minutes" | "hours" | "days" | "weeks" | null };

export function TaskRowActions({
  task,
  members,
  tags,
}: {
  task: Task & { tagIds?: string[]; dueReminder?: DueReminder | null };
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
