import { Badge } from "@/components/ui/badge";
import { SubscriptionRowActions } from "./subscription-row-actions";
import type { Subscription, Category } from "@prisma/client";

type MemberOption = { id: string; displayName: string };
type CategoryOption = { id: string; name: string };
type SubscriptionRow = Subscription & { category: Category; responsibleMember: { displayName: string } };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  paused: "secondary",
  cancelled: "outline",
};

export function SubscriptionList({
  subscriptions,
  members,
  categories,
  actingMemberId,
}: {
  subscriptions: SubscriptionRow[];
  members: MemberOption[];
  categories: CategoryOption[];
  actingMemberId: string;
}) {
  if (subscriptions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No subscriptions yet — add one to get started.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {subscriptions.map((subscription) => (
        <li key={subscription.id} className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-medium">{subscription.name}</p>
              <p className="text-xs text-muted-foreground">
                {subscription.category.name} · {subscription.responsibleMember.displayName} ·{" "}
                {subscription.frequency} · Next due {new Date(subscription.nextDueDate).toLocaleDateString()}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="outline">{Number(subscription.amount).toFixed(2)}</Badge>
              <Badge variant={STATUS_VARIANT[subscription.status] ?? "outline"}>{subscription.status}</Badge>
            </div>
          </div>
          <SubscriptionRowActions
            subscription={subscription}
            members={members}
            categories={categories}
            actingMemberId={actingMemberId}
          />
        </li>
      ))}
    </ul>
  );
}
