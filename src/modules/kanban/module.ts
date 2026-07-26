import { onTaskCompleted } from "./events/subscribers";

export const moduleRegistration = {
  key: "kanban",
  name: "Kanban",
  description: "Board view of tasks organized into columns.",
  version: "1.0.0",
  kind: "built_in" as const,
  dependsOnModules: ["tasks"] as string[],
  status: "active" as const,
};

export const eventTypes: never[] = [];

export const permissionDeclarations = [
  {
    resourceDomain: "tasks" as const,
    accessLevel: "read_write" as const,
    purpose: "Render and reorder Task rows placed on a board (boardId/columnId/boardPosition).",
    isRequired: true,
  },
];

export const surfaceRegistrations = [
  { surface: "navigation_item" as const, label: "Kanban", target: "/kanban", sortOrder: 20, icon: "Kanban" },
];

// Kanban is the one built-in that reacts to another module's event via
// EventSubscription rather than a direct dependsOnModules call — because
// dependsOnModules only ever runs kanban → tasks, never the reverse, so
// tasks has no way to call back into kanban directly when a task is
// completed from the plain list (docs/module-architecture.md §7.1).
export const eventSubscriptions = [
  {
    subscriberModule: "kanban",
    eventType: "task.completed",
    reactionDescription:
      "Move the task's card to its board's first done-typed column when the " +
      "task is completed from the plain task list (not by dragging the card itself).",
    onFailure: "log_only" as const,
  },
];

// The DB row above is an audit/config record; the actual function it names
// is wired into the runtime dispatch map in src/lib/events/handlers.ts.
export { onTaskCompleted };
