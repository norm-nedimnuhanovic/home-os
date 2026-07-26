import { Prisma } from "@prisma/client";

// Keep in sync with docs/orm-conventions.md §2.1's "scoped" column — every
// model in that list except the platform-catalog globals (Module,
// ModuleEventType, EventSubscription, ModulePermissionDeclaration,
// ModuleSurfaceRegistration) and the tenant root (Household) itself.
const TENANT_SCOPED_MODELS = new Set([
  "Member", "Invite", "ObjectShare", "NotificationPreference",
  "DigestSubscription", "Notification",
  "Task", "TaskRecurrenceRule", "Tag", "TaskTag",
  "KanbanBoard", "KanbanColumn", "Event",
  "Reminder", "ReminderOccurrence", "Note", "NoteTag", "NoteLink",
  "Category", "Transaction", "TransactionSplit", "Settlement",
  "Budget", "Subscription",
  "Document", "Renewal", "Contact", "ShoppingList", "ShoppingListItem",
  "EventOccurrence", "ModuleGrant",
]);

const READ_OR_UPDATE_OPS = new Set([
  "findFirst", "findFirstOrThrow", "findMany", "findUnique", "findUniqueOrThrow",
  "count", "aggregate", "groupBy", "update", "updateMany", "upsert", "delete", "deleteMany",
]);

function whereHasHouseholdId(where: unknown): boolean {
  if (!where || typeof where !== "object") return false;
  if ("householdId" in where) return true;
  // AND/OR compositions used by withVisibility() (docs/access-control.md §5)
  return ["AND", "OR"].some((key) => {
    const branch = (where as Record<string, unknown>)[key];
    return Array.isArray(branch) && branch.some(whereHasHouseholdId);
  });
}

export const tenantGuardExtension = Prisma.defineExtension({
  name: "tenant-guard",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!TENANT_SCOPED_MODELS.has(model)) return query(args);

        if (READ_OR_UPDATE_OPS.has(operation)) {
          if (!whereHasHouseholdId((args as { where?: unknown }).where)) {
            throw new Error(
              `Refusing ${model}.${operation}: missing householdId in \`where\`. ` +
                `See docs/orm-conventions.md §3 and docs/access-control.md §6.`,
            );
          }
        }
        if (operation === "create") {
          const data = (args as { data?: Record<string, unknown> }).data;
          if (!data?.householdId) {
            throw new Error(`Refusing ${model}.create: missing householdId in \`data\`.`);
          }
        }
        if (operation === "createMany") {
          const rows = (args as { data?: Record<string, unknown>[] }).data ?? [];
          if (rows.some((row) => !row.householdId)) {
            throw new Error(`Refusing ${model}.createMany: every row needs householdId.`);
          }
        }
        return query(args);
      },
    },
  },
});
