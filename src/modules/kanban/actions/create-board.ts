"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { syncObjectShares } from "@/lib/household/actions/sync-object-shares";
import { createBoardInputSchema, type CreateBoardFormInput } from "../entities/board";

// Every new board starts with this set so the done-column completion sync
// (docs/module-architecture.md §7.1) always has somewhere to land — a board
// with zero done-typed columns would silently no-op that feature.
const DEFAULT_COLUMNS = [
  { name: "To do", columnType: "todo" as const, position: 1 },
  { name: "In Progress", columnType: "in_progress" as const, position: 2 },
  { name: "Done", columnType: "done" as const, position: 3 },
];

export async function createBoard(input: CreateBoardFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const data = createBoardInputSchema.parse(input);

  const lastBoard = await prisma.kanbanBoard.findFirst({
    where: { householdId: member.householdId },
    orderBy: { position: "desc" },
  });

  const board = await prisma.kanbanBoard.create({
    data: {
      householdId: member.householdId,
      name: data.name,
      description: data.description ?? null,
      position: (lastBoard?.position ?? 0) + 1,
      visibility: data.visibility,
      createdById: member.id,
      columns: {
        create: DEFAULT_COLUMNS.map((col) => ({ ...col, householdId: member.householdId })),
      },
    },
    include: { columns: true },
  });

  if (data.visibility === "specific_members") {
    await syncObjectShares({
      householdId: member.householdId,
      moduleKey: "kanban",
      objectType: "KanbanBoard",
      objectId: board.id,
      sharedByMemberId: member.id,
      sharedWithMemberIds: data.sharedWithMemberIds ?? [],
    });
  }

  revalidatePath("/kanban");
  return board;
}
