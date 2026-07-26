export const moduleRegistration = {
  key: "notes",
  name: "Notes",
  description: "Simple notes with tags, a daily journal space, and links to tasks/subscriptions/events.",
  version: "1.0.0",
  kind: "built_in" as const,
  dependsOnModules: ["tasks"] as string[],
  status: "active" as const,
};

export const eventTypes = [
  {
    owningModule: "notes",
    key: "note.created",
    label: "Note created",
    payloadSummary: "{ noteId }",
    contractVersion: 1,
    relatedEntityType: "Note",
  },
  {
    owningModule: "notes",
    key: "note.linked",
    label: "Note linked to another object",
    payloadSummary: "{ noteId, linkedEntityType, linkedEntityId }",
    contractVersion: 1,
    relatedEntityType: "NoteLink",
  },
];

export const permissionDeclarations = [
  {
    resourceDomain: "tasks" as const,
    accessLevel: "read" as const,
    purpose: "Render a NoteLink chip pointing at a linked Task.",
    isRequired: false, // must degrade gracefully without it
  },
];

export const surfaceRegistrations = [
  { surface: "navigation_item" as const, label: "Notes", target: "/notes", sortOrder: 50, icon: "NotepadText" },
  { surface: "quick_capture_target" as const, label: "Add a note", target: "notes/quick-capture", sortOrder: 20 },
  { surface: "global_search_provider" as const, label: "Notes", target: "notes/search", sortOrder: 20 },
];
