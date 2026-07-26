import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { getMembers } from "@/lib/household";
import { prisma } from "@/lib/db";
import { canInviteMember, canCloseHousehold } from "@/lib/access/household-permissions";
import { SettingsNav } from "../settings-nav";
import { MemberList } from "./member-list";
import { InviteMemberDialog } from "./invite-member-dialog";
import { CloseHouseholdSection } from "./close-household-section";

export default async function MembersSettingsPage() {
  const member = await requireMember();
  if (!member) redirect("/login");

  const [members, pendingInvites] = await Promise.all([
    getMembers(member.householdId),
    prisma.invite.findMany({
      where: { householdId: member.householdId, status: "pending" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        {canInviteMember(member) && <InviteMemberDialog />}
      </div>
      <SettingsNav active="members" />
      <MemberList
        members={members}
        pendingInvites={pendingInvites}
        actingMember={{ id: member.id, role: member.role }}
      />
      {canCloseHousehold(member) && <CloseHouseholdSection householdName={member.household.name} />}
    </div>
  );
}
