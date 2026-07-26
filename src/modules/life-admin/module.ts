export const moduleRegistration = {
  key: "life_admin",
  name: "Life Admin",
  description: "Documents, warranties, renewals, contacts, and shared shopping/household lists.",
  version: "1.0.0",
  kind: "built_in" as const,
  dependsOnModules: ["reminders"] as string[],
  status: "active" as const,
};

export const eventTypes = [
  {
    owningModule: "life_admin",
    key: "renewal.expiring_soon",
    label: "Renewal expiring soon",
    payloadSummary: "{ renewalId, expiryDate }",
    contractVersion: 1,
    relatedEntityType: "Renewal",
  },
  {
    owningModule: "life_admin",
    key: "renewal.expired",
    label: "Renewal expired",
    payloadSummary: "{ renewalId }",
    contractVersion: 1,
    relatedEntityType: "Renewal",
  },
  {
    owningModule: "life_admin",
    key: "contact.created",
    label: "Contact added",
    payloadSummary: "{ contactId, name }",
    contractVersion: 1,
    relatedEntityType: "Contact",
  },
  {
    owningModule: "life_admin",
    key: "contact.updated",
    label: "Contact updated",
    payloadSummary: "{ contactId }",
    contractVersion: 1,
    relatedEntityType: "Contact",
  },
  {
    owningModule: "life_admin",
    key: "renewal.created",
    label: "Renewal added",
    payloadSummary: "{ renewalId, title }",
    contractVersion: 1,
    relatedEntityType: "Renewal",
  },
  {
    owningModule: "life_admin",
    key: "renewal.renewed",
    label: "Renewal marked renewed",
    payloadSummary: "{ renewalId }",
    contractVersion: 1,
    relatedEntityType: "Renewal",
  },
  {
    owningModule: "life_admin",
    key: "renewal.cancelled",
    label: "Renewal cancelled",
    payloadSummary: "{ renewalId }",
    contractVersion: 1,
    relatedEntityType: "Renewal",
  },
  {
    owningModule: "life_admin",
    key: "document.uploaded",
    label: "Document uploaded",
    payloadSummary: "{ documentId, title }",
    contractVersion: 1,
    relatedEntityType: "Document",
  },
  {
    owningModule: "life_admin",
    key: "document.linked",
    label: "Document linked",
    payloadSummary: "{ documentId, linkedEntityType, linkedEntityId }",
    contractVersion: 1,
    relatedEntityType: "Document",
  },
  {
    owningModule: "life_admin",
    key: "shoppingList.item_added",
    label: "Shopping list item added",
    payloadSummary: "{ listId, itemId, name }",
    contractVersion: 1,
    relatedEntityType: "ShoppingListItem",
  },
  {
    owningModule: "life_admin",
    key: "shoppingList.item_checked",
    label: "Shopping list item checked",
    payloadSummary: "{ listId, itemId }",
    contractVersion: 1,
    relatedEntityType: "ShoppingListItem",
  },
  {
    owningModule: "life_admin",
    key: "shoppingList.item_unchecked",
    label: "Shopping list item unchecked",
    payloadSummary: "{ listId, itemId }",
    contractVersion: 1,
    relatedEntityType: "ShoppingListItem",
  },
];

export const permissionDeclarations = [
  {
    resourceDomain: "reminders" as const,
    accessLevel: "write" as const,
    purpose: "Alert the responsible member before a Renewal or Document expires.",
    isRequired: true,
  },
];

export const surfaceRegistrations = [
  { surface: "navigation_item" as const, label: "Life Admin", target: "/life-admin", sortOrder: 70, icon: "ClipboardList" },
  { surface: "global_search_provider" as const, label: "Documents, renewals & contacts", target: "life-admin/search", sortOrder: 40 },
  {
    surface: "email_notification_category" as const,
    label: "Renewal expiring soon",
    target: "renewal.expiring_soon",
    sortOrder: 10,
  },
];
