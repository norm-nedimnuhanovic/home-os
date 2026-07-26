"use client";

import { cn } from "@/lib/utils";
import type { CalendarItem } from "../entities/calendar-item";

export function CalendarItemChip({
  item,
  onClick,
}: {
  item: CalendarItem;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={item.color ? { backgroundColor: item.color } : undefined}
      className={cn(
        "w-full cursor-pointer truncate rounded px-1.5 py-0.5 text-left text-xs",
        item.color ? "text-white" : item.kind === "task" ? "bg-secondary" : "bg-primary/10",
        item.completed && "text-muted-foreground line-through",
      )}
    >
      {item.kind === "task" ? (item.completed ? "☑ " : "☐ ") : ""}
      {item.title}
    </button>
  );
}
