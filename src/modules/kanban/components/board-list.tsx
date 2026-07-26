import Link from "next/link";
import type { KanbanBoard } from "@prisma/client";

export function BoardList({ boards }: { boards: KanbanBoard[] }) {
  if (boards.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No boards yet — create one to get started.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {boards.map((board) => (
        <li key={board.id}>
          <Link
            href={`/kanban/${board.id}`}
            className="block rounded-lg border p-4 transition-colors hover:bg-muted"
          >
            <p className="font-medium">{board.name}</p>
            {board.description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{board.description}</p>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
