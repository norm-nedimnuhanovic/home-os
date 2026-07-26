# Home OS — Product Plan

## 1. Overview

Home OS is a multi-tenant web application that unifies a household's life administration — tasks, kanban boards, calendar, reminders, notes, finances, and life-admin records — into a single connected system, shared between the members of a home. The core idea is that nothing lives in an isolated silo: a bill can create a task, a task can appear on the calendar, a reminder can be triggered from anywhere, and a note can point back at any of them. The application is also a **platform**: the eight modules described below (Dashboard, Tasks, Kanban, Calendar, Reminders, Notes, Finance, Life Admin) are the first citizens of an extensible, event-driven architecture designed so that new modules can be added later — by a developer or an agent — without special-casing and without touching existing modules' code.

**Platform shape.** Home OS is a responsive web application, used the same way on desktop and mobile browsers (no separate native app in this plan). It is **multi-tenant**: any household can register independently, and every household's members, data, invites, and settings are strictly isolated from every other household's. There is no cross-household data sharing of any kind.

**Target users.** Members of a single household (couples, families, flat-shares, multi-generational homes) who want one shared place for day-to-day admin instead of a folder of disconnected apps (a to-do app, a separate calendar, a separate budgeting app, a separate notes app, a shared drive for documents). The primary user is not a single individual but the household as a unit — the product succeeds when "what I did shows up for everyone else" with as little friction as possible.

**Guiding principles carried through this plan:**
- **Everything connects** — modules read and build on each other's data rather than duplicating it (a due task is a calendar entry; a bill can spawn a task; a note can link to a task, a bill, or an event).
- **Fast to add things** — quick capture, sensible defaults, low-friction sharing.
- **Household first** — shared by default where it makes sense, private when it should be, and always under the household's own control.

---

## 2. Roles & Household Model

### 2.1 Multi-tenancy

The **Household** is the tenant root of the platform. Every member account and every object created by every module — tasks, boards, events, reminders, notes, transactions, documents, and so on — belongs to exactly one household, and no query, search result, or notification ever crosses that boundary. A household is created directly by its first user (no invite involved): that single action creates one Household record and one Member record with `role = owner`. All subsequent members join exclusively through a named-email **Invite** — there is no public or self-serve join link in V1.

A household carries:
- a display **name**,
- an IANA **timezone**, which determines what counts as "today" on the dashboard, when due dates roll over, and the default digest send time,
- a **base currency** (ISO 4217 code), which Finance uses as the default currency for new Transactions — single-currency for V1, no conversion (see §3.4; resolved in §9 Q20),
- a platform-level **status** (`active` / `suspended` / `closed`) — **suspension** is an action taken *on* a household from outside it (e.g., for abuse or non-payment); V1 has no separate platform-admin role or console, so it has no in-app UI at all — it exists as a schema value reachable only via direct operator action, never something a household triggers on itself. **Closure**, by contrast, *is* household self-service — see §2.2's owner row: it is the owner's own "shut this household down" action, gated by `canCloseHousehold()`. (An earlier draft of this section described both as platform-only, contradicting §2.2's role table; §2.2 is correct and this note is the resolution, not a new decision.)

### 2.2 Roles

Every **Member** has exactly one of three fixed, non-configurable roles for V1:

| Role | Can do |
|---|---|
| **owner** | Everything an admin can, plus: remove anyone (including admins), close the household, transfer ownership to another existing member. A household always has at least one owner; the system blocks any action that would leave it with zero owners, and the last owner cannot be demoted or removed. |
| **admin** | Invite and remove non-owner members; manage sharing on any object across the household for moderation purposes. |
| **member** (default) | Manage their own data and anything assigned to them; share their own objects with the household or with specific members. |

Ownership transfer is a distinct, explicit action (an owner promotes another existing member to owner) — it is never something granted through an Invite, and `owner` is never a role an Invite can target directly (only `admin` or `member`).

### 2.3 Invite flow

1. An owner or admin issues an **Invite**: an email address, a starting role (`admin` or `member`), and a household. Creation is rejected if that email already belongs to an active member of the same household.
2. The invite gets a cryptographically random, single-use **token** embedded in an invite link, and an `expiresAt` defaulting to 7 days from creation.
3. The invitee follows the link and accepts before expiry, creating their **Member** record (`status = active`, `joinedAt = now`) and marking the Invite `accepted` with a reference to the resulting member.
4. Resending an invite regenerates the token and invalidates the previous one. An expired invite must be resent to produce a fresh token before it can be accepted. An invite can also be explicitly `revoked` before acceptance.

### 2.4 Member lifecycle

A member's `status` is `active`, `suspended` (temporarily blocked from login/actions, historical attribution preserved), or `removed` (soft-deleted, loses all access, but past references to them — as a task assignee, note author, bill payer, etc. — remain visible for historical accuracy). `email` is unique **within a household** (not globally — resolved in §9 Q1: one account per household, no cross-household identity in V1), and is the login identity and the target address for that member's email notifications.

---

## 3. Data Model

**Conventions used throughout this section**, to avoid repeating boilerplate on every entity:
- Every entity has an implicit system-generated `id` and, unless a field list says otherwise, `createdAt`/`updatedAt` audit timestamps.
- Every entity except platform-catalog entities (Module, ModuleEventType, EventSubscription, ModulePermissionDeclaration, ModuleSurfaceRegistration) carries a tenant-scoping relation to **Household**, written here as `householdId`.
- **Sharing/visibility is a single platform-wide contract**, not reinvented per module: any shareable entity carries a `visibility` enum — `private | household | specific_members` — plus an owner field (named differently per entity: `createdById`, `authorMemberId`, `uploadedBy`, `paidBy`, etc., called out explicitly below). `private` = visible only to the owner; `household` is evaluated dynamically against current membership at read time (a member who joins later immediately sees pre-existing household-visible items); `specific_members` is the only case that consults the shared **ObjectShare** table. Several early domain drafts modeled a per-entity `sharedWith` field (Document, Renewal, Contact, ShoppingList, Transaction, Note) — in the reconciled model these are **not** separate stored fields; they are all resolved through the one ObjectShare table keyed by `(moduleKey, objectType, objectId)`, so no module needs its own grantee table.
- Enum casing has been normalized to `lower_snake_case` platform-wide; earlier independently authored drafts used inconsistent casing/spelling for equivalent concepts (e.g. Life Admin's `PRIVATE`/`SHARED_HOUSEHOLD`/`SHARED_SPECIFIC`, Notes' `private`/`shared-home`/`shared-specific`, Finance's `private`/`household`/`specific-members`) — these are unified to the single enum `private | household | specific_members` described above.
- Where a reference is described as "polymorphic" or "generic," it is resolved at the application/event layer (module key + entity type + entity id), not enforced as a database-level foreign key — this is intentional, so modules stay loosely coupled and degrade gracefully if a referenced module is absent.

### 3.1 Household, Members & Sharing

#### Household — *must-have V1*
The tenant root; every member and every module object belongs to exactly one.
- `name` (string, required) — 2–80 chars, e.g. "The Nuhanovic Home."
- `timezone` (string, required) — IANA id; defaults to the creator's detected timezone; drives dashboard "today," due-date rollover, digest send time.
- `baseCurrency` (string, required) — ISO 4217 code, e.g. "USD"/"EUR"; set at creation; the default `Transaction.currency` for this household; single-currency for V1 (no conversion — see ExchangeRate, out-of-scope V2).
- `status` (enum, required) — `active | suspended | closed`; default `active`. `suspended` is operator-only, no in-app trigger in V1; `closed` is the owner's own self-service action (§2.1, §2.2) via `closeHousehold()`.
- `createdAt` (date, required) — system-set at registration.
- Relations: hasMany Member; hasMany Invite; tenant-owner of every other module's entities.

#### Member — *must-have V1*
A person's account and household profile combined into one record.
- `household` (relation, required)
- `displayName` (string, required) — 1–80 chars.
- `email` (string, required) — valid format; unique within the household; login identity and notification target.
- `role` (enum, required) — `owner | admin | member`; default `member`; a household must always retain ≥1 owner.
- `status` (enum, required) — `active | suspended | removed`; default `active`.
- `avatarUrl` (string, optional)
- `colorTag` (string, optional) — cosmetic color used on calendar/kanban/task lists.
- `emailVerifiedAt` (date, optional) — set on confirming email during signup/invite acceptance (credential mechanics belong to a platform Auth capability, out of this domain's scope).
- `joinedAt` (date, required) — system-set.
- `lastLoginAt` (date, optional).
- Statuses: `active | suspended | removed`.
- Relations: belongsTo Household; hasMany Invite (sent); referencedBy Invite (accepted-from); hasMany NotificationPreference; hasOne DigestSubscription; hasMany Notification (received); hasMany ObjectShare (as grantee and as grantor); referencedBy across every module as assignee/owner/author/payer.

#### Invite — *must-have V1*
An outstanding or resolved invitation for a named email to join a household with a starting role.
- `household` (relation, required)
- `email` (string, required) — rejected at creation if already an active member of this household.
- `role` (enum, required) — `admin | member` only; default `member`. `owner` is never a direct invite target.
- `invitedByMember` (relation, required) — must currently hold `owner` or `admin`.
- `token` (string, required) — cryptographically random, unique, single-use; resend regenerates it and invalidates the old one.
- `status` (enum, required) — `pending | accepted | expired | revoked`; default `pending`.
- `expiresAt` (date, required) — default `createdAt + 7 days`; acceptance after this is rejected.
- `acceptedAt` (date, optional)
- `acceptedByMember` (relation, optional) — set on acceptance.
- `createdAt` (date, required)
- Statuses: `pending | accepted | expired | revoked`.
- Relations: belongsTo Household; belongsTo Member (invitedByMember); hasOne Member (acceptedByMember, nullable).

#### ObjectShare — *must-have V1*
Generic join table implementing "shared with specific people" for **any** object from **any** module, present or future.
- `household` (relation, required) — denormalized for fast tenant-scoped queries and isolation guarantees.
- `moduleKey` (string, required) — e.g. `tasks`, `notes`, `finance`, `life_admin`.
- `objectType` (string, required) — e.g. `Task`, `Note`, `Subscription`, `Document`.
- `objectId` (string, required) — id of the shared record; polymorphic by convention, not a DB-enforced FK.
- `sharedWithMember` (relation, required)
- `sharedByMember` (relation, required) — must be the object's owner, or a household admin/owner acting for moderation.
- `createdAt` (date, required)
- Relations: belongsTo Household; belongsTo Member (sharedWithMember); belongsTo Member (sharedByMember).
- Consulted only when an object's `visibility = specific_members`.

#### NotificationPreference — *must-have V1*
Per-member, per-category control of which channels a notification category uses.
- `member` (relation, required)
- `categoryKey` (string, required) — canonical key from the platform's notification-category registry, e.g. `task.assigned`, `bill.due_soon`, `reminder.due`, `share.received`, `household.invite_received`. New modules register their own keys; a category's key is the same dot-namespaced key as the `ModuleEventType` that raises it (see §6) — one shared namespace, not two.
- `emailEnabled` (boolean, required) — default `true`.
- `inAppEnabled` (boolean, required) — default `true`. (A category may mark itself "always on / non-dismissible" in-app in the registry itself, not here.)
- `digestEnabled` (boolean, required) — default `true` — whether this category rolls into the digest email.
- `updatedAt` (date, required)
- Relations: belongsTo Member.

#### DigestSubscription — *must-have V1*
One row per member controlling the rolled-up summary email, independent of per-category immediate notifications.
- `member` (relation, required) — 1:1.
- `frequency` (enum, required) — `off | daily | weekly`; default `off`.
- `dayOfWeek` (enum, optional) — required only when `frequency = weekly`.
- `timeOfDay` (string, required) — `HH:mm` 24h, default `07:00`; interpreted in the household's timezone.
- `lastSentAt` (date, optional) — system-set by the digest job.
- `nextRunAt` (date, optional) — system-computed by the digest scheduler; stored for UI display.
- `updatedAt` (date, required)
- Relations: belongsTo Member.

#### Notification — *must-have V1*
The delivered, per-member in-app notification instance that backs the notification/bell inbox feed promised in §6 for every category that isn't already backed by a Reminder. A category whose delivery mechanism is a Reminder (e.g. `bill.due_soon`, `budget.threshold_exceeded` — both created as Reminder rows per §3.4/§4.7) continues to surface in-app via ReminderOccurrence itself, with no duplicate Notification row; Notification instead backs the categories with no Reminder in their path, e.g. a task assigned to you, something shared with you, a household invite received.
- `household` (relation, required)
- `member` (relation, required) — the recipient.
- `categoryKey` (string, required) — same categoryKey namespace as NotificationPreference, e.g. `task.assigned`, `share.received`, `household.invite_received`.
- `sourceModule` (string, optional) / `sourceEntityType` (string, optional) / `sourceEntityId` (relation, optional) — generic pointer back to the object the notification is about, resolved at the application layer like every other polymorphic reference in this plan (§3 conventions).
- `eventOccurrenceId` (relation → EventOccurrence, optional) — the platform event that produced this notification, when applicable.
- `title` (string, required) — display text, snapshotted at creation time.
- `body` (string, optional)
- `readAt` (date, optional) — null = unread; set when the member views/dismisses it in the bell feed.
- `createdAt` (date, required)
- Relations: belongsTo Household; belongsTo Member; optional belongsTo EventOccurrence.
- Created by the notification pipeline (§6) whenever a category's `inAppEnabled` preference is on for the target member, independent of whether `emailEnabled` is also on for that category.

#### CustomRole — *out-of-scope V2*
Household-defined roles beyond the fixed owner/admin/member enum, with a configurable permission set. Fields: `household`, `name`, `permissions` (shape deferred to V2).

#### UserAccount — *out-of-scope V2*
A global identity separate from the per-household Member profile, so one person could hold distinct Member records/roles across multiple households under one login. Fields: `globalEmail` (unique platform-wide), `createdAt`. V1 deliberately collapses identity and household membership into a single Member record.

---

### 3.2 Tasks, Kanban & Calendar

#### Task — *must-have V1*
The core unit of household work; the same row is optionally a Kanban card and, when it carries a due date, automatically surfaces on the Calendar. There is no separate card or calendar-entry entity.
- `id`, `householdId` (required)
- `title` (string, required) — 1–200 chars.
- `description` (string, optional) — long text/markdown.
- `dueDate` (date/datetime, optional) — presence is exactly what makes a task surface on the Calendar and in the dashboard's "tasks due."
- `dueDateAllDay` (boolean, required) — default `true`; if `false`, `dueDate` carries a meaningful time and renders as a timed calendar entry.
- `priority` (enum, required) — `low | medium | high | urgent`; default `medium`; sorting/highlighting only, no automated behavior in V1.
- `assigneeId` (relation → Member, optional) — single assignee per task in V1; null = unassigned.
- `createdById` (relation → Member, required)
- `completedAt` (datetime, optional) — null while open; the single source of truth for completion (no separate boolean).
- `completedById` (relation → Member, optional) — may be null when completion was automation/kanban-driven.
- `parentTaskId` (relation → Task, optional) — makes this row a sub-task; the referenced parent's own `parentTaskId` must be null (one level of nesting only).
- `seriesId` (relation → Task, optional) — for a generated recurrence instance, points to the series' master task.
- `recurrenceRuleId` (relation → TaskRecurrenceRule, optional) — only ever set on a series' master task.
- `boardId` (relation → KanbanBoard, optional) — a task with no board still lives normally in the task list, calendar, and dashboard.
- `columnId` (relation → KanbanColumn, optional) — required if `boardId` set; must belong to the same board.
- `boardPosition` (number, optional) — required if `columnId` set; fractional ordering for cheap drag-reorder.
- `visibility` (enum, required) — `private | household | specific_members`; default `household`.
- `sourceModule` (string, optional) / `sourceEntityId` (relation, optional) — set when a task was auto-created by another module (e.g. Finance for a bill), so the UI can show "created from …" without Tasks needing to know that module's schema.
- `createdAt` / `updatedAt` (required)
- Computed statuses: `open` (completedAt null), `overdue` (completedAt null and dueDate past), `completed` (completedAt set).
- Relations: belongsTo Household; references Member (assignee/creator/completer); self-references (parentTaskId, seriesId); hasOne TaskRecurrenceRule; manyToMany Tag via TaskTag; optional belongsTo KanbanBoard/KanbanColumn; hasMany Reminder (as source, when a Reminder's `sourceType = task`); computed/virtual union with Event for calendar display (no stored relation — a due task is never copied into an Event row).

#### TaskRecurrenceRule — *must-have V1*
The recurrence pattern, held once on a series' master task.
- `taskId` (relation → Task, required, unique 1:1) — must reference a top-level task (no recurring sub-tasks).
- `frequency` (enum, required) — `daily | weekly | monthly | yearly`.
- `interval` (number ≥1, required) — default 1.
- `byWeekday` (enum-array, optional) — meaningful only for `weekly`.
- `endType` (enum, required) — `never | on_date | after_count`; default `never`.
- `endDate` (date, optional) — required iff `on_date`.
- `occurrenceCount` (number ≥1, optional) — required iff `after_count`.
- `createdAt` / `updatedAt` (required)
- Relations: belongsTo Task (1:1, the master).

#### Tag — *must-have V1*
Household-scoped label attachable to Tasks (and reused by Notes — see §3.3).
- `id`, `householdId` (required)
- `name` (string, required) — 1–40 chars, unique per household, case-insensitive.
- `color` (string, optional)
- `createdAt` (required)
- Relations: belongsTo Household; manyToMany Task via TaskTag; manyToMany Note via NoteTag.

#### TaskTag — *must-have V1*
Join row between Task and Tag. `taskId`, `tagId` (both required, composite unique).

#### KanbanBoard — *must-have V1*
A named board grouping tasks into custom columns; a household can have multiple boards.
- `id`, `householdId` (required)
- `name` (string, required) — 1–60 chars.
- `description` (string, optional)
- `position` (number, required) — ordering among the household's boards, drag-reorderable.
- `visibility` (enum, required) — default `household`.
- `archivedAt` (datetime, optional) — soft-archive; columns/tasks/history preserved untouched.
- `createdById` (relation → Member, required)
- `createdAt` / `updatedAt` (required)
- Statuses: `active` (archivedAt null) / `archived` (archivedAt set).
- Relations: belongsTo Household; references Member (createdById); hasMany KanbanColumn; hasMany Task (optional, via Task.boardId).

#### KanbanColumn — *must-have V1*
A single column within a board.
- `id`, `boardId` (required)
- `name` (string, required) — 1–40 chars, e.g. "To do," "Doing," "Done," or custom.
- `position` (number, required) — left-to-right order, drag-reorderable.
- `columnType` (enum, required) — `todo | in_progress | done | custom`; default `custom`; independent of display name — `done`-typed columns drive automatic task completion even if renamed (e.g. to "Finished").
- `createdAt` / `updatedAt` (required)
- Relations: belongsTo KanbanBoard; hasMany Task (cards currently in this column).

#### Event — *must-have V1*
A calendar event: scheduled at a specific time or all day, shared with the household. Never "completed" — it simply occurs.
- `id`, `householdId` (required)
- `title` (string, required) — 1–200 chars.
- `description` (string, optional)
- `location` (string, optional)
- `startAt` (datetime, required)
- `endAt` (datetime, required) — must be ≥ `startAt`.
- `allDay` (boolean, required) — default `false`.
- `visibility` (enum, required) — default `household`.
- `color` (string, optional) — cosmetic UI tag.
- `createdById` (relation → Member, required)
- `sourceModule` (string, optional) / `sourceEntityId` (relation, optional) — forward-compatible provenance mirroring Task's, not wired to anything in V1 (only task due-dates auto-surface per spec).
- `createdAt` / `updatedAt` (required)
- Relations: belongsTo Household; references Member (createdById).

#### EventRecurrenceRule — *out-of-scope V2*
Would let Events repeat (e.g. a weekly appointment), mirroring TaskRecurrenceRule. Same field shape (`frequency`, `interval`, `byWeekday`, `endType`, `endDate`, `occurrenceCount`) against a master Event.

#### TaskAssignment — *out-of-scope V2*
Many-to-many join that would let more than one member be responsible for the same task. V1 keeps a single `assigneeId` directly on Task.

#### EventAttendee — *out-of-scope V2*
Many-to-many join recording which members are specifically invited to an event, beyond the coarse `visibility` setting.

---

### 3.3 Reminders & Notes

#### Reminder — *must-have V1*
The definition/template for a one-off or recurring reminder targeted at a specific member — created manually or programmatically by any other module. This is a shared platform capability; other modules create Reminders through it rather than building their own reminder logic.
- `id`, `householdId` (required)
- `title` (string, required) — short label; if auto-created from a source object, this is a snapshot copied at creation time and is **not** kept in sync with later renames of the source (V1 simplification).
- `description` (string, optional)
- `reminderType` (enum, required) — `one_off | recurring`. A type change is treated as cancel-and-recreate, not an in-place edit.
- `targetMemberId` (relation → Member, required) — same household; V1 supports exactly one target member per reminder.
- `createdByMemberId` (relation → Member, required) — attributed to a system/module actor when auto-created.
- `sourceType` (enum, required) — `manual | task | subscription | renewal | document | budget | other`; default `manual`. (Reconciliation note: Finance's "bill" and "subscription" concepts both resolve to Finance's `Subscription` entity — see §3.4 — so there is a single `subscription` value here rather than separate `bill`/`subscription` values. `budget` covers Budget's threshold/exceeded alerts — see §3.4/§4.7 — which otherwise had no clean sourceType value.)
- `sourceModule` (string, optional) — required whenever `sourceType != manual`; used only to resolve a display link back to the source, not a hard cross-module FK — a reminder still fires with its last known info if the source module/record is later removed.
- `sourceEntityId` (relation, optional) — required whenever `sourceType != manual`; generic reference to the originating Task/Subscription/Renewal/Document/Budget.
- `firstRemindAt` (date, required) — anchor date/time; first occurrence for recurring reminders. For an event-driven source with no future anchor date of its own (currently only `sourceType = budget`, fired the instant a threshold is crossed), `firstRemindAt` is set to the detection time itself (now) and the reminder is created as `reminderType = one_off`, firing immediately rather than being lead-time-computed; `leadTimeValue`/`leadTimeUnit` are left unset in this case.
- `leadTimeValue` (number, optional) / `leadTimeUnit` (enum: `minutes|hours|days|weeks`, optional) — paired; "remind N units before the source's date." When the source's date changes, the next not-yet-fired occurrence is recomputed; fired occurrences stay as history.
- `recurrenceFrequency` (enum, optional) — `daily | weekly | monthly | yearly`; required if recurring.
- `recurrenceInterval` (number, optional) — default 1, ≥1.
- `recurrenceDaysOfWeek` (string, optional) — only for weekly.
- `recurrenceEndDate` (date, optional) — must be after `firstRemindAt`.
- `recurrenceCount` (number, optional) — alternative end condition.
- `status` (enum, required) — `active | paused | cancelled`; default `active`.
- `emailEnabled` (boolean, required) — default `true`; per-reminder override, additionally gated by the target member's own `reminder.due`-category NotificationPreference.
- `createdAt` / `updatedAt` (required)
- Statuses: `active | paused | cancelled`.
- Relations: belongsTo Household; references Member (target, creator); hasMany ReminderOccurrence; polymorphic-source Task / Subscription / Renewal / Document / Budget.

#### ReminderOccurrence — *must-have V1*
One concrete scheduled firing of a Reminder; this is what actually appears as due/overdue on the dashboard and drives notification sending.
- `id`, `reminderId` (required)
- `remindAt` (date, required) — computed from `firstRemindAt` + recurrence, or from the source's date minus lead time.
- `status` (enum, required) — `pending | notified | snoozed | dismissed | completed | missed`; default `pending`. Lifecycle: `pending` → (fires) → `notified` → `{snoozed → back to pending at snoozedUntil | dismissed | completed}`; an occurrence left unacknowledged past a grace window flips to `missed`.
- `notifiedAt` (date, optional)
- `acknowledgedAt` (date, optional)
- `snoozedUntil` (date, optional) — must be future at time of snooze; the same row is reused rather than creating a new one.
- `snoozeCount` (number, required) — default 0, no hard cap in V1.
- `createdAt` (required)
- Statuses: `pending | notified | snoozed | dismissed | completed | missed`.
- Relations: belongsTo Reminder.
- Only one occurrence is ever in `pending`/`notified`/`snoozed` state per reminder at a time — the next is generated lazily once the current one reaches a terminal state, capped by `recurrenceEndDate`/`recurrenceCount`.

#### ReminderRecipient — *out-of-scope V2*
Would let a single reminder independently notify multiple members, each with their own acknowledgement, superseding V1's single `targetMemberId`. Fields: `reminderId`, `memberId`, `acknowledgedAt`.

#### Note — *must-have V1*
A simple, taggable note; operates as a one-off standard note or a dated daily-journal entry; optionally linked to a task, subscription, or event via NoteLink.
- `id`, `householdId` (required)
- `authorMemberId` (relation → Member, required) — the visibility "owner" field for this entity.
- `title` (string, optional) — falls back to first line of body if blank.
- `body` (string, required) — min length 1.
- `noteType` (enum, required) — `standard | journal`; default `standard`.
- `entryDate` (date, optional) — required iff `noteType = journal`; at most one journal note per `(authorMemberId, entryDate)` — opening "today's entry" upserts rather than duplicates.
- `visibility` (enum, required) — `private | household | specific_members`; default `private` for journal notes, `household` for standard notes, overridable per note.
- `tags` (manyToMany via NoteTag → Tag) — reuses the same Tag entity/taxonomy as Tasks (§3.2) rather than a separate tag list.
- `isPinned` (boolean, required) — default `false`.
- `isArchived` (boolean, required) — default `false` — soft-hide from default lists/search, still reachable via an explicit filter.
- `createdAt` / `updatedAt` (required)
- Statuses (type, not lifecycle): `standard | journal`.
- Relations: belongsTo Household; references Member (author); hasMany NoteLink.

#### NoteTag — *must-have V1* (reconciliation addition, same shape as TaskTag)
Join row between Note and Tag. `noteId`, `tagId` (both required, composite unique).

#### NoteLink — *must-have V1*
A generic, extensible join connecting a Note to another object elsewhere in the system.
- `id`, `noteId` (required)
- `linkedEntityModule` (string, required) — e.g. `tasks`, `finance`, `calendar`.
- `linkedEntityType` (enum, required) — V1 supported values: `task | subscription | event` (reconciliation: earlier drafts used "bill"; the concrete Finance entity is `Subscription` — see §3.4). Modeled as an open enum specifically so a future module can register a new linkable type without a schema change.
- `linkedEntityId` (relation, required) — generic reference, not a hard cross-module FK.
- `createdByMemberId` (relation → Member, required)
- `createdAt` (required)
- Relations: belongsTo Note; references Member; polymorphic-target Task / Subscription / Event.

---

### 3.4 Finance

*Reconciliation note:* the spec's "bills" and "subscriptions" are a single entity here, **Subscription** — a recurring charge with a due-date cadence. **Transaction** is the atomic expense/income record (a subscription's paid occurrence is one kind of Transaction). Where other domains refer generically to "a bill," they mean Subscription.

#### Category — *must-have V1*
User-facing classification label for income/expenses; shared by Transaction, Budget, Subscription.
- `household` (required)
- `name` (string, required) — unique per household + type.
- `type` (enum, required) — `expense | income | both`; default `expense`; constrains which Transaction.type it can be used with.
- `color` / `icon` (optional)
- `isSystemDefault` (boolean, required) — default `false`; `true` for platform-seeded starter categories at household creation (Groceries, Utilities, Rent/Mortgage, Transport, Entertainment, Healthcare, Salary, Other Income, etc.), still editable/archivable.
- `archived` (boolean, required) — default `false`; hidden from new-entry pickers, valid on historical records.
- `sortOrder` (number, optional)
- Relations: belongsTo Household.

#### Transaction — *must-have V1*
A single expense or income record — the atomic unit of Finance.
- `household` (required)
- `type` (enum, required) — `expense | income`; amount is always stored positive, sign derived from type.
- `amount` (number, required) — > 0; currency-safe decimal.
- `currency` (string, optional) — defaults to the household's base currency; V1 is informational only, no conversion.
- `category` (relation → Category, required) — type must be compatible.
- `title` (string, required)
- `notes` (string, optional)
- `date` (date, required) — when it occurred; drives MonthlySummary bucketing and Budget period matching.
- `paidBy` (relation → Member, required) — who paid/received; the visibility "owner" field for this entity; basis of "who paid" and split auto-settlement.
- `source` (enum, required) — `manual | subscription | imported`; default `manual`; `imported` reserved for a future bank-import feature (out-of-scope V2).
- `subscription` (relation → Subscription, optional) — set only when `source = subscription`.
- `attachment` (relation → Document, optional) — reuses Life Admin's Document/file storage for receipts rather than Finance building its own.
- `linkedNote` (relation → Note, optional)
- `linkedTask` (relation → Task, optional) — e.g. a "reconcile receipt" or "dispute charge" task.
- `visibility` (enum, required) — default `household`.
- `splitType` (enum, required) — `none | equal | percentage | custom`; default `none`.
- `splits` (hasMany → TransactionSplit) — present when `splitType != none`.
- `status` (enum, required) — `posted | void`; default `posted`; `void` is a soft-cancel used instead of hard delete once split/settled against.
- Statuses: `posted | void`.
- Relations: belongsTo Household/Category; references Member (paidBy); optional references Subscription/Document/Note/Task; hasMany TransactionSplit.

#### TransactionSplit — *must-have V1*
One member's share of a Transaction, used to compute who owes whom.
- `transaction` (required)
- `member` (relation, required) — unique per (transaction, member).
- `shareAmount` (number, required) — ≥0; sum across a transaction's splits must equal `Transaction.amount`.
- `sharePercent` (number, optional) — derived display value, not authoritative.
- `settled` (boolean, required) — default `false`; the payer's own split is auto-settled at creation.
- `settledBy` (relation → Settlement, optional)
- Relations: belongsTo Transaction; belongsTo Member; optional belongsTo Settlement.

#### Settlement — *must-have V1*
A ledger entry recording one member repaying another — not a payment gateway integration.
- `household` (required)
- `fromMember` / `toMember` (relation, required) — must differ.
- `amount` (number, required) — > 0.
- `date` (date, required) — defaults to today.
- `method` (string, optional) — free text (e.g. "cash," "bank transfer").
- `note` (string, optional)
- `status` (enum, required) — `recorded | cancelled`; default `recorded`; cancellation preserves audit trail instead of deletion.
- `appliesTo` (manyToMany → TransactionSplit, optional) — the specific outstanding shares cleared; if omitted, treated as a free-standing balance adjustment.
- Statuses: `recorded | cancelled`.
- Relations: belongsTo Household; references Member (from/to); manyToMany TransactionSplit.
- **Settlement is the only new fact ever written to adjust a balance** — `TransactionSplit.settled` and MemberBalance are always derived from Transaction + TransactionSplit + Settlement, never edited directly, so "who owes whom" stays reconstructable from history.

#### Budget — *must-have V1*
A spending limit for a category over a recurring period, optionally scoped to one member, with a threshold-alert.
- `household`, `category` (required)
- `member` (relation, optional) — null = whole-household budget; set = personal budget.
- `period` (enum, required) — `weekly | monthly | yearly`; default `monthly`.
- `amount` (number, required) — > 0.
- `effectiveFrom` (date, required)
- `endDate` (date, optional) — null = ongoing.
- `alertThresholdPercent` (number, required) — default 80.
- `alertOnExceeded` (boolean, required) — default `true`.
- `rolloverUnused` (boolean, required) — default `false`, reserved flag; behavior out-of-scope V2, always `false` in V1.
- Unique constraint: one active Budget per `(household, category, member, period)`.
- Actual spend = sum of expense Transactions matching category (and member, if set) whose date falls in the current period.
- Relations: belongsTo Household/Category; optional belongsTo Member; hasMany Reminder (created when a threshold/exceeded alert fires).

#### Subscription — *must-have V1*
A recurring bill/subscription with a due-date cadence and alert-before-due behavior. Distinct from a one-off Transaction.
- `household` (required)
- `name` (string, required) — e.g. "Netflix," "Rent," "Electricity."
- `merchant` (string, optional)
- `category` (relation, required)
- `amount` (number, required) — > 0; expected charge.
- `variableAmount` (boolean, required) — default `false`; treated as an estimate when true.
- `frequency` (enum, required) — `weekly | biweekly | monthly | quarterly | yearly | custom`; default `monthly`.
- `customIntervalDays` (number, optional) — required when `frequency = custom`.
- `startDate` (date, required)
- `endDate` (date, optional)
- `nextDueDate` (date, required) — recalculated from frequency after each occurrence marked paid.
- `alertDaysBefore` (number, required) — default 3.
- `responsibleMember` (relation → Member, required)
- `autoCreateTransaction` (boolean, required) — default `false`; if true, a Transaction (`source = subscription`) is generated automatically on the due date.
- `status` (enum, required) — `active | paused | cancelled`; default `active`.
- `lastPaidDate` (date, optional)
- Statuses: `active | paused | cancelled`.
- Relations: belongsTo Household/Category; references Member (responsible); hasMany Transaction; hasMany Reminder (alert-before-due instance); hasMany Task (optional follow-up, e.g. overdue-unpaid).

#### MonthlySummary — *must-have V1 (computed view, not necessarily a stored table)*
The aggregated financial picture for a household for one calendar month.
- `household`, `month` (required)
- `totalIncome` / `totalExpense` / `netBalance` (computed)
- `byCategoryBreakdown` (computed list of `{category, total}`)
- `byMemberBreakdown` (computed list of `{member, total}`)
- `budgetsVsActual` (computed list referencing Budget, annotated with `amountSpent`/`percentUsed`)
- `subscriptionsDueCount` (computed)
- `generatedAt` (date, optional) — only relevant if cached.
- Authoritative source is always the underlying Transaction/Budget/Subscription records; a cached snapshot may mirror the same fields for performance without changing the contract.

#### MemberBalance — *must-have V1 (computed view)*
The "who paid / who owes" pairwise balance between two members, derived from unsettled TransactionSplit shares minus recorded Settlements.
- `household`, `memberA`, `memberB` (required)
- `netAmount` (number, required) — computed; sign convention fixed by the UI layer.
- `asOf` (date, optional) — if cached rather than computed live.
- Purely derived — never edited directly.

#### PaymentAccount — *out-of-scope V2*
A bank/cash/card account with a reconciled balance; `Transaction.paidBy` (a Member) is sufficient for V1. Fields: `household`, `name`, `type`, `owner`, `currentBalance`.

#### ExchangeRate — *out-of-scope V2*
Currency conversion rate to support multi-currency households; V1 assumes one household base currency. Fields: `baseCurrency`, `targetCurrency`, `rate`, `asOfDate`.

---

### 3.5 Life Admin

#### Document — *must-have V1*
A stored file (scan, photo, PDF, receipt, manual, policy) that stands alone or attaches to another record; a reusable capability any domain can use rather than building its own file concept.
- `household` (required)
- `title` (string, required)
- `fileRef` (string, required) — conceptual pointer/handle to the stored binary.
- `mimeType` (string, optional) — used for preview and an allowed-type upload policy.
- `fileSizeBytes` (number, optional) — uploads over a configured max are rejected (fixed platform-wide limit — resolved in §9 Q27).
- `category` (enum, optional) — `warranty_proof | insurance_policy | id_document | receipt | manual_guide | contract | property_record | other`; default `other`.
- `description` (string, optional)
- `linkedEntityType` (enum, optional) — `renewal | contact | subscription | task | note | event | none`; must be set together with `linkedEntityId` (both or neither).
- `linkedEntityId` (relation, optional)
- `uploadedBy` (relation → Member, required) — the visibility "owner" field for this entity.
- `visibility` (enum, required) — default `household`.
- `createdAt` / `updatedAt` (required)
- Relations: belongsTo Household; belongsTo Member (uploadedBy); polymorphic-target for Renewal / Contact / Subscription / Task / Note / Event.

#### Renewal — *must-have V1*
Any household item with an expiry/renewal date that should automatically trigger a reminder — warranties, insurance, registrations/licenses, memberships, leases, domain/hosting renewals, etc. "Warranty" is one of its `type` values, not a separate entity.
- `household` (required)
- `title` (string, required)
- `type` (enum, required) — `warranty | insurance | registration_license | membership_subscription | certificate_id | lease_contract | domain_hosting | other`.
- `provider` (string, optional)
- `purchaseOrIssueDate` (date, optional) — should be ≤ `expiryDate`.
- `expiryDate` (date, required) — drives status and reminder scheduling.
- `reminderOffsetsDays` (number-array, required) — days before expiry to fire a reminder; default `[30]`; each ≥0.
- `recurrence` (enum, required) — `none | monthly | quarterly | annual | custom_interval`; default `none`; if not `none`, "mark as renewed" can auto-advance `expiryDate`.
- `status` (enum, required) — system-maintained: `active` → `expiring_soon` (inside earliest reminder window) → `expired` (past expiry), unless `cancelled` or `renewed` for the current cycle; default `active`.
- `responsibleMember` (relation, optional)
- `providerContact` (relation → Contact, optional)
- `lastRenewedAt` (date, optional)
- `visibility` (enum, required) — default `household`.
- `createdBy` (relation → Member, required)
- `createdAt` / `updatedAt` (required) — changing `expiryDate`/`reminderOffsetsDays` must regenerate associated reminders (old ones cancelled) to avoid duplicate emails.
- Statuses: `active | expiring_soon | expired | renewed | cancelled`.
- Relations: belongsTo Household; belongsTo Member (responsible, createdBy); belongsTo Contact (providerContact); hasMany Document; hasMany Reminder (one per `reminderOffsetsDays` entry — this is how "automatically trigger reminders" is fulfilled).

#### Contact — *must-have V1*
An important household contact kept for quick reference and linkable from other Life Admin records.
- `household` (required)
- `name` (string, required)
- `category` (enum, required) — `medical | emergency_services | home_service_provider | insurance_agent | landlord_property_manager | school_childcare | financial_legal | utility_provider | family_friend | other`; default `other`.
- `phone` / `email` / `address` / `website` (string, optional) — at least one of phone/email/address required.
- `notes` (string, optional)
- `isPinned` (boolean, required) — default `false`; surfaces in a quick-access "important contacts" list.
- `visibility` (enum, required) — default `household`.
- `createdBy` (relation → Member, required)
- `createdAt` / `updatedAt` (required)
- Relations: belongsTo Household; belongsTo Member (createdBy); hasMany Renewal (inverse of providerContact); hasMany Document.

#### ShoppingList — *must-have V1*
A shared or personal household list (shopping, chores, packing, gift ideas) grouping ShoppingListItem entries.
- `household` (required)
- `name` (string, required)
- `type` (enum, required) — `shopping | household_tasks | packing | gift_ideas | other`; default `shopping`.
- `description` (string, optional)
- `isArchived` (boolean, required) — default `false`.
- `visibility` (enum, required) — default `household`.
- `createdBy` (relation → Member, required)
- `createdAt` / `updatedAt` (required)
- Relations: belongsTo Household; belongsTo Member (createdBy); hasMany ShoppingListItem (cascades on delete).

#### ShoppingListItem — *must-have V1*
A single line item on a ShoppingList.
- `list` (relation, required)
- `name` (string, required)
- `quantity` (string, optional) — free-form (e.g. "2," "1 pack," "500g").
- `category` (string, optional) — free-text grouping.
- `isChecked` (boolean, required) — default `false`; flipping to true stamps `checkedBy`/`checkedAt`; flipping back clears both.
- `checkedBy` / `checkedAt` (optional) — set only while checked.
- `addedBy` (relation → Member, required)
- `sortOrder` (number, required) — supports drag-reordering.
- `notes` (string, optional)
- `createdAt` / `updatedAt` (required)
- Relations: belongsTo ShoppingList; belongsTo Member (addedBy, checkedBy).

#### DocumentVersion — *out-of-scope V2*
Historical version of a re-uploaded Document (V1 simply overwrites `fileRef` on re-upload, no history). Fields: `document`, `versionNumber`, `fileRef`, `uploadedBy`, `createdAt`.

#### RenewalHistory — *out-of-scope V2*
Log of past renewal cycles for a Renewal, for multi-year review. Fields: `renewal`, `previousExpiryDate`, `renewedAt`, `renewedBy`, `amountPaid`, `notes`.

#### ShoppingListTemplate — *out-of-scope V2*
A reusable template that seeds a fresh ShoppingList with default items, optionally on a schedule. Fields: `household`, `name`, `defaultItems`, `recurrence`, `createdBy`.

---

### 3.6 Platform & Extensibility

#### Module — *must-have V1*
Catalog entry for one installed app/module (the 8 built-ins, plus any future ones added via code).
- `key` (string, required) — unique, immutable, e.g. `tasks`, `finance`, `kanban`; lowercase snake_case, unique across the whole platform catalog (global, not per-household).
- `name` / `description` (required/optional)
- `version` (string, required) — semver-style; bumped whenever exposed events/actions/data shape change.
- `kind` (enum, required) — `built_in | custom`.
- `status` (enum, required) — `active | disabled | error`; platform-wide switch set by whoever maintains the code, not by a household.
- `dependsOnModules` (self many-to-many, optional) — soft dependencies used to compute `healthStatus` and support graceful degradation.
- `healthStatus` (enum, required) — `ok | degraded | missing_dependency`; derived.
- `installedAt` (date, required)
- `registeredBy` (relation → Member, optional) — or a system sentinel for pre-seeded built-ins.
- Statuses: `active | disabled | error`.
- Relations: self manyToMany (dependsOnModules); references Member (registeredBy).

#### ModuleEventType — *must-have V1*
The declared contract for one "notable moment" a module can announce (e.g. `task.completed`, `bill.due_soon`) — the mechanism that lets modules cooperate without knowing about each other.
- `owningModule` (relation → Module, required)
- `key` (string, required) — dot-namespaced, unique per module, e.g. `task.completed`; validated as `<module_key>.<event_name>`.
- `label` (string, required) — human-readable description.
- `payloadSummary` (string, required) — conceptual description of included fields; the promise other modules code against.
- `contractVersion` (number, required) — incremented on any breaking change; existing subscribers keep working against the old contract until they migrate.
- `relatedEntityType` (string, optional) — informational link, not a hard FK.
- Relations: belongsTo Module (owningModule).

#### EventSubscription — *must-have V1*
One module's registration to react to another module's announced event.
- `subscriberModule` (relation → Module, required)
- `eventType` (relation → ModuleEventType, required)
- `reactionDescription` (string, required) — plain description of what happens.
- `active` (boolean, required) — default `true`.
- `onFailure` (enum, required) — `ignore | log_only | disable_after_n_failures`; default `log_only`.
- `consecutiveFailureCount` (number, required) — default 0, reset on success.
- `lastTriggeredAt` / `lastError` (optional)
- Statuses: `active | inactive`.
- Relations: belongsTo Module (subscriberModule); belongsTo ModuleEventType.

#### EventOccurrence — *must-have V1*
A record that a declared event actually fired for a given household — backs reliable delivery, cross-module reactions, and debugging (short/rolling retention acceptable).
- `household` (relation, required) — tenant isolation of runtime event data.
- `eventType` (relation → ModuleEventType, required)
- `emittedByModule` (relation → Module, required) — denormalized copy of `eventType.owningModule`.
- `occurredAt` (date, required)
- `triggeredByMember` (relation, optional) — null for system/time-based triggers.
- `payloadSnapshot` (string, required) — conceptual JSON snapshot matching `eventType.payloadSummary`'s shape.
- `subscriptionsNotified` (number, required) — count of active EventSubscription rows processed.
- Relations: belongsTo Household; belongsTo ModuleEventType; belongsTo Module; belongsTo Member (optional).

#### ModulePermissionDeclaration — *must-have V1*
The manifest of what a module needs to function — declared by the module's own code, independent of household approval.
- `module` (relation, required)
- `resourceDomain` (enum, required) — `tasks | kanban | calendar | reminders | notes | finance | life_admin | members_household | notifications_email | cross_module_events`.
- `accessLevel` (enum, required) — `read | write | read_write`.
- `purpose` (string, required) — human-readable justification shown to the household on review.
- `isRequired` (boolean, required) — `false` = module must degrade gracefully without it; `true` = module non-functional without it.
- Relations: belongsTo Module.

#### ModuleGrant — *must-have V1*
What one specific household has actually approved for a module — reviewable and revocable at any time, per household.
- `household`, `module`, `permissionDeclaration` (relation, required)
- `status` (enum, required) — `granted | revoked | pending_review`. For the 8 built-in modules, every required-declaration grant row is seeded as `granted` automatically at household creation (attributed to the creating owner) so all 8 apps work immediately with zero setup friction, per §7; `pending_review` is the default only the first time a **custom** (non-built-in) module becomes relevant to a household. A household can still review and revoke a built-in module's grants at any time after the fact.
- `grantedBy` / `grantedAt` (required when granted)
- `revokedBy` / `revokedAt` (optional)
- Business rule (not a stored field): all of a module's `isRequired = true` declarations must be `granted` for that household for the module to be usable there; revoking any of them disables the module for that household only — `Module.status`/`healthStatus` stay platform-wide and unaffected.
- Statuses: `granted | revoked | pending_review`.
- Relations: belongsTo Household; belongsTo Module; belongsTo ModulePermissionDeclaration; references Member (grantedBy/revokedBy).

#### ModuleSurfaceRegistration — *must-have V1*
Declares where a module plugs into the platform's shared UI surfaces, so "appears everywhere the built-ins do" is data-driven rather than hardcoded.
- `module` (relation, required)
- `surface` (enum, required) — `dashboard_widget | global_search_provider | command_palette_action | navigation_item | quick_capture_target | email_notification_category`.
- `label` / `icon` (required/optional)
- `target` (string, required) — conceptual pointer to what the surface links to/invokes.
- `sortOrder` (number, optional) — default 0.
- `enabled` (boolean, required) — default `true`; lets a module hide one surface without deactivating the whole module.
- Relations: belongsTo Module.

#### AutomationRule — *out-of-scope V2*
User-facing "when this, then that" rule wiring a `ModuleEventType` trigger to an action in another module. The spec names this as the payoff of the event architecture, but no automation-builder UI is among the 8 required apps — V1 ships only the underlying event bus this would consume later. Fields (for future reference): `household`, `name`, `triggerEventType`, `conditionExpression`, `actionModule`, `actionDescription`, `active`, `createdBy`.

---

## 4. Feature Spec Per Module

### 4.1 Dashboard

The Dashboard is a query/aggregation layer over other modules' entities — it introduces no new stored data beyond what's needed for personalization.

- **"Today" view.** Composes four independently queryable lists, each filtered by the viewer's own visibility rules and merged only for display:
  - *Tasks due* — Task rows where `dueDate` is today-or-overdue and not completed; overdue sorts first, then by due time.
  - *Today's events* — Event rows whose start falls in the household's "today" window, merged in time order with Tasks due today (the same calendar union described in §4.4, just windowed to today).
  - *Upcoming bills* — Subscription rows where `nextDueDate` is within a lookahead window (fixed 7 days — resolved in §9 Q32) and not yet paid for the current cycle.
  - *Active reminders* — ReminderOccurrence rows targeted at the current member (or the whole household) in `pending`/`notified` state, ordered by `remindAt`.
  Every row, regardless of source module, resolves to a common shape: title/summary, source module + entity type + id (for deep-linking back), a due/trigger datetime, an assignee/target member, and a status/priority indicator. Every module is expected to expose this projection — it's the contract Dashboard, Search, and the command palette all read.
- **Quick capture.** A global affordance, reachable from any screen, for the three creatable-anywhere types named in the spec: task, note, reminder. Each of Tasks/Notes/Reminders registers a `ModuleSurfaceRegistration` row (`surface = quick_capture_target`) describing its minimal creation form. Submission is a direct, synchronous create against the normal Task/Note/Reminder entity using each module's own defaults (owner = current member, default visibility, default list/board/inbox where applicable) — there is no separate staging/draft entity.
- **Cross-entity search.** Searches every entity flagged searchable via `ModuleSurfaceRegistration` rows (`surface = global_search_provider`), so a newly added module becomes searchable by registering rather than by Dashboard code being modified. Delegates to each entity's own visibility rules — a private item only ever returns to its owner. Results share the same common projection as dashboard rows.
- **Command palette.** Sourced the same way, from `ModuleSurfaceRegistration` rows (`surface = command_palette_action`) — search and palette are two presentations of one underlying registry.
- Household/Member/Invite affordances (pending-invite banners, members/settings admin page, notification-preference and digest settings) are treated as first-class dashboard/nav surfaces, consistent with every module.

### 4.2 Tasks

- Create and manage tasks with title, description, due date (with all-day vs timed distinction), priority, and a single responsible member.
- **Sub-tasks**: one level of nesting via `parentTaskId`; a sub-task has full Task capability (own due date, assignee, priority) rather than a stripped-down checklist item, at the accepted cost that a sub-task can, in principle, surface on the calendar independently of its parent.
- **Tags**: household-scoped, shared taxonomy with Notes, attached via TaskTag.
- **Recurring tasks**: defined once via TaskRecurrenceRule on the series' master task; the next occurrence is generated lazily — only when the current open instance is completed, with its due date computed relative to the completed instance's own due date — so the system never materializes an unbounded number of future rows. Only one live occurrence of a recurring task is ever shown at a time in V1.
- **Completion & overdue**: completion is `completedAt` (single source of truth, not a boolean); overdue is computed (`completedAt` null and `dueDate` in the past), surfaced in the task list, dashboard, and calendar.
- Tasks can be created by other modules (Finance, Life Admin) via `sourceModule`/`sourceEntityId`, letting the UI show "created from Bill: Electric" with a working link back — the dependency always points inward (other modules call into Tasks; Tasks never calls out to them).
- Emits domain events (`task.created`, `task.assigned`, `task.completed`, `task.overdue`, `task.due_soon`) for Notifications, Reminders, Dashboard, Search, and future automations to subscribe to.

### 4.3 Kanban

- Board view of tasks organized into columns; multiple boards per household for different areas (e.g. "Household Chores," "Home Improvement").
- **A card is a Task, not a wrapper** — Task carries optional `boardId`/`columnId`/`boardPosition`; a task not on any board simply has these null and still lives normally in the plain task list/calendar/dashboard. A task belongs to at most one board at a time.
- Drag cards between columns; fractional `boardPosition` supports cheap reordering without renumbering siblings.
- **Kanban ↔ completion sync**: `KanbanColumn.columnType` (independent of display name) drives the business rule — moving a card into a `done`-typed column sets `Task.completedAt = now` (if not already set); moving it out clears `completedAt`. The reverse direction (completing from the plain list auto-moving the card) is resolved in §9 Q10: yes, it auto-moves to the first `done`-typed column.
- Boards are soft-archived (`archivedAt`), never hard-deleted in V1 — columns and tasks (and their history) are preserved untouched and simply hidden from default views/search/dashboard.
- Emits `card.moved` (and reuses Task's events) for other modules/automations.

### 4.4 Calendar

- Month, week, and day views of events, showing the whole household's shared events (subject to each event's own visibility).
- **The calendar is a query, not a duplicated store.** "Tasks with due dates appear on the calendar automatically" is implemented by having every calendar view fetch two sources for the visible date range — Event rows, and Task rows where `dueDate` falls in range — and render them together. No Event row is ever created for a task; there is exactly one record for a due task, so editing/completing it from the task list, its Kanban card, or the calendar all change the same row.
- `Event.allDay` and `Task.dueDateAllDay` both distinguish all-day chips from timed entries on week/day views.
- Events in V1 are one-off only — no recurrence (EventRecurrenceRule is V2; the spec is silent on event recurrence, unlike Tasks/Reminders).
- Emits `event.created`, `event.starting_soon` for Reminders/Dashboard/automations.

### 4.5 Reminders

- One-off and recurring reminders aimed at a specific member, creatable directly by a member or programmatically by any other module (a bill, a renewal date, a task) via the shared Reminder capability — this is what the spec means by "reminders... provided once by the platform."
- The unit of "firing" is the **ReminderOccurrence**, not the Reminder itself. When an occurrence's `remindAt` is reached (via a background scheduling job — see §7), it transitions `pending → notified` and emits a `reminder.due` event, which drives (a) an in-app surface — the occurrence shows in the target member's "active reminders" on the Today dashboard and a notification/bell surface until acknowledged — and (b) an email built from the reminder's title/description/`remindAt` and a deep link back to the source object if not manual.
- Email sending requires **both** the reminder's own `emailEnabled` flag and the target member's household-wide "Reminders" NotificationPreference category to be on; in-app visibility is unaffected by either.
- Acknowledgement actions (snooze, dismiss, complete) are in-app only in V1 — no email for these, keeping email volume to "things that matter."
- Recurring reminders generate occurrences lazily, same pattern as recurring tasks: only one occurrence is ever live at a time, capped by `recurrenceEndDate`/`recurrenceCount`.
- **Graceful degradation**: because `sourceEntityId`/`NoteLink.linkedEntityId` are resolved at the application/event layer rather than as hard DB foreign keys, a Reminder whose source module is later removed simply stops resolving its "view source" link but keeps firing with its last known title.
- Emits `reminder.created`, `reminder.due`, `reminder.snoozed`, `reminder.completed`, `reminder.cancelled`.

### 4.6 Notes

- Simple notes with tags (reusing the Tasks module's Tag taxonomy), pinning, and archiving.
- A **daily notes/journal** space: `noteType = journal` with `entryDate`, at most one entry per member per calendar day, upserted rather than duplicated when a member opens "today's entry."
- **Linking**: a note can link to a related task, subscription, or event via NoteLink — a generic, extensible join (`linkedEntityModule`/`linkedEntityType`/`linkedEntityId`) so a future module's entities can become linkable without a NoteLink schema change.
- Default visibility: `private` for journal notes (personal reflection), `household` for standard notes (useful to everyone by default), overridable per note.
- Emits `note.created`, `note.linked` for automations.

### 4.7 Finance

- **Expenses & income**: logged as Transactions, categorized via the shared Category vocabulary, with `paidBy` recording who actually paid/received.
- **Budgets**: a spending limit per category per period (weekly/monthly/yearly), optionally scoped to one member; alert thresholds (`alertThresholdPercent`, default 80%, and `alertOnExceeded`) create a platform Reminder rather than Finance sending email directly.
- **Subscriptions & recurring bills**: Subscription entities carry `nextDueDate`, `frequency`, `alertDaysBefore` (default 3) — an alert-before-due Reminder is created/updated the same way Budget alerts are, and can optionally auto-generate a paid-occurrence Transaction (`autoCreateTransaction`) or be logged manually by the responsible member.
- **Monthly summary**: MonthlySummary is a computed view — income vs expense, category/member breakdowns, budget-vs-actual, computed on demand from Transaction/Budget/Subscription (cacheable later without changing the contract).
- **Who paid / who owes**: TransactionSplit records each member's share of a Transaction when `splitType != none` (equal/percentage/custom); Settlement is the only new fact ever written to record a repayment; MemberBalance is a purely derived pairwise view, never edited directly — this keeps the balance auditable and reconstructable from history rather than a mutable running total.
- **Reuse, not reinvention**: Transaction can attach a Document (receipt/invoice, reusing Life Admin's file capability), a linked Note, or a linked Task (e.g. "dispute charge") instead of Finance building its own file store, notes, or action items. Bill due-dates surface on the calendar only indirectly, via a linked Task with a due date — Finance introduces no calendar-event concept of its own.
- Emits `transaction.recorded`, `bill.due_soon`, `budget.threshold_exceeded`, `settlement.recorded` for Reminders/Dashboard/automations.

### 4.8 Life Admin

- **Documents**: a reusable file capability (title, `fileRef`, category, optional link to a Renewal/Contact/Subscription/Task/Note/Event) so other modules attach proof/paperwork without their own file concept — Finance's receipt attachments reuse this directly.
- **Renewals**: any item with an expiry/renewal date — warranties, insurance, registrations/licenses, memberships, leases, domain/hosting — with a computed status lifecycle (`active → expiring_soon → expired`, or `renewed`/`cancelled`) and one Reminder per configured `reminderOffsetsDays` entry (default `[30]` days before expiry). This is how "renewal and expiry dates trigger reminders automatically" is fulfilled: Life Admin decides *when* a reminder should exist; Reminders owns firing and delivery. Changing `expiryDate`/`reminderOffsetsDays` regenerates the associated reminders (old ones cancelled) to avoid duplicate emails. Task-creation-from-a-renewal is intentionally **not** a hard-coded Life Admin behavior — it's left to the household's own future automation rules reacting to `renewal.*` events, keeping Life Admin decoupled from Tasks.
- **Contacts**: important household contacts (medical, emergency, service providers, insurance agents, landlords, schools, etc.), pinnable for quick access, linkable from Renewal (`providerContact`) and Document.
- **Shared shopping & household lists**: ShoppingList (typed: shopping/household_tasks/packing/gift_ideas/other) grouping ShoppingListItem entries that any member with access can add and check off, with `checkedBy`/`checkedAt` stamped on check.
- All five entities share the same visibility + owner pattern (default `household`, matching "shared by default, private when it should be") and the same tenant-scoping.
- Renewal degrades gracefully if the Reminders module is ever missing: the record still saves and its status is still computed locally from `expiryDate`; it simply won't produce the in-app/email nudge.
- Emits `renewal.created`, `renewal.expiring_soon`, `renewal.expired`, `renewal.renewed`, `renewal.cancelled`, `contact.created`, `contact.updated`, `document.uploaded`, `document.linked`, `shoppingList.item_added`, `shoppingList.item_checked`, `shoppingList.item_unchecked`.

---

## 5. Sharing & Household-Wide Behavior

- **Everyone in the home can be added as a member** via Invite (§2.3); every module's data is scoped to the household the acting member belongs to.
- **Visibility contract** (one mechanism, reused by every module): every shareable entity carries `visibility` (`private | household | specific_members`) and an owner field.
  - `private` — visible only to the owner (resolved in §9 Q3: no admin/owner override — private always means private).
  - `household` — evaluated dynamically against current membership at read time; a member who joins later immediately sees pre-existing household-visible items, with no backfill needed.
  - `specific_members` — the concrete grantee list lives in the single shared **ObjectShare** table (`moduleKey`/`objectType`/`objectId`/`sharedWithMember`/`sharedByMember`), not duplicated per module. `sharedByMember` must be the object's owner, or a household admin/owner acting for moderation.
- **Sensible per-module defaults**: standard notes, tasks, boards, events, and most Life Admin/Finance records default to `household`; journal notes default to `private`. Each module picks its own sensible default — the platform only defines the enum and enforcement mechanism.
- **Assignment**: tasks and reminders are assigned to a specific member (`Task.assigneeId`, `Reminder.targetMemberId`); the assignee is always visible on the object regardless of the object's own `visibility` (so "who's responsible" is never hidden from the rest of the household when the object itself is household-visible).
- **Changes propagate to everyone**: because every module reads live from the same underlying tables scoped by household, any change one member makes (completing a task, adding an expense, checking a shopping item) is visible to every other member with access on their next page load/navigation (see §7 on refresh/refetch sync — no live push in V1).
- **Role-based moderation**: owners and admins can manage sharing on any object in the household (for moderation), beyond what an ordinary member can do on their own objects; resolved in §9 Q4: only the owner manages/removes other admins, admins manage non-owner members only.
- **Deletion cleanup**: whenever any entity that can be the target of an ObjectShare row is deleted, the platform's own shared data layer emits a generic, infrastructure-level deletion signal (keyed by the same `moduleKey`/`objectType`/`objectId` triple ObjectShare uses) and a platform-owned listener removes the matching ObjectShare rows. This is raised automatically by the persistence layer itself for every ObjectShare-eligible entity — it is not a domain event any module declares or lists under its own `Emits` in §4, so no module needs its own cleanup logic and no module-specific `*.deleted` event is required.

---

## 6. Email Notifications

- **Real transactional email delivery.** V1 integrates with an actual transactional email provider (e.g. Resend) and genuinely sends email — not a log line or a simulated send. This is a locked V1 decision.
- **Two independent, per-member controls**, both owned by the Household/Sharing domain and consumed by the notification pipeline:
  - **NotificationPreference** — per `categoryKey` (contributed by whichever module raises it, e.g. `task.assigned`, `bill.due_soon`, `reminder.due`, `share.received`, `household.invite_received`), each with independent `emailEnabled` / `inAppEnabled` / `digestEnabled` toggles, all defaulting to `true`. Turning a whole category off is a single boolean flip — matching the spec's "easy to turn any category on or off." `categoryKey` shares the same dot-namespaced key as the ModuleEventType that raises it (e.g. Reminders' `reminder.due` event is also the `reminder.due` notification category) — one namespace, not two separate registries.
  - **DigestSubscription** — a separate, one-per-member setting (`off | daily | weekly`, day + time in the household's timezone) for a rolled-up summary email, pulling in only the categories the member has left `digestEnabled = true`. Independent of the immediate, single-event emails above.
- **Trigger categories mirror the spec's "things that matter"**: a reminder firing (`reminder.due`), a task assigned to you (`task.assigned`), a bill coming due (`bill.due_soon`), something shared with you (`share.received`), a household invite (`household.invite_received`) — each module contributes its own categories to a platform **notification category registry** (surfaced via `ModuleSurfaceRegistration(surface = email_notification_category)`), so a new module's notifications automatically appear in each member's preference screen without platform code changes.
- **Delivery pipeline**: composes and sends both the immediate per-event emails and the scheduled digest emails; templates, the in-app notification inbox/bell feed, and the digest-composition job all live in this shared platform capability — no module (Tasks, Finance, Reminders, etc.) sends email directly. Modules only emit domain events (via the event bus, §7) with the right payload; the notification pipeline decides whether/how to deliver, based on the target member's preferences. For any category whose delivery isn't already backed by a Reminder (which surfaces in-app via ReminderOccurrence — see §4.5), the in-app inbox/bell feed is backed by the **Notification** entity (§3.1): the pipeline writes one Notification row per member whenever such a category's `inAppEnabled` preference is on, and the bell UI is simply a read/unread list over that member's Notification rows.
- **Background job dependency**: because email must be sent even when no member has the app open, a scheduled/background job capability (independent of the "refresh/refetch is fine" real-time decision) is required to detect due ReminderOccurrences, approaching Subscription due-dates, Budget thresholds, and Renewal expiry windows, and to trigger notification sending and digest composition on schedule. This is an infrastructure dependency of the notification pipeline, not a new entity.

---

## 7. Platform & Extensibility Architecture

Per the locked V1 decision, extensibility is **architecture-ready but not end-user installable**: V1 ships a real, modular, event-driven architecture (module registration, event announce/subscribe, per-module permission declarations, and household-level grant/revoke) actually used by all 8 built-in modules — but there is no end-user marketplace/installer UI to add or remove a module at runtime. A 9th module is added by a developer or agent writing new `Module` / `ModuleEventType` / `EventSubscription` / `ModulePermissionDeclaration` / `ModuleSurfaceRegistration` rows through code, following the same pattern the 8 built-ins already follow — no special-casing, no changes to existing modules' code.

**Core mechanisms** (entities detailed in §3.6):

- **Module** is the catalog of installed apps (8 built-ins + future custom ones), with a `dependsOnModules` soft-dependency graph and a derived `healthStatus` so a missing dependency is visible, not silent.
- **ModuleEventType** + **EventSubscription** let any module publish a versioned contract for its notable moments (`task.completed`, `bill.due_soon`, `reminder.due`, `renewal.expiring_soon`, etc.) and let any other module react to it by referencing the event type only — never the emitting module's internals. This is the mechanism behind "apps announce what happens inside them and react to what happens elsewhere."
- **EventOccurrence** is the runtime record that an event actually fired for a household, auditable for debugging "why didn't X happen" and for reliable notification delivery.
- **ModulePermissionDeclaration** is a module's own manifest — declared once in code — of what data/capability it needs and why, and whether it's required (module breaks without it) or optional (module degrades gracefully without it). This is the "ask only for what it genuinely needs, fail gracefully when something's missing" contract.
- **ModuleGrant** is the household-controlled counterpart: what a specific household has actually approved, reviewable and revocable at any time, fully audited (`grantedBy`/`At`, `revokedBy`/`At`). For the 8 built-in modules, all required-declaration grants are pre-seeded as `granted` at household creation, so every built-in app is immediately usable with no setup step; `pending_review` is reserved for a custom module becoming relevant to a household later. Revoking a required permission disables that module for that household only — it never affects another household's use of the same module, and never changes the module's platform-wide catalog status. **This is the one piece of the extensibility system that is end-user-facing in V1** — households can review and revoke what an installed module can access; only the install/uninstall marketplace flow is deferred.
- **ModuleSurfaceRegistration** is the single mechanism by which a module declares its presence on every shared surface — dashboard widget, global search, command palette, navigation, quick capture, email-notification-category settings — so "appears everywhere the built-ins do" is a data-driven fact, not per-app hardcoding in Dashboard/Search/Nav code.

**Platform principles this architecture enforces:**
- *New apps are first-class citizens*: installing a module means adding rows to the registries above — nothing about Dashboard, Search, Nav, or another module's code changes.
- *Build on what exists, don't duplicate it*: shared capabilities — Reminders, Notifications/Email, Sharing (ObjectShare/visibility), and Household/Member identity — are each owned once by a single domain and consumed by every other module through their public entities/events, never rebuilt per module (e.g. Finance creates Reminders through the shared Reminder entity; it does not invent its own alerting). (A platform Auth capability — login/session/credential mechanics, referenced by `Member.emailVerifiedAt` in §3.1 — is assumed to exist alongside these but is intentionally out of scope for this product plan.)
- *Cooperate without knowing about each other*: the announce/subscribe pattern above is the concrete mechanism; a future module (and a future automations "when this, then that" engine, deferred to V2 — see AutomationRule) can build on any existing module's events without that module ever being modified to accommodate it.
- *Existing apps are good platform citizens*: each built-in module's manifest (`ModuleEventType` + `ModulePermissionDeclaration` + `ModuleSurfaceRegistration`) is a promise other modules and the household depend on; `ModuleEventType.contractVersion` is bumped only on breaking changes, so existing subscribers keep working until they choose to migrate. Every module must also degrade sensibly if something it hoped to build on isn't installed (e.g. Life Admin's Renewal still saves and computes its status locally even if Reminders is somehow unavailable). The same contract holds in reverse: if a built-in module is itself disabled via code (`Module.status = disabled`), its own stored rows are left untouched (not deleted), and other modules' optional references to it — e.g. `Task.boardId`/`columnId` if Kanban were disabled — simply stop resolving/rendering under the same graceful-degradation rule rather than erroring; re-enabling the module restores full function with no data loss.
- *The household stays in control*: `ModuleGrant` ensures a module only reaches the data/abilities a specific household has agreed to give it, reviewable and revocable without ever quietly widening access — and extensibility never bypasses the same visibility/sharing rules every other object obeys.

---

## 8. Priorities — Must-Have V1 vs Out of Scope (V2+)

### Must-have V1

**Household, identity & sharing**
- Multi-tenant household registration (any household signs up independently; full data isolation).
- Household, Member (3 fixed roles: owner/admin/member; last-owner protection), Invite (named-email only, 7-day expiry, single-use token, resend regenerates token).
- ObjectShare generic sharing join table; `visibility` (private/household/specific_members) contract on every shareable entity across every module.
- NotificationPreference (per-category email/in-app/digest toggles), DigestSubscription (off/daily/weekly), and Notification (the per-member delivered-instance row backing the in-app inbox/bell feed).

**Tasks, Kanban & Calendar**
- Tasks: due dates, priority, single assignee, one level of sub-tasks, tags, lazily-generated recurrence, completion via `completedAt`, provenance fields for other-module-created tasks.
- Kanban: multiple boards per household, custom columns with semantic `columnType`, drag-and-drop, column-type-driven auto-completion sync, soft-archive only.
- Calendar: month/week/day views; Event entity for one-off events (no recurrence in V1); tasks-with-due-dates surfaced automatically via query-time union, never duplicated into Event rows.

**Reminders & Notes**
- Reminder + ReminderOccurrence: one-off and recurring, single target member, lazy occurrence generation, in-app + email delivery, snooze/dismiss/complete.
- Reminders creatable by any other module through the shared Reminder capability (bills, renewals, tasks).
- Notes: standard + journal types, one journal entry per member per day, tags shared with Tasks, pin/archive.
- NoteLink to Task, Subscription, or Event via a generic extensible join.

**Finance**
- Category, Transaction (expense/income, `posted`/`void`), TransactionSplit, Settlement (ledger-only, never edited retroactively), Budget (threshold alerts via Reminder), Subscription (recurring bills), MonthlySummary and MemberBalance as computed views.
- Single household base currency; no multi-currency conversion.
- Reuse of Document (receipts), Note, and Task from other modules rather than Finance-specific equivalents.

**Life Admin**
- Document (reusable file/attachment capability with polymorphic linking).
- Renewal (warranties, insurance, registrations, memberships, leases, domain/hosting — one entity, typed) with automatic reminder generation from `reminderOffsetsDays`.
- Contact (typed, pinnable).
- ShoppingList + ShoppingListItem (typed lists, check-off with attribution).

**Dashboard & cross-cutting surfaces**
- "Today" aggregation (tasks due, today's events, upcoming bills, active reminders) via a common cross-module projection.
- Quick capture for task/note/reminder from anywhere.
- Cross-entity search and command palette, both backed by `ModuleSurfaceRegistration`.

**Platform & extensibility (architecture-ready, per locked decision)**
- Module, ModuleEventType, EventSubscription, EventOccurrence, ModulePermissionDeclaration, ModuleGrant, ModuleSurfaceRegistration — real rows, actually used by all 8 built-in modules.
- Household-facing review/revoke of `ModuleGrant` (this is end-user-facing in V1) — built-in modules' required-permission grants are pre-seeded as `granted` at household creation so all 8 apps work immediately.
- **No end-user install/uninstall/marketplace UI** — a 9th module is added by a developer/agent through code in V1; this is explicitly out of scope for the UI layer this release.

**Email & sync (per locked decisions)**
- Real transactional email sending via an actual provider (e.g. Resend) — not logged/simulated.
- A background/scheduled job capability for reminder firing, digest composition, and threshold/expiry checks (infrastructure, not a stored entity).
- **Refresh/refetch or polling-based sync** — changes by other members appear on next page load/navigation; **no real-time websocket push** in V1.

### Out of scope (V2+)

- **CustomRole** — configurable, household-defined roles/permissions beyond the fixed owner/admin/member enum.
- **UserAccount** — a global identity allowing one login to hold separate Member profiles (and roles) across multiple households.
- **EventRecurrenceRule** — recurring calendar events.
- **TaskAssignment** — multiple assignees per task.
- **EventAttendee** — explicit per-event attendee lists beyond coarse visibility.
- **ReminderRecipient** — reminders targeting more than one member independently.
- **DocumentVersion** — re-upload history for Documents (V1 overwrites in place).
- **RenewalHistory** — a per-cycle renewal log beyond `lastRenewedAt`.
- **ShoppingListTemplate** — reusable/scheduled list-seeding templates.
- **PaymentAccount** and **ExchangeRate** — multi-account tracking and multi-currency conversion.
- Itemized/line-level transaction splitting (splitting individual receipt items, taxes, tips) — V1 splitting is flat, whole-transaction only.
- Bank-import transactions (`Transaction.source = imported`) — reserved enum value, not implemented.
- Budget rollover of unused amounts into the next period (`rolloverUnused` reserved, always `false` in V1).
- **AutomationRule** and any user-facing "when this, then that" rule-builder UI — V1 ships only the underlying event bus (ModuleEventType/EventSubscription/EventOccurrence) this would consume later.
- **End-user module marketplace/installer UI** — installing/uninstalling a module at runtime is explicitly deferred; V1 modules are added by a developer/agent through code.
- **Real-time websocket push / live sync** — deferred in favor of refresh/refetch and polling.
- Public/self-serve household join links — V1 invites are always named-email, token-based only.
- Any admin override of `private` visibility — resolved in §9 Q3: private truly means private, with no built-in override.

---

## 9. Decisions (Resolved with Client)

All open questions below were reviewed with the client and resolved. Every decision confirmed the default already assumed in this plan's data model (§3) — no schema changes resulted from this pass.

**A — Identity, household & roles**
1. Can one person belong to more than one household under a single login (multi-household identity), or is one-account-per-household acceptable for V1? This determines whether `Member.email` stays unique-per-household (as designed) or needs a separate global-identity layer (the sketched `UserAccount`). **→ Decision: one account per household.** No multi-household identity in V1; `UserAccount` stays out of scope (V2).
2. When a member is removed, what happens to the objects they owned/authored across every module (tasks, notes, bills, documents) — reassigned to someone else, left in place but attributed to a "former member," or hard-deleted? **→ Decision: left in place, attributed to the former member.** Confirms the soft-delete design in §2.4/§3.1 — no reassignment flow needed.
3. Is `private` visibility truly hidden from everyone but the owner, or should household owners/admins retain a moderation override? **→ Decision: always private, no override.** Owners/admins never see another member's private objects.
4. Exactly who is allowed to grant/revoke a share on someone else's object, and who can invite/remove/promote which roles — owner-only, or can admins also manage other admins? **→ Decision: as designed in §2.2.** Admins invite/remove/manage sharing for non-owner members only; only the owner can remove or demote another admin.
5. Is there a cap on household size (number of members) for V1, or is it unbounded? **→ Decision: unbounded.** No member-count limit or related validation/UI needed.
6. Is a single household-wide timezone/digest-send-time sufficient, or do individual members need their own override (relevant if members travel or live apart part-time)? **→ Decision: single household-wide timezone.** No per-member timezone override in V1 (also settles Q33 below).
7. Should `specific_members` sharing also support sharing with an entire role (e.g. "all admins"), or is an explicit member list sufficient? **→ Decision: explicit individual members only.** No role-based sharing target in V1.

**B — Tasks, Kanban & Calendar**
8. Should Calendar Events support recurrence in V1 (e.g. a weekly appointment), or is that a V2 upgrade (the spec is silent on event recurrence, unlike Tasks and Reminders)? **→ Decision: no event recurrence in V1.** `EventRecurrenceRule` stays V2.
9. Is a single assignee per task sufficient, or does "who's responsible" need to support more than one member per task? **→ Decision: single assignee.** `Task.assigneeId` stays single-value; `TaskAssignment` stays V2.
10. When a task is completed from the plain Tasks list (not by dragging its Kanban card), should its card auto-move to a done-typed column — and what should happen if that board has zero or more than one done-typed column? **→ Decision: yes, auto-move.** Completing from the list moves the card to a `done`-typed column; if a board has multiple `done`-typed columns, it moves to the first one.
11. For recurring tasks, is it acceptable that V1 only ever shows/generates the current open occurrence, or does the household need future occurrences projected on the calendar ahead of time? **→ Decision: current occurrence only.** No projected future occurrences in V1.
12. Should boards remain soft-archive-only (as designed, preserving tasks/columns indefinitely), or is a hard-delete-with-confirmation also required, and if so what happens to the tasks that were on that board? **→ Decision: soft-archive only.** No hard-delete for boards in V1.

**C — Reminders & Notes**
13. Can a Reminder target more than one member in V1, or is a single `targetMemberId` correct (the spec's wording is ambiguous — "aimed at specific members" vs "a specific member")? **→ Decision: single target member.** Same decision as Q9; `ReminderRecipient` stays V2.
14. What is the acceptable "missed" grace window for an unacknowledged ReminderOccurrence? **→ Decision: 24 hours.**
15. Should a reminder ever notify at creation/assignment time ("this was set for you"), or is firing-time-only the intended V1 behavior? **→ Decision: firing-time only.** No creation-time notification.
16. Should `Note.body` support rich text/markdown, or is plain text sufficient for V1? **→ Decision: markdown.**
17. Is exactly one journal entry per member per calendar day the right rule, or should members be able to create multiple dated entries within the same day? **→ Decision: one entry per member per day**, as designed.
18. What should the default visibility be for a newly created standard Note — private or household? **→ Decision: household**, as designed (journal notes stay private by default).
19. When a reminder's source object (bill/task/renewal) is deleted, should the Reminder auto-cancel, or convert into a standalone manual reminder that keeps its last known title/date? **→ Decision: converts to a standalone manual reminder.** Nothing is lost.

**D — Finance**
20. Should a household support more than one active currency, or is V1 strictly single-currency with `Transaction.currency` purely cosmetic? **→ Decision: single currency per household.** `Household.baseCurrency`, no conversion; `ExchangeRate` stays V2.
21. Is recurring income (e.g. salary deposits) modeled through the same Subscription entity generalized to income categories, or is Subscription strictly for outgoing bills in V1? **→ Decision: Subscription is expense/bills only.** Recurring income is entered manually as a Transaction each time in V1.
22. Who is allowed to edit or void a Transaction/Budget/Subscription that isn't theirs, and who can cancel a recorded Settlement — does Finance fully defer to the platform's general sharing/role rules, or does money need a stricter rule? **→ Decision: same rules as everywhere else.** No special stricter permission model for Finance.
23. If a Transaction with already-settled splits is edited (amount changed) or voided after a Settlement has been recorded against it, how should the now-stale balance be handled — auto-recalculate, block the edit, or require a manual correcting Settlement? **→ Decision: block the edit/void.** A Settlement affecting a transaction's splits must be undone first.
24. Should exceeding a Budget's alert threshold always create a Reminder/email, or is it itself subject to the affected member's per-category opt-out like other notifications? **→ Decision: subject to normal opt-out**, like every other category.
25. For a whole-household Budget (`member = null`), who receives the resulting Reminder — every member, or only whichever member's spending pushed it over the threshold? **→ Decision: every household member.**

**E — Life Admin**
26. What is the default reminder lead time for a new Renewal, and is it a configurable household-level default that new Renewals inherit, or must every Renewal set its own `reminderOffsetsDays`? **→ Decision: configurable household-level default**, inherited by new Renewals, overridable per record.
27. What file types and max file size are accepted for Document uploads, and is that limit fixed platform-wide or configurable per household? **→ Decision: fixed platform-wide limit** (e.g. PDF/images, 10MB — exact allow-list/limit to be finalized during implementation).
28. Should an `expired` Renewal keep appearing on dashboards/reminders indefinitely, or auto-archive/mute after a grace period? **→ Decision: auto-archive after a grace period** (e.g. 30 days) — still reachable via history/filter.
29. When a recurring Renewal is marked renewed, should `expiryDate` auto-advance by the fixed interval unconditionally, or should the member always be prompted to confirm/enter the new date (since real-world terms can change)? **→ Decision: always prompt for confirmation.** No unconditional auto-advance.
30. Within a shared ShoppingList or Contact, can every member with access also edit/check off items, or is a narrower "view only" shared permission needed? **→ Decision: anyone with access can edit/check off.** No separate view-only tier in V1.
31. Should checking off a ShoppingListItem, or marking a Renewal's payment complete, optionally create a Finance Transaction automatically, or is that intentionally a separate manual step in V1? **→ Decision: always a manual step.** No auto-created Transactions from Life Admin actions.

**F — Dashboard & cross-cutting**
32. What is the default (and is it member-configurable) lookahead window for "upcoming bills" and "due soon" reminders on the dashboard — e.g. 24 hours, 3 days, 7 days? **→ Decision: fixed 7 days**, not member-configurable in V1.
33. Should the Today view and quick capture use a single household-wide timezone, or each member's own timezone? **→ Decision: household-wide timezone**, consistent with Q6.
34. Built-in modules' `ModuleGrant` rows now start pre-approved (`granted`) at household signup (§3.6, §7) so all 8 apps work immediately with no setup friction. Should a future **custom** (non-built-in) module get the same auto-grant convenience, or must a household always explicitly review/approve a custom module's permission declarations before its first use? **→ Decision: custom modules always require explicit household review.** Only the 8 built-ins are auto-granted at signup.
35. Is a user-facing automation ("when this, then that") rule-builder genuinely wanted for a later release, or was that language purely illustrating why the event architecture matters — worth keeping `AutomationRule` on a concrete V2 roadmap versus dropping it? **→ Decision: kept as a genuine V2 roadmap item**, not just illustrative language — the V1 event bus is built with this in mind.