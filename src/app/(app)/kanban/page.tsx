import { redirect } from "next/navigation";
import { getBoards } from "@/modules/kanban";
import { getMembers } from "@/lib/household";
import { requireMember } from "@/lib/auth/session";
import { BoardList } from "@/modules/kanban/components/board-list";
import { NewBoardDialog } from "@/modules/kanban/components/new-board-dialog";

export default async function KanbanPage() {
  const member = await requireMember();
  if (!member) redirect("/login");

  const [boards, members] = await Promise.all([getBoards(member), getMembers(member.householdId)]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Kanban</h1>
        <NewBoardDialog members={members} />
      </div>
      <BoardList boards={boards} />
    </div>
  );
}
