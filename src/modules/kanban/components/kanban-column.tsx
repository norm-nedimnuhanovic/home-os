"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { KanbanCard, type KanbanCardTask } from "./kanban-card";
import { AddCardInput } from "./add-card-input";

export type ColumnData = {
  id: string;
  name: string;
  columnType: "todo" | "in_progress" | "done" | "custom";
};

export function KanbanColumnView({
  boardId,
  column,
  tasks,
}: {
  boardId: string;
  column: ColumnData;
  tasks: KanbanCardTask[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { columnId: column.id } });

  return (
    <div className="flex w-64 shrink-0 flex-col gap-2 sm:w-72">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-medium">{column.name}</h3>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 rounded-lg border border-dashed p-2 transition-colors",
          isOver && "border-primary bg-muted/50",
        )}
      >
        {tasks.length === 0 && (
          <p className="p-2 text-center text-xs text-muted-foreground">Drop a card here</p>
        )}
        {tasks.map((task) => (
          <KanbanCard key={task.id} task={task} />
        ))}
        <AddCardInput boardId={boardId} columnId={column.id} />
      </div>
    </div>
  );
}
