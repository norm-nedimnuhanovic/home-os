"use client";

import { useDraggable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  urgent: "destructive",
};

export type KanbanCardTask = {
  id: string;
  title: string;
  priority: string;
  completedAt: Date | null;
  assignee?: { displayName: string } | null;
};

export function KanbanCard({ task, overlay = false }: { task: KanbanCardTask; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={style}
      {...(overlay ? {} : { ...attributes, ...listeners })}
      className={cn(
        "cursor-grab touch-none rounded-md border bg-card p-3 shadow-sm active:cursor-grabbing",
        isDragging && "opacity-40",
        overlay && "rotate-2 shadow-lg",
      )}
    >
      <p className={cn("text-sm", task.completedAt && "text-muted-foreground line-through")}>
        {task.title}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge variant={PRIORITY_VARIANT[task.priority] ?? "outline"} className="text-xs">
          {task.priority}
        </Badge>
        {task.assignee && (
          <span className="text-xs text-muted-foreground">{task.assignee.displayName}</span>
        )}
      </div>
    </div>
  );
}
