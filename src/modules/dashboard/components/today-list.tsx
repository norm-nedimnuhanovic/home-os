import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatInHouseholdTimezone } from "@/lib/dates";
import type { DashboardItem } from "../entities/dashboard-item";

const KIND_LABEL: Record<DashboardItem["kind"], string> = {
  task: "Task",
  event: "Event",
  bill: "Bill",
  reminder: "Reminder",
  note: "Note",
  contact: "Contact",
  transaction: "Transaction",
};

// Merges all four "Today" sources into one display list (plan.md §4.1) —
// overdue-first, then chronological, already sorted by getTodayView().
export function TodayList({ items, householdTimezone }: { items: DashboardItem[]; householdTimezone: string }) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nothing due today — enjoy the quiet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={`${item.sourceModule}:${item.entityId}`}>
          <Link
            href={item.href}
            className="flex flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-muted sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">
                {KIND_LABEL[item.kind]}
                {item.memberName && ` · ${item.memberName}`}
                {item.at && ` · ${formatInHouseholdTimezone(item.at, householdTimezone, "PPp")}`}
              </p>
            </div>
            {item.badge && (
              <Badge variant={item.overdue ? "destructive" : "secondary"} className="shrink-0">
                {item.badge}
              </Badge>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
