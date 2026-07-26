# List & Row-Action Conventions

This doc covers how every Home OS list view is actually built in V1 — a
simple, server-rendered card list, no pagination/sort/filter infrastructure
— and the one consistent pattern for row-level edit/void/cancel actions via
dialogs. An earlier draft of this doc specified a full TanStack Table +
URL-driven sort/filter/pagination system ("DataTable") for Tasks and every
Finance/Life Admin list. That system was never built: all six modules
shipped so far (Tasks, Kanban, Calendar, Reminders, Notes, Finance) use the
plain card-list pattern this doc now describes, and every one of them
passed review and browser verification without it. Per `CLAUDE.md` rule 5,
this doc is corrected to match reality rather than left pointing at
infrastructure nobody built — the full original spec is kept at the bottom
(§8) as a V2 reference in case a household-scale list genuinely outgrows a
plain list later; don't build it preemptively.

**Companion docs, not duplicated here:** `docs/project-structure.md` owns
where every file in this doc lives and the module-boundary import rule;
`docs/access-control.md` owns the `visibility`/`ObjectShare` algorithm the
query layer calls into; `docs/orm-conventions.md` owns the Prisma-level
rules (enum ordering, computed-vs-stored status fields); `docs/resources.md`
owns the end-to-end entity-scaffolding walkthrough this doc's dialogs slot
into.

---

## 1. The pattern: a plain card list

Every list query function is a plain `async` function that scopes by
`householdId` (and `visibility` where the entity has it, per
`docs/access-control.md`), returns every matching row — no `skip`/`take`,
no `orderBy` driven by user input beyond a fixed default — and the page
(a Server Component) passes that array straight into a `<XList>` component:

```ts
// src/modules/finance/queries/get-settlements.ts
export async function getSettlements(householdId: string) {
  return prisma.settlement.findMany({
    where: { householdId },
    orderBy: { date: "desc" },
    include: { fromMember: { select: { displayName: true } }, toMember: { select: { displayName: true } } },
  });
}
```

```tsx
// src/modules/finance/components/settlement-list.tsx
"use client"; // only if it needs row-level dialogs/transitions; otherwise a
              // plain Server Component with no directive at all (e.g.
              // monthly-summary.tsx, member-balances.tsx when read-only)
export function SettlementList({ settlements, actingMemberId }: { ... }) {
  if (settlements.length === 0) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No settlements recorded yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {settlements.map((s) => <li key={s.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">…</li>)}
    </ul>
  );
}
```

This is deliberately the same shape as `docs/resources.md`'s `ContactForm`/
list walkthrough — there's only one list pattern in V1, not two competing
ones for "simple" vs. "table-worthy" entities. A household's data (tasks,
transactions, notes, …) stays small enough in practice that pagination has
never been needed; when a list is empty, show the dashed-border empty
state above, matching every list built so far verbatim.

### 1.1 Where the code lives

```
src/modules/<key>/
├── queries/get-<entities>.ts       # plain findMany, scoped by householdId (+ visibility)
├── entities/<entity>.ts            # zod schema, CreateXInput/CreateXFormInput (docs/forms.md)
└── components/
    ├── <entity>-list.tsx           # renders the array, embeds row actions
    ├── <entity>-form.tsx           # react-hook-form + zod, shared by create and edit
    ├── new-<entity>-dialog.tsx     # Dialog + trigger Button wrapping <EntityForm>
    ├── <entity>-form-dialog.tsx    # controlled open/onOpenChange variant, used for row-level Edit
    └── <entity>-row-actions.tsx    # only when a row needs 2+ actions — otherwise inline in the list
```

Every module's `index.ts` barrel exports its list query and any Server
Actions it didn't already export, per `docs/resources.md`'s "add it to the
barrel" step. A page imports the query from a module's barrel
(`@/modules/finance`) and imports components directly from that module's
`components/` folder — never another module's internals.

---

## 2. Which pattern each Home OS list uses

Every list `plan.md` defines, and the pattern actually shipped for it:

| List | Route | Pattern |
|---|---|---|
| Tasks | `/tasks` | Card list (`task-list.tsx`) — checkbox to complete, priority/overdue badges |
| Kanban board | `/kanban/[boardId]` | Drag-and-drop columns (dnd-kit) — not a list at all |
| Calendar | `/calendar` | Month/week/day grid, not a list |
| Reminders | `/reminders` | Card list (`reminder-list.tsx`) — occurrence status badge, snooze/dismiss/complete |
| Notes | `/notes` | Card grid (`note-list.tsx`), links to a detail page per note |
| Finance Transactions | `/finance` | Card list (`transaction-list.tsx`) — Edit/Void row actions, gated to the paying member |
| Finance Subscriptions | `/finance/subscriptions` | Card list (`subscription-list.tsx`) — pause/resume/mark-paid/cancel row actions |
| Finance Budgets | `/finance/budgets` | Card list (`budget-list.tsx`) — Edit only (no delete; `endDate` is how a budget ends) |
| Finance Settlements | `/finance/settlements` | Card list (`settlement-list.tsx`) — Cancel row action, gated to a party of the settlement |
| Life Admin Documents / Renewals / Contacts | `/life-admin/*` | Card list, per `docs/resources.md`'s `Contact` walkthrough |
| Settings → Members | `/settings/members` | Card list, no pagination — bounded by household size |
| Settings → Modules | `/settings/modules` | Plain list, bounded by installed-module count |

If a future list genuinely grows past what a plain array render can
handle for one household (dozens of rows, not thousands — a home, not a
business), revisit with real usage data before reaching for §8's TanStack
design — don't build ahead of that need.

---

## 3. Row actions: the tier system

Every module's row actions follow the same three tiers, so a member never
has to relearn "does this need a confirmation" per module:

1. **Direct, no dialog** — reversible, low-stakes changes: `completeTask`,
   `pause`/`resumeSubscription`, `markSubscriptionPaid`, `archive`/
   `unarchiveNote`, `snooze`/`dismiss`/`completeOccurrence`. Fires straight
   from the button's `onClick` (wrapped in `useTransition`).
2. **Edit dialog** — a shadcn `Dialog` wrapping the entity's existing
   create/edit form (never a navigation to a separate `/edit` route). Two
   shapes are both fine and both used: an uncontrolled trigger
   (`new-<entity>-dialog.tsx`, its own internal `open` state) for creating,
   and a controlled `<entity>-form-dialog.tsx` (`open`/`onOpenChange`
   props) for editing an existing row from a list, so the list can open it
   itself.
3. **Destructive/terminal confirm dialog** — hard deletes, terminal status
   flips (`void`, `cancelled`), or anything else that meaningfully changes
   what the household can see, goes through the shared
   `src/components/confirm-dialog.tsx` (§3.2), never a bespoke one-off
   `AlertDialog`.

### 3.1 Entity → destructive action mapping

| Entity | Action | Mechanism | Tier |
|---|---|---|---|
| Task | Delete | hard delete | 3 — Confirm |
| Task | Complete | `completedAt` set | 1 — Direct |
| Note | Archive / Unarchive | `isArchived` toggle | 1 — Direct |
| KanbanBoard | Archive | `archivedAt` set (no hard delete in V1) | 3 — Confirm |
| Finance Transaction | Void | `status: posted → void`, blocked if any split settled | 3 — Confirm |
| Finance Settlement | Cancel | `status: recorded → cancelled`, reverts cleared splits to unsettled | 3 — Confirm |
| Finance Subscription | Pause / Resume | `status: active ↔ paused` | 1 — Direct |
| Finance Subscription | Mark paid | posts a Transaction, advances `nextDueDate` | 1 — Direct |
| Finance Subscription | Cancel | `status → cancelled` | 3 — Confirm |
| Finance Category | Archive | `archived` toggle | 1 — Direct (config, not user data) |
| Reminder | Cancel | `status → cancelled` | 1 — Direct today (no confirm dialog yet — a small, known gap; low stakes, easily re-created) |

### 3.2 The shared `<ConfirmDialog>`

Referenced by name in `docs/project-structure.md` and this doc for a while
before it existed anywhere — now built at `src/components/confirm-dialog.tsx`,
first consumed by Finance's Void/Cancel actions (`transaction-row-actions.tsx`,
`subscription-row-actions.tsx`, `settlement-list.tsx`):

```tsx
// src/components/confirm-dialog.tsx
"use client";
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = "Confirm",
  variant = "destructive", onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "destructive" | "default";
  onConfirm: () => Promise<unknown>; // may throw — caught and shown inline, dialog stays open
}) { /* AlertDialog wrapping a useTransition'd confirm button; catches a thrown
        error from onConfirm() and renders it above the footer instead of
        closing, so a guard like "undo the settlement before voiding" has
        somewhere to surface (matches every Finance action's actual
        throw-on-rejection shape, not a `{ error? }` return contract). */ }
```

Never build a one-off `AlertDialog` per entity — pass this component's
props instead. Two modules (Kanban's board archive, Calendar's event
delete) built their own inline `AlertDialog` before this component existed;
if you touch either of those files again, migrate them to `ConfirmDialog`
in the same change, but don't go out of your way to do it as a standalone
refactor.

### 3.3 Bulk row selection — out of scope

No module gets a bulk-select checkbox column or a bulk-actions toolbar in
V1. If a future task genuinely needs bulk operations (bulk-delete,
bulk-categorize), that's a deliberate addition to this doc, not something
bolted onto an existing list as an afterthought.

---

## 4. Filters, when a list needs one

Most Home OS lists don't filter at all — the full household-scoped array
renders as-is. When a list does need a filter (Finance Transactions by
category/type, Subscriptions by status), it's a plain controlled
`<Select>`/badge-toggle row above the list, backed by `useState` in a
client wrapper — **not** a URL param. There's no bookmarkable-filtered-view
requirement in V1 (that was §4's rationale in the old TanStack draft); a
member reloading the page just sees the unfiltered list again, which is an
acceptable, deliberately simple V1 tradeoff. If that changes, revisit with
§8's URL-driven design rather than inventing a second ad-hoc state model.

---

## 5. Testing

Colocated tests for the query layer (does the right `where` get built —
`householdId` scoping, visibility, any filter) per `CLAUDE.md` rule 4 and
`docs/access-control.md` §10's "allow and deny in the same commit"
convention. A cross-module Playwright spec exercises the create → edit →
destructive-action flow once per module, under `e2e/`.

---

## 6. Accessibility & responsiveness

No horizontal scrolling: card lists stack naturally at any width. Every
row's actions wrap (`flex flex-wrap gap-2`) rather than clipping on narrow
viewports — verified in-browser at both desktop and mobile widths for every
module built so far, per this project's standing responsive-design
requirement.

---

## 7. Checklist: adding a list to a new entity

1. Write the query (`get-<entities>.ts`): scope by `householdId` (+
   visibility if the entity has it), fixed `orderBy`, no pagination.
2. Export it from the module's `index.ts` barrel.
3. Write `<Entity>List` (§1): empty state, one `<li>` per row, inline row
   actions or a `<EntityRowActions>` component if there are 2+.
4. Row actions (§3): direct actions call the Server Action inline inside
   `useTransition`; Edit opens a controlled `<EntityFormDialog>`;
   destructive/terminal actions open `<ConfirmDialog>` — add a row to
   §3.1's mapping table in the same PR.
5. Write the page: `requireMember()`, fetch in parallel with
   `Promise.all`, pass straight into the list component.
6. Tests: the query's scoping logic, colocated.
7. Run the full `docs/verify.md` checklist before calling it done.

---

## 8. Appendix — V2 target design: TanStack DataTable (not implemented)

Kept for reference only. If a specific list later genuinely needs
column sorting, multi-field filtering, and pagination (see §2's note on
when that might happen), this is the shared design to build against rather
than a one-off: TanStack Table (`@tanstack/react-client-table`, already a
project dependency from initial scaffolding but unused) driving shadcn/ui's
table/menu/popover primitives, URL search params (`page`, `pageSize`,
`sort`, one param per filter) as the single state model so a filtered view
stays bookmarkable and survives a refresh, a shared `src/components/data-table/`
primitive family (`data-table.tsx`, `data-table-column-header.tsx`,
`data-table-pagination.tsx`, `data-table-toolbar.tsx`,
`data-table-view-options.tsx`, `data-table-faceted-filter.tsx`,
`use-data-table-url-state.ts`), and a per-module paginated query function
returning `{ rows, totalCount, pageCount }` with a sortable-column
whitelist (never let a client-supplied sort string reach `orderBy`
unescaped).

Whoever picks this up: write the worked example (query → filter schema →
page → table/columns/row-actions component) the same way §1–§3 above are
grounded in this project's real files, not in the abstract — and update §2's
table for whichever list actually adopts it.
