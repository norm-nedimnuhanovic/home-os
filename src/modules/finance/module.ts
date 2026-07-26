export const moduleRegistration = {
  key: "finance",
  name: "Finance",
  description: "Transactions, budgets, subscriptions, and settlements.",
  version: "1.0.0",
  kind: "built_in" as const,
  dependsOnModules: ["reminders"] as string[],
  status: "active" as const,
};

export const eventTypes = [
  {
    owningModule: "finance",
    key: "bill.due_soon",
    label: "Subscription due soon",
    payloadSummary: "{ subscriptionId, nextDueDate }",
    contractVersion: 1,
    relatedEntityType: "Subscription",
  },
  {
    owningModule: "finance",
    key: "transaction.recorded",
    label: "Transaction recorded",
    payloadSummary: "{ transactionId }",
    contractVersion: 1,
    relatedEntityType: "Transaction",
  },
  {
    owningModule: "finance",
    key: "budget.threshold_exceeded",
    label: "Budget threshold exceeded",
    payloadSummary: "{ budgetId }",
    contractVersion: 1,
    relatedEntityType: "Budget",
  },
  {
    owningModule: "finance",
    key: "settlement.recorded",
    label: "Settlement recorded",
    payloadSummary: "{ settlementId }",
    contractVersion: 1,
    relatedEntityType: "Settlement",
  },
];

export const permissionDeclarations = [
  {
    resourceDomain: "reminders" as const,
    accessLevel: "write" as const,
    purpose: "Alert the responsible member before a Subscription payment or Budget threshold.",
    isRequired: true,
  },
  {
    resourceDomain: "tasks" as const,
    accessLevel: "write" as const,
    purpose: "Create a follow-up task when a subscription payment needs manual confirmation.",
    isRequired: false, // must degrade gracefully without it — plan.md's isRequired contract
  },
];

export const surfaceRegistrations = [
  { surface: "navigation_item" as const, label: "Finance", target: "/finance", sortOrder: 60 },
  { surface: "global_search_provider" as const, label: "Transactions & subscriptions", target: "finance/search", sortOrder: 30 },
  {
    surface: "email_notification_category" as const,
    label: "Bill due soon",
    target: "bill.due_soon",
    sortOrder: 20,
  },
  {
    surface: "email_notification_category" as const,
    label: "Budget threshold exceeded",
    target: "budget.threshold_exceeded",
    sortOrder: 21,
  },
];
