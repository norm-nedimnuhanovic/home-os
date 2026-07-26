"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TaskForm } from "@/modules/tasks/components/task-form";
import { NoteForm } from "@/modules/notes/components/note-form";
import { ReminderForm } from "@/modules/reminders/components/reminder-form";

type MemberOption = { id: string; displayName: string };
type TagOption = { id: string; name: string };
type Target = { moduleKey: string; label: string };

// plan.md §4.1: "Submission is a direct, synchronous create against the
// normal Task/Note/Reminder entity using each module's own defaults... no
// separate staging/draft entity." Reuses each module's real create form
// verbatim rather than a parallel quick-capture-specific one.
export function QuickCaptureButton({
  targets,
  members,
  tags,
}: {
  targets: Target[];
  members: MemberOption[];
  tags: TagOption[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeTarget, setActiveTarget] = useState<string | null>(null);

  return (
    <>
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-start gap-2 sm:w-auto">
            <Plus className="h-4 w-4" /> Quick capture
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-48 p-1">
          {targets.map((target) => (
            <button
              key={target.moduleKey}
              type="button"
              className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => {
                setPickerOpen(false);
                setActiveTarget(target.moduleKey);
              }}
            >
              {target.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <Dialog open={!!activeTarget} onOpenChange={(open) => !open && setActiveTarget(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
          <DialogHeader>
            <DialogTitle>
              {targets.find((t) => t.moduleKey === activeTarget)?.label ?? "Quick capture"}
            </DialogTitle>
          </DialogHeader>
          {activeTarget === "tasks" && (
            <TaskForm
              members={members}
              tags={tags}
              onDone={() => {
                setActiveTarget(null);
                toast.success("Task created");
              }}
            />
          )}
          {activeTarget === "notes" && (
            <NoteForm
              members={members}
              tags={tags}
              onDone={() => {
                setActiveTarget(null);
                toast.success("Note created");
              }}
            />
          )}
          {activeTarget === "reminders" && (
            <ReminderForm
              members={members}
              onDone={() => {
                setActiveTarget(null);
                toast.success("Reminder created");
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
