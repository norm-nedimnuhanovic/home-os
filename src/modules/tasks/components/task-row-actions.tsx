"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TaskForm } from "./task-form";
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

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        Edit
      </Button>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
          </DialogHeader>
          <TaskForm task={task} members={members} tags={tags} onDone={() => setEditing(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
