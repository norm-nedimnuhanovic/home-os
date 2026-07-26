// The one common shape every "Today" row resolves to, regardless of source
// module (plan.md §4.1): "title/summary, source module + entity type + id
// (for deep-linking back), a due/trigger datetime, an assignee/target
// member, and a status/priority indicator." Dashboard, Search, and the
// command palette all read this same projection — never a per-module bespoke
// row shape leaking into the UI.
export type DashboardItemKind =
  | "task"
  | "event"
  | "bill"
  | "reminder"
  | "note"
  | "contact"
  | "transaction";

export type DashboardItem = {
  kind: DashboardItemKind;
  sourceModule: string;
  entityType: string;
  entityId: string;
  title: string;
  // dueDate / startAt / nextDueDate / remindAt for a Today row; absent for a
  // search result, where there's no trigger datetime to speak of (a Contact
  // or Note has no "at").
  at?: Date;
  href: string; // deep link back to the source entity's own list/detail page
  memberName?: string; // assignee / target / responsible member's display name, when set
  badge?: string; // a short status/priority label, e.g. "Overdue", "Urgent", "Snoozed"
  overdue?: boolean;
};
