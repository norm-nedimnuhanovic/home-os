import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { getMembers } from "@/lib/household";
import { BackLink } from "@/components/back-link";
import { getCategories, getSubscriptions } from "@/modules/finance";
import { NewSubscriptionDialog } from "@/modules/finance/components/new-subscription-dialog";
import { SubscriptionList } from "@/modules/finance/components/subscription-list";

export default async function SubscriptionsPage() {
  const member = await requireMember();
  if (!member) redirect("/login");

  const [members, categories, subscriptions] = await Promise.all([
    getMembers(member.householdId),
    getCategories(member.householdId),
    getSubscriptions(member.householdId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/finance" label="Finance" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Subscriptions</h1>
        <NewSubscriptionDialog members={members} categories={categories} actingMemberId={member.id} />
      </div>
      <SubscriptionList
        subscriptions={subscriptions}
        members={members}
        categories={categories}
        actingMemberId={member.id}
      />
    </div>
  );
}
