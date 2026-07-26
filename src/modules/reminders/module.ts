export const moduleRegistration = {
  key: "reminders",
  name: "Reminders",
  description: "One-off and recurring reminders, aimed at specific members, triggerable from any module.",
  version: "1.0.0",
  kind: "built_in" as const,
  dependsOnModules: [] as string[],
  status: "active" as const,
};

export const eventTypes = [
  {
    owningModule: "reminders",
    key: "reminder.due",
    label: "Reminder due",
    payloadSummary: "{ reminderId, occurrenceId, remindAt }",
    contractVersion: 1,
    relatedEntityType: "ReminderOccurrence",
  },
  // reminder.due itself isn't emitted anywhere yet — that's the
  // reminders-sweep cron job's job (ROADMAP.md §8), and no cron infra is
  // wired up yet. The four below are emitted by this module's own actions.
  {
    owningModule: "reminders",
    key: "reminder.created",
    label: "Reminder created",
    payloadSummary: "{ reminderId }",
    contractVersion: 1,
    relatedEntityType: "Reminder",
  },
  {
    owningModule: "reminders",
    key: "reminder.snoozed",
    label: "Reminder snoozed",
    payloadSummary: "{ reminderId, occurrenceId }",
    contractVersion: 1,
    relatedEntityType: "ReminderOccurrence",
  },
  {
    owningModule: "reminders",
    key: "reminder.completed",
    label: "Reminder completed",
    payloadSummary: "{ reminderId, occurrenceId }",
    contractVersion: 1,
    relatedEntityType: "ReminderOccurrence",
  },
  {
    owningModule: "reminders",
    key: "reminder.cancelled",
    label: "Reminder cancelled",
    payloadSummary: "{ reminderId }",
    contractVersion: 1,
    relatedEntityType: "Reminder",
  },
];

export const permissionDeclarations = [
  {
    resourceDomain: "notifications_email" as const,
    accessLevel: "write" as const,
    purpose: "Send the reminder email via Resend when an occurrence fires.",
    isRequired: true,
  },
];

export const surfaceRegistrations = [
  { surface: "navigation_item" as const, label: "Reminders", target: "/reminders", sortOrder: 40 },
  { surface: "quick_capture_target" as const, label: "Add a reminder", target: "reminders/quick-capture", sortOrder: 30 },
  {
    surface: "email_notification_category" as const,
    label: "Reminder due",
    target: "reminder.due",
    sortOrder: 30,
  },
];
