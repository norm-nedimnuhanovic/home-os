export const moduleRegistration = {
  key: "calendar",
  name: "Calendar",
  description: "Month, week, and day views of events; tasks with due dates surface automatically.",
  version: "1.0.0",
  kind: "built_in" as const,
  dependsOnModules: ["tasks"] as string[],
  status: "active" as const,
};

export const eventTypes = [
  {
    owningModule: "calendar",
    key: "event.created",
    label: "Event created",
    payloadSummary: "{ eventId }",
    contractVersion: 1,
    relatedEntityType: "Event",
  },
];

export const permissionDeclarations = [
  {
    resourceDomain: "tasks" as const,
    accessLevel: "read" as const,
    purpose: "Render Task.dueDate rows alongside Event rows in range.",
    isRequired: true,
  },
];

export const surfaceRegistrations = [
  { surface: "navigation_item" as const, label: "Calendar", target: "/calendar", sortOrder: 30 },
];
