// The public barrel: the ONLY import path other modules use
// (docs/project-structure.md §3.2, §7).
export { getTodayView } from "./queries/get-today-view";
export { searchEverything } from "./queries/search";
export { search } from "./actions/search-action";
export type { DashboardItem, DashboardItemKind } from "./entities/dashboard-item";
// NOT exported: components/ — imported directly by src/app/(app)/dashboard/
// page.tsx and src/components/app-shell/*.tsx, the same "app/ → module
// components" exception docs/resources.md §2.7 documents.
//
// src/components/app-shell/command-palette.tsx ("use client") is a second,
// narrower exception: it imports `search` straight from
// ./actions/search-action, never through this file. Barrel re-exports are
// resolved as one module by webpack's client bundler — importing anything
// from this barrel drags in every sibling export's transitive deps,
// including searchEverything's chain into life-admin's barrel, which also
// exports a Document query needing @/lib/supabase/admin's "server-only"
// client. That broke a real `pnpm build` the first time this file was
// written to route through the barrel — a client component calling a
// Server Action must import it from that action's own file, not through
// any barrel with heavier siblings, no exception.
