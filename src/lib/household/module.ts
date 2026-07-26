// Platform substrate, not a user-facing feature module — Household/Member/
// Invite/ObjectShare code lives under src/lib/household/ per docs/project-
// structure.md's lib-vs-modules split, and has no page/nav/dependents. This
// file exists solely so `household.invite_received`/`share.received`
// (docs/email.md §2.1, plan.md's Emits: lines) have a Module row to own —
// ModuleEventType.owningModuleId is NOT NULL, and "household" can't be a
// member of the 8-module registry it's registering (prisma/seed/platform.ts's
// previously-flagged gap). Registered in
// src/lib/module-registry/registry.ts's ALL_MODULES exactly like a real
// module, since seedPlatformCatalog() is already generic over this shape.
export const moduleRegistration = {
  key: "household",
  name: "Household",
  description: "Platform substrate: members, invites, and object sharing.",
  version: "1.0.0",
  kind: "built_in" as const,
  dependsOnModules: [] as string[],
  status: "active" as const,
};

export const eventTypes = [
  {
    owningModule: "household",
    key: "household.invite_received",
    label: "Household invite received",
    payloadSummary: "{ inviteId, invitedMemberId }",
    contractVersion: 1,
    relatedEntityType: "Invite",
  },
  {
    owningModule: "household",
    key: "share.received",
    label: "Item shared with you",
    payloadSummary: "{ objectShareId, sharedWithMemberId, moduleKey, objectType, objectId }",
    contractVersion: 1,
    relatedEntityType: "ObjectShare",
  },
];

export const permissionDeclarations: never[] = [];

export const surfaceRegistrations = [
  {
    surface: "email_notification_category" as const,
    label: "Household invite received",
    target: "household.invite_received",
    sortOrder: 90,
  },
  {
    surface: "email_notification_category" as const,
    label: "Something shared with you",
    target: "share.received",
    sortOrder: 91,
  },
  { surface: "navigation_item" as const, label: "Settings", target: "/settings/members", sortOrder: 100, icon: "Settings" },
];
