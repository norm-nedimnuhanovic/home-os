import { redirect } from "next/navigation";
import { getBoardWithColumns } from "@/modules/kanban";
import { getMembers } from "@/lib/household";
import { requireMember } from "@/lib/auth/session";
import { BoardHeader } from "@/modules/kanban/components/board-header";
import { BoardView } from "@/modules/kanban/components/board-view";

export default async function KanbanBoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const member = await requireMember();
  if (!member) redirect("/login");

  const { boardId } = await params;
  const [board, members] = await Promise.all([
    getBoardWithColumns(member, boardId),
    getMembers(member.householdId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <BoardHeader board={board} members={members} isOwner={board.createdById === member.id} />
      <BoardView boardId={board.id} columns={board.columns} tasks={board.tasks} />
    </div>
  );
}
