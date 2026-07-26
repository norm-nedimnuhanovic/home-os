"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumnView, type ColumnData } from "./kanban-column";
import { KanbanCard, type KanbanCardTask } from "./kanban-card";
import { moveCard } from "../actions/move-card";

export function BoardView({
  boardId,
  columns,
  tasks,
}: {
  boardId: string;
  columns: ColumnData[];
  tasks: (KanbanCardTask & { columnId: string | null; boardPosition: number | null })[];
}) {
  const [, startTransition] = useTransition();
  const [activeTask, setActiveTask] = useState<KanbanCardTask | null>(null);

  // distance-based activation so a plain tap/click still works normally
  // (e.g. following a link inside a card) instead of every touch starting a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const tasksByColumn = new Map<string, typeof tasks>();
  for (const col of columns) tasksByColumn.set(col.id, []);
  for (const task of tasks) {
    if (task.columnId) tasksByColumn.get(task.columnId)?.push(task);
  }

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = String(active.id);
    const targetColumnId = String(over.id);
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.columnId === targetColumnId) return; // same column — no-op for now

    const targetTasks = tasksByColumn.get(targetColumnId) ?? [];
    const lastPosition = targetTasks.at(-1)?.boardPosition ?? 0;

    startTransition(async () => {
      await moveCard({ taskId, columnId: targetColumnId, boardPosition: lastPosition + 1 });
    });
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <KanbanColumnView
            key={col.id}
            boardId={boardId}
            column={col}
            tasks={tasksByColumn.get(col.id) ?? []}
          />
        ))}
      </div>
      <DragOverlay>{activeTask ? <KanbanCard task={activeTask} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}
