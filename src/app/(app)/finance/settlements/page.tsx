import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { getMembers } from "@/lib/household";
import { BackLink } from "@/components/back-link";
import { getSettlements } from "@/modules/finance";
import { NewSettlementDialog } from "@/modules/finance/components/new-settlement-dialog";
import { SettlementList } from "@/modules/finance/components/settlement-list";

export default async function SettlementsPage() {
  const member = await requireMember();
  if (!member) redirect("/login");

  const [members, settlements] = await Promise.all([
    getMembers(member.householdId),
    getSettlements(member.householdId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/finance" label="Finance" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Settlements</h1>
        <NewSettlementDialog members={members} actingMemberId={member.id} />
      </div>
      <SettlementList settlements={settlements} actingMemberId={member.id} />
    </div>
  );
}
