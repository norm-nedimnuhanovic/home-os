export const moduleRegistration = {
  key: "dashboard",
  name: "Dashboard",
  description: "Today view, quick capture, cross-module search, and command palette.",
  version: "1.0.0",
  kind: "built_in" as const,
  dependsOnModules: ["tasks", "calendar", "reminders", "finance", "notes", "life_admin"] as string[],
  status: "active" as const,
};

// Dashboard is a pure query layer — it owns no entities, so it emits nothing.
export const eventTypes: never[] = [];

export const permissionDeclarations = [
  { resourceDomain: "tasks" as const, accessLevel: "read" as const, purpose: '"Today" view: tasks due.', isRequired: true },
  { resourceDomain: "calendar" as const, accessLevel: "read" as const, purpose: '"Today" view: today\'s events.', isRequired: true },
  { resourceDomain: "finance" as const, accessLevel: "read" as const, purpose: '"Today" view: upcoming bills (7-day lookahead).', isRequired: true },
  { resourceDomain: "reminders" as const, accessLevel: "read" as const, purpose: '"Today" view: active reminders.', isRequired: true },
  // Search-only, not part of "Today" — optional, so disabling Notes/Life
  // Admin just narrows search results rather than breaking the Dashboard
  // module outright (graceful degradation, plan.md's own module contract).
  { resourceDomain: "notes" as const, accessLevel: "read" as const, purpose: "Cross-entity search: notes.", isRequired: false },
  { resourceDomain: "life_admin" as const, accessLevel: "read" as const, purpose: "Cross-entity search: contacts.", isRequired: false },
];

export const surfaceRegistrations = [
  { surface: "navigation_item" as const, label: "Dashboard", target: "/dashboard", sortOrder: 0 },
  { surface: "dashboard_widget" as const, label: "Today", target: "dashboard/widgets/today", sortOrder: 0 },
];
