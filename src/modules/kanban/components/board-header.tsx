"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { BoardForm } from "./board-form";
import { NewColumnDialog } from "./new-column-dialog";
import { archiveBoard } from "../actions/archive-board";
import type { KanbanBoard } from "@prisma/client";

export function BoardHeader({
  board,
  members,
  isOwner,
}: {
  board: KanbanBoard;
  members: { id: string; displayName: string }[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">{board.name}</h1>
        {board.description && <p className="text-sm text-muted-foreground">{board.description}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        <NewColumnDialog boardId={board.id} />

        {isOwner && (
          <>
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto">
                  Edit
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
                <DialogHeader>
                  <DialogTitle>Edit board</DialogTitle>
                </DialogHeader>
                <BoardForm board={board} members={members} onDone={() => setEditOpen(false)} />
              </DialogContent>
            </Dialog>

            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setArchiveOpen(true)}>
              Archive
            </Button>

            <ConfirmDialog
              open={archiveOpen}
              onOpenChange={setArchiveOpen}
              title="Archive this board?"
              description="Columns and cards are kept, just hidden from your board list. You can't undo this from here yet."
              confirmLabel="Archive"
              successMessage="Board archived"
              onConfirm={async () => {
                await archiveBoard(board.id);
                router.push("/kanban");
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
