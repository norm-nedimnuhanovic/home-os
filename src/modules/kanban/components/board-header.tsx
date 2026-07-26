"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  const [isPending, startTransition] = useTransition();

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

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={isPending} className="w-full sm:w-auto">
                  Archive
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-lg">
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive this board?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Columns and cards are kept, just hidden from your board list. You can&apos;t undo
                    this from here yet.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      startTransition(async () => {
                        await archiveBoard(board.id);
                        router.push("/kanban");
                      })
                    }
                  >
                    Archive
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </div>
  );
}
