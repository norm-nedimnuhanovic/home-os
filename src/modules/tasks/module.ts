export const moduleRegistration = {
  key: "tasks",
  name: "Tasks",
  description: "Tasks, sub-tasks, tags, and recurring tasks.",
  version: "1.0.0",
  kind: "built_in" as const,
  // Real bug fixed alongside the "remind before due date" feature actually
  // being built: this permissionDeclarations array below already declared
  // a required `reminders`/`write` grant ("Remind the assignee before a
  // task's due date") from day one, but dependsOnModules never listed
  // "reminders" to match — a pre-existing inconsistency, since nothing
  // called createReminder() from Tasks until now.
  dependsOnModules: ["reminders"] as string[],
  status: "active" as const,
};

export const eventTypes = [
  {
    owningModule: "tasks",
    key: "task.assigned",
    label: "Task assigned",
    payloadSummary: "{ taskId, assigneeId }",
    contractVersion: 1,
    relatedEntityType: "Task",
  },
  {
    owningModule: "tasks",
    key: "task.completed",
    label: "Task completed",
    payloadSummary: "{ taskId, completedById }",
    contractVersion: 1,
    relatedEntityType: "Task",
  },
];

export const permissionDeclarations = [
  {
    resourceDomain: "reminders" as const,
    accessLevel: "write" as const,
    purpose: "Remind the assignee before a task's due date.",
    isRequired: true,
  },
];

export const surfaceRegistrations = [
  { surface: "navigation_item" as const, label: "Tasks", target: "/tasks", sortOrder: 10, icon: "ListChecks" },
  { surface: "quick_capture_target" as const, label: "Add a task", target: "tasks/quick-capture", sortOrder: 10 },
  { surface: "global_search_provider" as const, label: "Tasks", target: "tasks/search", sortOrder: 10 },
  {
    surface: "email_notification_category" as const,
    label: "Task assigned to you",
    target: "task.assigned",
    sortOrder: 10,
  },
  {
    surface: "email_notification_category" as const,
    label: "Task due soon",
    target: "task.due_soon",
    sortOrder: 11,
  },
];
