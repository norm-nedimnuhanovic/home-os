import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { getMembers } from "@/lib/household";
import { getVisibleRenewals, getVisibleContacts } from "@/modules/life-admin";
import { NewRenewalDialog } from "@/modules/life-admin/components/new-renewal-dialog";
import { RenewalList } from "@/modules/life-admin/components/renewal-list";

export default async function RenewalsPage() {
  const member = await requireMember();
  if (!member) redirect("/login");

  const [members, renewals, contacts] = await Promise.all([
    getMembers(member.householdId),
    getVisibleRenewals(member),
    getVisibleContacts(member),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Renewals</h1>
        <NewRenewalDialog members={members} contacts={contacts} />
      </div>
      <RenewalList renewals={renewals} actingMemberId={member.id} members={members} contacts={contacts} />
    </div>
  );
}
