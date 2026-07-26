// The public barrel for the household/sharing platform layer — the ONLY
// import path modules use for these capabilities (docs/project-structure.md §3.2).
export { getMembers } from "./queries/get-members";
export { syncObjectShares } from "./actions/sync-object-shares";
export { visibilitySchemaFields, refineVisibility } from "./visibility";
