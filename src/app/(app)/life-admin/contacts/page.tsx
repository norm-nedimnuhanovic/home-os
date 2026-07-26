import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { getMembers } from "@/lib/household";
import { BackLink } from "@/components/back-link";
import { getVisibleContacts } from "@/modules/life-admin";
import { NewContactDialog } from "@/modules/life-admin/components/new-contact-dialog";
import { ContactList } from "@/modules/life-admin/components/contact-list";

export default async function ContactsPage() {
  const member = await requireMember();
  if (!member) redirect("/login");

  const [members, contacts] = await Promise.all([getMembers(member.householdId), getVisibleContacts(member)]);

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/life-admin" label="Life Admin" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Contacts</h1>
        <NewContactDialog members={members} />
      </div>
      <ContactList contacts={contacts} members={members} />
    </div>
  );
}
