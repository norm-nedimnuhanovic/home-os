# Home OS — Build Roadmap

**Status of this document:** all 8 built-in modules (§1–§7) are built
end-to-end — entities, actions, queries, UI, tests, verified in-browser at
desktop and mobile — as of the "Dashboard module vertical slice" PR,
2026-07-26. Email & Scheduled Jobs (§8) — the cross-cutting layer every
module's alert-worthy moment ultimately flows through — is now also built
end-to-end (Resend integration, all 5 cron sweep jobs, `DigestSubscription`,
the Settings → Members/Notifications UI), as of the "Email & Scheduled
Jobs" PR, 2026-07-26. App-wide success/error toast feedback (§7) — every
create/update/delete across all 8 modules, not just Quick Capture — landed
as of the "App-wide toast notifications" PR, 2026-07-26. This file is the single source of truth for "what's
built vs. what's missing," organized by the modules and priorities locked
in [`plan.md`](./plan.md). It is meant to be edited constantly, in the same
PR as the work it describes — not maintained separately after the fact.
Real gaps remain (see each module's own unchecked `[ ]`/`[~]` lines and the
"Known harness gaps" section near the bottom) — "built end-to-end" means a
working vertical slice, not that every plan.md behavior is implemented.

## How to keep this file honest

1. **Start work → mark in progress.** Change `- [ ]` to `- [~]` and add a
   short pointer, e.g. `- [~] Task — householdId, title, ... (PR #14)`.
2. **Merge → check it off.** Change to `- [x]` and keep the PR/date pointer,
   e.g. `- [x] Household — name, timezone, baseCurrency, status (PR #14, 2026-08-01)`.
3. **Never silently delete a V1 item.** If an item turns out to be covered by
   something else, check it off and say how:
   `- [x] NoteTag — implemented as the same generic Tag/EntityTag join used by TaskTag (PR #22)`.
4. **Scope changes flow through `plan.md` first.** If an item is promoted
   out of V2 or demoted into it, edit `plan.md`'s "Priorities" section in the
   same PR that edits this file's checklists — this file mirrors `plan.md`,
   it never contradicts it.
5. **One module, one section.** Don't add a "misc" bucket — every new
   entity/feature belongs to one of the module sections below, or to
   Platform & Extensibility if it's cross-cutting infrastructure.

Legend: `[ ]` not started · `[~]` in progress · `[x]` done.

---

## Phase 0 — Harness & Foundational Scaffolding

Not a product module — this is the one-time setup every module below
depends on. Must be checked off before any module work starts.

- [x] Scaffold the app: `pnpm create next-app@15 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"` (pinned to Next.js 15, not `@latest`/16 — see decision note below)
- [x] Initialize shadcn/ui: `pnpm dlx shadcn@latest init --base radix` — committed `components.json` (style `radix-nova`) and `src/components/ui/` (23 components incl. a hand-written `form.tsx`, since the registry no longer ships one)
- [x] Install Prisma: pinned to `prisma@6.19.3` / `@prisma/client@6.19.3` (not the newer Prisma 7 line — see decision note below)
- [x] `pnpm exec prisma init --datasource-provider postgresql` — `prisma/schema.prisma` created, generator switched to classic `prisma-client-js`
- [x] `prisma/schema.prisma` — **the full data model landed in one pass**, not just `Household`/`Member`: all ~40 models across §3.1–§3.6 of `plan.md`, validated (`prisma validate`) and generated (`prisma generate`) clean. Deviates from this checklist's original incremental framing intentionally — the full field/relation set was already locked in `plan.md`, so building it entity-by-entity would have meant repeatedly re-touching the same file.
- [x] `src/lib/db.ts` + `src/lib/db/tenant-guard.ts` — the shared Prisma singleton, per `docs/orm-conventions.md` §3.2/§6 (`@/lib/db`)
- [x] Vitest (`vitest.config.ts`, `vitest.setup.ts`) and Playwright (`playwright.config.ts`) wired per `docs/testing.md`; `package.json` scripts (`lint`/`typecheck`/`test`/`test:e2e`/`db:*`/`scaffold:module`) match `docs/toolkit.md` §2 verbatim
- [x] The five cron routes' scheduled trigger (`docs/email.md` §9.6) — originally `vercel.json`'s `crons` array; replaced by `.github/workflows/cron.yml` once real deployment hit Vercel Hobby's once-per-day cron limit (see the Deployment section below)
- [x] Local dev database: Docker Postgres 16 container (`home-os-postgres`, `docker run -d --name home-os-postgres -e POSTGRES_USER=homeos -e POSTGRES_PASSWORD=homeos_dev_password -e POSTGRES_DB=homeos -p 5432:5432 postgres:16-alpine`), `.env`'s `DATABASE_URL`/`DIRECT_URL` point at it — **stays pointed at local dev permanently**, never swapped (see below: the real project's credentials live only in Vercel's env vars, not in the local `.env`, so local dev and production never share a database).
- [x] Run the first migration: `pnpm db:migrate` → `prisma/migrations/20260724111926_init/` — applied clean against the local container, all ~40 models created with no errors
- [x] Provision the real Supabase project — org "Home OS" + project `home-os` (ref `msvacvkxaxgxghjpnssk`, `eu-central-1`), created via `supabase projects create` (Management API, since `supabase login`'s device flow doesn't work non-interactively — used `SUPABASE_ACCESS_TOKEN` instead). All 5 migrations applied (`prisma migrate deploy`) and the platform catalog seeded (9 `Module`/28 `ModuleEventType`/25 `ModuleSurfaceRegistration` rows, 0 households — deliberately not the dev-only "Rivera Household" sample data). Real `DATABASE_URL` (pooled, `aws-0-eu-central-1.pooler.supabase.com:6543`)/`DIRECT_URL`/`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` set as Vercel Production+Preview env vars (`vercel env add`) — not written to the local `.env` (see above).
- [x] Wire Supabase Auth as the platform Auth capability — nothing left to build (`requireMember()`/`login()`/`acceptInvite()` etc. were already fully built and browser-tested against the local stack); this line was really tracking "against a real project," which now exists per the line above.
- [x] Configure a Supabase Storage bucket for `Document.fileRef` (Life Admin) and `Transaction.attachment` (Finance) — `pnpm run storage:setup` run against the real project (`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` passed inline, not written to local `.env`), confirmed via the Management API: `documents` bucket exists, private, 10 MB limit, the same `pdf`/`jpeg`/`png`/`webp`/`heic` MIME allowlist as local dev.
- [x] Create the Resend account, wire `RESEND_API_KEY`/`EMAIL_FROM` as Vercel Production+Preview env vars, buy and verify a real sending domain (`nedimnuhanovic.com`, registered via Cloudflare Registrar, DNS auto-configured through Resend's Cloudflare Domain Connect integration — DKIM/SPF/MX all `Verified` within minutes). `EMAIL_FROM` is `Home OS <notifications@nedimnuhanovic.com>`. Verified twice directly against the Resend API: a real send to the account owner's own address (delivery confirmed) and, after domain verification, a real send to an unrelated address (`someone@gmail.com`, real `id` returned — confirming it's no longer restricted to the account owner only, unlike the earlier `onboarding@resend.dev` test-sender stage, which rejected any other recipient with a `422 validation_error`). One unrelated wrinkle hit along the way, not a real limitation: Resend also rejects any `to` on the reserved `example.com` domain outright, regardless of sender verification — a documentation-domain guard, not evidence of anything wrong with this setup.
- [x] Link the Vercel project (`vercel link`) — `nedimnuhanovic-imelbas-projects/home-os` (`vercel.com/nedimnuhanovic-imelbas-projects/home-os`). GitHub auto-connect failed at link time (`400`: the Vercel account needed a GitHub Login Connection added first) — resolved once that connection was added (Vercel Account Settings → Login Connections → GitHub, then Project Settings → Git → install the Vercel GitHub App, scoped to just this repo → Connect). The repo is now wired for auto-deploy-on-push; the very first deploy was triggered manually via `vercel --prod` before that connection existed.
- [x] **Real, user-reported perf bug, found and fixed post-launch**: navigation between pages (dashboard → tasks, etc.) felt noticeably sluggish. Root cause confirmed via the `x-vercel-id` response header (`fra1::iad1::...`): every dynamic route (nearly all of them, per the build output's `ƒ` markers) is a Vercel serverless function that was executing in `iad1` (US East, Vercel's untouched default), while the Supabase database lives in `eu-central-1` (Frankfurt) — every single Prisma query paid a full transatlantic round trip, on every page render. Fixed with a one-line `vercel.json` addition, `"regions": ["fra1"]` (free on Hobby — only *concurrent multi-region* is a Pro feature, picking a single region isn't). Confirmed via the same header post-redeploy (`fra1::fra1::...`) and via direct timing (`curl -w "%{time_total}"`): dashboard page load dropped to ~0.3–0.4s, user-confirmed "puno je brže" ("much faster") after redeploy. Worth remembering for any *future* re-provisioning: always pick the Vercel function region to match wherever the database actually ends up, never assume the platform default is co-located with it.
- [x] **Real bug found in the same post-launch pass**: Supabase's own Auth email templates (signup confirmation, password reset, etc.) use the project's `site_url` config — a *Supabase-side* setting, entirely separate from this app's own `NEXT_PUBLIC_SITE_URL` env var — to build their redirect links. A freshly-provisioned project defaults `site_url` to `http://localhost:3000` with an empty `uri_allow_list`, so the very first real signup's confirmation email linked to `localhost:3000` instead of the deployed URL — caught only because the user happened to also have `pnpm dev` running locally against the same real project, which is *why* the link happened to still work for them; it would not have for anyone else. Fixed via the Management API (`PATCH /v1/projects/{ref}/config/auth`): `site_url` set to the real deployed URL, `uri_allow_list` set to `<deployed-url>/**,http://localhost:3000/**` (both patterns, so local dev keeps working too). No code change — purely a project-level Supabase setting that has no in-app UI and isn't captured anywhere in this repo, so it's easy to forget when re-provisioning a project from scratch; documented here specifically so it isn't missed next time.
- [x] **Critical, previously-undiscovered visual bug, present since Phase 0's original scaffolding, only found now via a real screenshot of the deployed app**: every page rendered in the browser's own default font (Times New Roman) instead of Geist — the entire app has looked unstyled its whole life, despite `pnpm build`/lint/tests/every prior Playwright pass all being clean, because none of them ever asserted on computed `font-family`. Two independent, compounding root causes, both in files from the original `create-next-app`/shadcn scaffold:
  1. `src/app/globals.css`'s `@theme inline` block had `--font-sans: var(--font-sans)` — a **self-reference**, invalid at computed-value time per the CSS spec. Fixed to `--font-sans: var(--font-geist-sans)`.
  2. Even after that fix, the font still didn't apply: Tailwind v4's `@theme inline` *inlines* the resolved value at build time, emitting `html{font-family:var(--font-geist-sans)}` directly — but `src/app/layout.tsx` only applied `geistSans.variable`/`geistMono.variable` (the classes that actually define the `--font-geist-sans` custom property) to `<body>`, not `<html>`. CSS custom properties cascade parent→child only, so `<html>`'s own rule couldn't see a variable scoped to its *descendant*, and `<body>` — having no explicit `font-family` of its own — simply inherited `<html>`'s already-broken computed value rather than re-resolving anything. Fixed by moving the variable classes onto `<html>` itself.
  Diagnosed by directly inspecting `getComputedStyle()` in a real headless-Chromium session (not just reading source CSS) after ruling out browser extensions/incognito/CSS-load failures first — confirmed fixed the same way, `getComputedStyle(html).fontFamily` now reads `"Geist, \"Geist Fallback\""` instead of `"Times New Roman"`, user-confirmed visually after redeploy. Worth remembering for any future `next/font` + Tailwind v4 `@theme inline` setup: the font-variable class and whatever selector consumes `--font-<name>` must live at the *same or a more specific* DOM scope, never the reverse.
- [x] Wire CI (lint + `tsc --noEmit` + test + build) to run on every PR — `.github/workflows/ci.yml`, `pnpm/action-setup`+`actions/setup-node` (pnpm 10, Node 22, matching what Vercel's own build log resolved to), `pnpm install --frozen-lockfile`, then the four checks in the same order as `CLAUDE.md`'s "Before You're Done." The `build` step needs placeholder env vars (a syntactically-valid but unreachable `DATABASE_URL`/`DIRECT_URL`, dummy Supabase/cron values, empty `RESEND_API_KEY`) — `next build`'s page-data collection evaluates every route's module scope, including `src/lib/db.ts`'s module-level `new PrismaClient()`, which throws if `DATABASE_URL` is entirely unset; none of these need to be reachable since no dynamic route actually executes during a build.
- [x] **Real deployment finding**: `vercel.json`'s `crons` array was rejected outright at deploy time — Vercel's Hobby plan only allows once-per-day cron schedules, and `reminders-sweep` (every 15 min)/`digests-send` (hourly) both need finer granularity. Fixed by removing `vercel.json`'s `crons` key entirely and adding `.github/workflows/cron.yml`, a free GitHub Actions scheduled workflow that calls the same `CRON_SECRET`-gated routes on an equivalent schedule (`github.event.schedule` selects which route(s) to hit). Requires two GitHub repo settings the CLI here couldn't set (no `gh` CLI in this environment): a `CRON_SECRET` **secret** (same value as Vercel's) and a `SITE_URL` **variable**, both under Settings → Secrets and variables → Actions. See `docs/email.md` §9.6.

**Decision notes (see chat/PR history for the reasoning):**
- Pinned to **Next.js 15** and **Prisma 6** rather than the newest majors (Next 16, Prisma 7) available at scaffold time — both are new enough that this harness's own conventions (and the assistant's training data) are on much firmer ground with the prior major. Revisit the pin once the newer majors have more real-world mileage.
- shadcn/ui's default preset now backs components with **Base UI** (`@base-ui/react`) instead of Radix — this repo explicitly re-inits with `--base radix` to keep the Radix-based primitives every other harness doc (`docs/ui-components.md`, `docs/forms.md`, etc.) assumes. `docs/ui-components.md` was corrected to say Base UI where it had drifted, then confirmed the Radix decision.
- shadcn's registry no longer ships a `form` component at all (Base UI **or** Radix backend) — `src/components/ui/form.tsx` in this repo is hand-written, following the classic shadcn/react-hook-form pattern, using `radix-ui`'s unified `Slot`/`Label` exports.
- `@radix-ui/react-slot@1.3.x` (pulled in by `radix-ui@1.6.5`) introduced a context-based `mergeProps` implementation that calls `React.createContext` at module scope without a `"use client"` directive — Next.js's RSC build executes that module under the `react-server` condition while collecting page data, crashing every page that renders a `Slot`-based component (`Button`/`Badge`/`FormControl`/anything using shadcn's `asChild`) with `TypeError: ... createContext is not a function`. Pinned down via `pnpm-workspace.yaml`'s `overrides` to `1.2.5` — the last version before the context-based rewrite, same public API, no `createContext` call so no directive is needed.
- **Tenant guard vs. auth bootstrap:** the guard extension in `src/lib/db.ts` throws on any tenant-scoped query missing `householdId` — including `Member.findUnique({ where: { supabaseUserId } })`, the exact query `requireMember()` uses to resolve `householdId` in the first place. Caught via an actual login attempt in a real browser (`Error: Refusing Member.updateMany: missing householdId`), not by typecheck/lint/tests. Fixed with one narrow, explicit escape hatch — `prismaAuthBootstrap` (the unguarded `PrismaClient`, exported alongside the guarded `prisma`) — used only in `requireMember()`, `login()`'s `lastLoginAt` touch, and the confirmation callback's `emailVerifiedAt` touch. Safe because `Member.supabaseUserId` is globally `@unique`. See `docs/orm-conventions.md` §3.2 and `docs/auth.md` §6.
- **`react-markdown` added as a real dependency** (Notes module, 2026-07-25) — plan.md §3.3's "Note.body supports markdown" was previously just a schema comment with no rendering; `src/modules/notes/components/markdown-body.tsx` is the one place it's rendered. Not used anywhere else; don't reach for a heavier editor/renderer stack unless a second entity actually needs rich text.

---

## 1. Household & Sharing

Roles, tenancy, invites, generic sharing, and the notification preference
plumbing every other module reads. This module ships first — nothing else
can be multi-tenant without it.

### Entities (`prisma/schema.prisma`)
- [x] `Household` — name, timezone, baseCurrency, status (`active`/`suspended`/`closed`)
- [x] `Member` — householdId, displayName, email (unique **per household**, not globally), role (`owner`/`admin`/`member`), status (`active`/`suspended`/`removed`), avatarUrl, colorTag, emailVerifiedAt, joinedAt, lastLoginAt, **+ `supabaseUserId`** (docs/auth.md §1 addition beyond plan.md's digest)
- [x] `Invite` — householdId, email, role (`admin`|`member` only), invitedByMemberId, token, status (`pending`/`accepted`/`expired`/`revoked`), expiresAt (default 7 days), acceptedAt, acceptedByMemberId
- [x] `ObjectShare` — householdId, moduleKey, objectType, objectId, sharedWithMemberId, sharedByMemberId (generic join, used only when `visibility = specific_members`)
- [x] `NotificationPreference` — memberId, categoryKey (shares the dot-namespace with `ModuleEventType.key`), emailEnabled, inAppEnabled, digestEnabled (all default `true`)
- [x] `DigestSubscription` — memberId (1:1), frequency (`off`/`daily`/`weekly`), dayOfWeek, timeOfDay, lastSentAt, nextRunAt
- [x] `Notification` — householdId, memberId, categoryKey, sourceModule, sourceEntityType, sourceEntityId, eventOccurrenceId, title, body, readAt

### Shared contract every module builds on
- [x] `Visibility` enum (`private | household | specific_members`) implemented once (`src/lib/access/visibility.ts`'s `visibilityWhere()`) and imported everywhere — never redefined per module
- [x] Query helper — `visibilityWhere()` (docs/access-control.md's naming; not `withVisibility()`) — applies: `private` → owner only, no admin/owner override ever; `household` → dynamic membership check at read time; `specific_members` → join against `ObjectShare`
- [ ] Generic infra-level deletion-cleanup: when any shareable row is deleted, its `ObjectShare` rows are deleted too (implemented once, not per-module)

### Features / behaviors
- [x] Household self-registration flow: new signup creates `Household` + first `Member` with role `owner` (`src/app/(auth)/actions.ts`'s `signUpAndCreateHousehold`), plus pre-grants all built-in modules' required `ModuleGrant`s in the same transaction
- [x] Role permission matrix enforced server-side (`src/lib/access/household-permissions.ts`, not just hidden UI):
  - [x] Owner: everything admin can, plus remove anyone including admins, close household, transfer ownership — `closeHousehold()` (`src/app/(app)/settings/members/actions.ts`) resolves what was a self-contradiction in an earlier plan.md draft (§2.1/§2.2 disagreed on whether closing is platform-only or owner self-service; plan.md now says explicitly: suspension is operator-only with no in-app UI in V1, closure is the owner's own action). A soft `Household.status = "closed"` flip only (no Member row touched, matching `removeMember()`'s "never touch historical data" precedent) plus revoking every still-pending `Invite`. What actually enforces it: `requireMember()` (`src/lib/auth/session.ts`) now also rejects a session whenever `member.household.status !== "active"`, alongside its pre-existing `member.status` check — every member of a closed household is locked out on their very next request. Browser-verified: owner closes → immediately signed out; both owner and admin's subsequent login attempts succeed at the Supabase layer but bounce straight back to `/login` once `requireMember()` runs.
  - [x] Admin: invite/remove non-owner members, moderate sharing; **cannot** remove other admins (owner-only)
  - [x] Member: manage own data + assigned items only
- [x] Invariant: a household always has ≥1 owner — `assertNotLastOwner()`, checked before removal/role-change/ownership-transfer
- [x] Removed members (`status = removed`): owned objects stay attributed to them, never reassigned or deleted; Supabase user banned too (`src/app/(app)/settings/members/actions.ts`'s `removeMember`)
- **Critical, previously-undiscovered bug found while building resend-invite/close-household above (in the same file, not something anyone was looking for): `removeMember()`, `changeMemberRole()`, and `transferOwnership()` had all been silently broken since they were written.** Every one of their `prisma.member.update()` calls omitted `householdId` from `where` — `Member` is tenant-scoped (`src/lib/db/tenant-guard.ts`), so every real invocation threw `Refusing Member.update: missing householdId`. Confirmed empirically against the real database before fixing. Never caught before because this file's own unit tests mocked `@/lib/db` entirely and no browser test had ever specifically exercised remove/role-change/ownership-transfer (only the invite flow had been verified) — the same bug class, and the same detection gap, as the all-5-cron-jobs and `dispatchToSubscribers()` bugs found earlier. Fixed by adding `householdId: actingMember.householdId` to all four affected `where` clauses (two inside `transferOwnership()`'s transaction); `actions.test.ts` now has real (previously nonexistent) test coverage for all three functions, asserting the correct scoped `where` shape. **Second bug found in the same browser pass**: none of `inviteMember()`/`removeMember()`/`changeMemberRole()`/`transferOwnership()` called `revalidatePath()` — each mutation succeeded but the already-open `/settings/members` page kept showing stale data (an old role badge, a "removed" member still listed) until a manual reload. Fixed by adding `revalidatePath("/settings/members")` to all four.
- [x] Invite by named email only — no public join links; token is single-use and regenerated on resend; 7-day expiry. `resendInvite()` (`src/app/(app)/settings/members/actions.ts`) implements plan.md §2.3.4 verbatim: the new token is only ever persisted once the new invite email has actually gone out (send-then-persist, not persist-then-send — a failed send leaves the old token/expiresAt untouched rather than stranding the invitee with neither a working old link nor a delivered new one, same all-or-nothing rule `inviteMember()` already used). Only a `pending` invite can be resent — `accepted`/`revoked` are terminal, resending one would silently resurrect a decision someone already made. `member-list.tsx`'s pending-invite rows now show "Expired" (red) instead of "Expires" once `expiresAt` has passed, so an admin/owner knows *why* to resend, and a per-row "Resend" button (`invite-row-actions.tsx`, admin/owner only). Browser-verified: token/expiresAt actually change and persist, including on an already-expired invite.
- [x] Unbounded household size (no member-count cap anywhere in queries/UI)
- [x] `/settings/members` **UI page** (`src/app/(app)/settings/members/page.tsx`, `member-list.tsx`, `member-row-actions.tsx`, `invite-member-dialog.tsx`, `invite-row-actions.tsx`, `close-household-section.tsx`) — member list with role badges, role-change/remove/transfer-ownership row actions, pending-invites list with per-row Resend, and an invite dialog wired to `inviteMember()`. A red "Danger zone" box at the bottom, owner-only, houses `closeHousehold()` behind a confirm dialog. Built alongside the Email & Scheduled Jobs phase (§8) specifically because `inviteMember()`'s newly-fixed email send had no UI path to trigger it from at all
- [x] Per-category notification preferences screen (`src/app/(app)/settings/notifications/page.tsx`, `notification-preferences-form.tsx`, `digest-settings-form.tsx`) — email/in-app/digest toggles per registered `email_notification_category`, plus `DigestSubscription` frequency/dayOfWeek/timeOfDay
- [x] In-app bell/inbox reads `Notification` for every category **not** already backed by `Reminder`/`ReminderOccurrence` (`src/lib/notifications/dispatch.ts`'s `fanOutNotificationsForOccurrence` — wires `task.assigned`/`share.received`/`household.invite_received`; the email half now actually sends, wrapped in try/catch so a Resend failure never breaks the triggering action — see §8). **The "bell/inbox" half of this line was aspirational until now, not actually built**: `getInbox()`/`markNotificationRead()` existed with zero callers anywhere in the app (confirmed by grep before starting) — toggling a category's "In-app" preference silently wrote `Notification` rows nobody could ever see. Closed in this pass: `src/components/app-shell/notification-bell.tsx` (Server Component, mirrors `Nav`'s own shape — fetches `getInbox(member)`, hands off to a Client Component) + `notification-bell-button.tsx` (a `Popover`-based bell, unread-count badge, click-to-mark-read, "Mark all read"), wired into `(app)/layout.tsx` alongside Quick Capture/Search. New `markAllNotificationsRead()` action (`src/lib/notifications/actions/mark-all-read.ts`) — `markNotificationRead()` only ever handled one at a time. Both `getInbox()` and `markNotificationRead()` also had zero test coverage before this pass (the same "built with no caller, so no test either" pattern as other harness gaps this session) — `get-inbox.test.ts`/`mark-read.test.ts`/`mark-all-read.test.ts` added. **Real, unrelated bug found while browser-verifying this against the local seed household**: assigning a task to a *local seed* member (`sam@seed.local` etc.) always fails silently — `task-form.tsx`'s `assigneeId` selection shows correctly in the UI but the form never submits, because `entities/task.ts`'s `createTaskInputSchema` validates `assigneeId: z.string().cuid()`, and `prisma/seed/constants.ts`'s `SEED_MEMBER_OWNER_ID`/`SEED_MEMBER_ADMIN_ID`/`SEED_MEMBER_MEMBER_ID` are human-readable strings (`"seed-member-sam"` etc.), not real CUIDs — every local seed member fails `.cuid()` outright. **Not fixed here** — real production households (Supabase-generated `@default(cuid())` ids) are unaffected, so this is a local-dev-only gap, and fixing it means picking a side (relax the schema's `.cuid()` to a plain `.string()`, or reissue the seed with real cuid-shaped ids) that's out of this change's scope; the bell/notification flow itself (badge count, popover list, mark-read) is verified locally against the empty-inbox state; the actual task-assignment → notification path still needs verifying against a household with real cuid-shaped member ids (i.e. production), since local seed data can't exercise it until the gap above is addressed.
- [x] Digest send scheduler reads `DigestSubscription.nextRunAt`, rolls up unread `Notification` rows + active `ReminderOccurrence`s, sends via Resend, advances `nextRunAt` (`src/lib/notifications/jobs/send-digests.tsx`, backs `/api/cron/digests-send`)

### Events emitted (`ModuleEventType`, owning module `household`)
- [x] `household.invite_received` — resolved: `household` is now a platform-substrate pseudo-module (`src/lib/household/module.ts`), a ninth entry in `ALL_MODULES` alongside the 8 real `src/modules/` ones, existing solely to own this event type and `share.received` below (`ModuleEventType.owningModuleId` is `NOT NULL`, and `household` can't be a member of the registry it's registering). Not actually wired through the standard Notification-backed pipeline, though — see the note below.
- [x] `share.received` — seeded the same way. **Actually emitted** from `syncObjectShares()` (`src/lib/household/actions/sync-object-shares.ts`), diffed against the previous share set so it only fires for members newly added, not on every re-save of an already-shared object.
- **Note on `household.invite_received`:** unlike `share.received`, this key is registered for audit-trail/registry-completeness purposes only — it is **not** emitted anywhere, and its email is **not** sent through the standard `NotificationPreference`-gated pipeline. An invitee has no `Member` row yet at invite-creation time, so there is no `memberId` to gate a preference against or resolve via `NOTIFICATION_BACKED_RECIPIENTS`. `inviteMember()` (`src/app/(app)/settings/members/actions.ts`) instead calls `sendHouseholdInviteEmail()` directly and unconditionally — the one deliberate exception to "every email goes through `sendCategoryEmail()`+preferences." If a future need arises to notify *existing* household members that "an invite was sent," that would be a genuine `emitEvent("household.invite_received", ...)` call; today the key exists only so the row is available.

```prisma
// prisma/schema.prisma — first two models, everything else FKs to Household
model Household {
  id           String          @id @default(cuid())
  name         String
  timezone     String
  baseCurrency String
  status       HouseholdStatus @default(active)
  createdAt    DateTime        @default(now())
  members      Member[]
}

enum HouseholdStatus {
  active
  suspended
  closed
}

model Member {
  id             String       @id @default(cuid())
  householdId    String
  household      Household    @relation(fields: [householdId], references: [id])
  displayName    String
  email          String
  role           MemberRole   @default(member)
  status         MemberStatus @default(active)
  emailVerifiedAt DateTime?
  joinedAt       DateTime     @default(now())
  lastLoginAt    DateTime?

  @@unique([householdId, email]) // unique per household, not globally
}

enum MemberRole   { owner admin member }
enum MemberStatus { active suspended removed }
```

---

## 2. Tasks, Kanban & Calendar

### Entities
- [x] `Task` — householdId, title, description, dueDate, dueDateAllDay, priority (`low`/`medium`/`high`/`urgent`), assigneeId (single — no multi-assignee), createdById, completedAt + completedById, parentTaskId (one level of sub-task nesting only), seriesId + recurrenceRuleId, boardId/columnId/boardPosition (optional), visibility, sourceModule/sourceEntityId, archivedAt (soft-archive, added later — see "Delete task" below; same shape as `KanbanBoard.archivedAt`, never a real `prisma.task.delete()`)
- [x] `TaskRecurrenceRule` — taskId (1:1 master), frequency (`daily`/`weekly`/`monthly`/`yearly`), interval, byWeekday, endType/endDate/occurrenceCount
- [x] `Tag` — householdId, name, color (shared taxonomy — reused by both Task and Note)
- [x] `TaskTag` — join table (taskId, tagId)
- [x] `KanbanBoard` — householdId, name, description, position, visibility, archivedAt (soft-archive only, no hard delete), createdById
- [x] `KanbanColumn` — boardId, name, position, columnType (`todo`/`in_progress`/`done`/`custom` — independent of display name)
- [x] `Event` — householdId, title, description, location, startAt/endAt, allDay, visibility, color, createdById (one-off only in V1, no recurrence)

`Task`, `Kanban`, and `Calendar` are all built end-to-end (entities/
actions/queries/UI/tests/events). `src/modules/tasks/` (PR "Tasks module
vertical slice", 2026-07-24) — `createTask`/`updateTask`/`completeTask`/
`reopenTask`/`deleteTask` actions, `getTask`/`getVisibleTasks`/`getHouseholdTags`/
`getTasksDueInRange` queries, `TaskForm`/`TaskList`/`NewTaskDialog`
components, `/tasks` page, `task.assigned`/`task.completed` emitters.
`src/modules/kanban/` (PR "Kanban module vertical slice", 2026-07-24) —
`createBoard`/`updateBoard`/`archiveBoard`/`createColumn`/`updateColumn`/
`deleteColumn`/`createCard`/`moveCard` actions, `getBoards`/`getBoard`/
`getBoardWithColumns` queries, `BoardView` (dnd-kit drag-and-drop,
`@dnd-kit/core`)/`KanbanColumnView`/`KanbanCard`/`BoardForm`/`ColumnForm`/
`BoardHeader` components, `/kanban` (board list) + `/kanban/[boardId]`
(board view) pages, `onTaskCompleted` event subscriber wired into
`src/lib/events/handlers.ts`. `src/modules/calendar/` (PR "Calendar module
vertical slice", 2026-07-25) — `createEvent`/`updateEvent`/`deleteEvent`
actions, `getEvent`/`getCalendarRange` queries (merges `Event` rows with
`tasks`' `getTasksDueInRange()`, per plan.md §4.4 — no `Event` row is ever
created for a task), `CalendarShell`/`MonthView`/`WeekView`/`DayView`/
`CalendarNav`/`EventForm`/`EventDetailDialog` components, `/calendar` page
(`?view=month|week|day&date=...` query-param driven, `Link`-based nav —
no client JS needed to change view/date), `event.created` emitter. Every
action across all three modules has happy + rejected path tests;
`onTaskCompleted` has its own 4-case test per `docs/module-architecture.md`
§13; every `queries/*.ts` now has its own visibility/tenant-scope test too
(§13's documented convention had been skipped for Tasks/Kanban's queries
until this pass — backfilled in the same change that added Calendar's).
`TaskRecurrenceRule` and `EventRecurrenceRule` (V2) remain out of scope —
Events are one-off only in V1, matching plan.md §4.4.

### Features / behaviors
- [x] Computed statuses derived, never stored as a flag: `open` / `overdue` / `completed` — `completedAt` is the single source of truth, no separate boolean (`getTaskStatus()`)
- [ ] Recurring tasks generated lazily off `seriesId` + `recurrenceRuleId`; only the current occurrence is ever materialized — future occurrences are **never** projected onto the calendar. **Confirmed still entirely unbuilt** (Email & Scheduled Jobs phase): `TaskRecurrenceRule` is never written or read anywhere in `src/modules/tasks/`'s real action files — the schema column exists, the feature doesn't. Not the same gap as Reminders' own recurrence (that one's now fixed, see §3) — Tasks' own recurring-task generation is a separate, still-open item.
- [x] Opt-in "remind me before due date" (`task.due_soon`) — `task-form.tsx`'s "Remind me before due date" switch (shown once a due date is set) + a lead-time value/unit pair, reusing `Reminder.leadTimeValue`/`leadTimeUnit`. `regenerateTaskDueReminder()`/`cancelTaskDueReminder()` (`src/modules/tasks/actions/regenerate-task-due-reminder.ts`) wired into `createTask`/`updateTask` (cancel-and-recreate)/`completeTask` (cancel only) — mirrors Life Admin's `regenerateRenewalReminders()` shape. Targets the assignee, falling back to the acting member if unassigned. See §8's "Known harness gaps" for the full story (a real, pre-existing gap this closes) and why no parallel audit-trail sweep job was built for it.
- [x] **Edit task UI** — `task-row-actions.tsx` (Edit button + dialog on each `/tasks` row, reusing `TaskForm` in edit mode) — a real, previously-missing gap (see §8) closed alongside the reminder feature above.
- [x] A task can exist with no board placement at all (`boardId`/`columnId`/`boardPosition` all null) — `createTask`/`updateTask` never set these, so every task is boardless until placed on a board
- [x] Multiple Kanban boards per household (`getBoards`/`/kanban` board list + "New board")
- [x] `columnType = done` drives auto-completion: completing a task from the plain list auto-moves its card to the household's first `done`-typed column (`onTaskCompleted`) — **and** the reverse, dragging a card into/out of a done-typed column completes/reopens the task (`moveCard` calling `completeTask`/`reopenTask` directly)
- [x] **Uncheck a completed task from the plain list** (user-noticed gap: the list checkbox locked once checked, with no way back — `reopenTask()` already existed, tested, but was only ever called from `moveCard`'s drag-out-of-done-column path, never from a direct user action on `/tasks`). `task-list.tsx`'s checkbox `disabled` no longer includes `status === "completed"`; `onCheckedChange` now branches on the new checked value — `completeTask()` when checking, `reopenTask()` when unchecking — both still routed through `useActionFeedback` (silent, matching the existing rapid-fire-toggle convention).
- [x] **Delete task** (user-requested, "sta mislis treba li task imati mogucnost brisanja"): a real, previously-nonexistent `deleteTask()` action (`src/modules/tasks/actions/delete-task.ts`) plus a new migration (`add_task_archived_at`) adding `Task.archivedAt`. Deliberately a **soft archive, not a hard delete** — every other entity in the app (KanbanBoard, Renewal, Subscription, Note, ShoppingList) uses soft-archive/cancel rather than a real `DELETE`, specifically to avoid losing history and dangling references (`TaskTag` rows, sub-tasks via `parentTaskId`, `NoteLink`s pointing at the task, its Kanban card placement) — `deleteTask()` follows the exact same `KanbanBoard.archivedAt` shape rather than inventing a new stored `status` enum, since Task's status (`open`/`overdue`/`completed`) is already fully derived from `completedAt` (`getTaskStatus()`) and a second, independently-stored status risks contradictory states (e.g. "completed" and "cancelled" at once). Auth gate mirrors `updateTask`'s own (creator-or-assignee, docs/access-control.md §4.3) rather than Document's stricter admin/owner-only delete — this is reversible and hidden, not permanent, so it's closer to `cancelRenewal()`'s "same gate as edit" precedent than to a genuine data-loss operation. Every existing Task-listing query now filters `archivedAt: null`: `getVisibleTasks()` (covers `/tasks`, Dashboard's Today view, and cross-entity search, all of which call it), `getTasksDueInRange()` (Calendar), and `getBoardWithColumns()` (a task's Kanban card also disappears once the task is deleted). UI: a "Delete" button next to "Edit" in `task-row-actions.tsx`, behind the shared `ConfirmDialog` (`successMessage="Task deleted"`, mechanism B from the toast-notification pass). `delete-task.test.ts` covers the happy path (creator) and the rejected path (neither creator nor assignee).
- [x] Drag-and-drop between columns persists `boardPosition` (`BoardView`, dnd-kit) — **partial**: only column-to-column moves and append-at-end are implemented; dropping precisely between two existing cards (fine-grained reordering) and column drag-reordering are not — both append/create-order only for V1
- [x] Calendar is a **query, not a store**: `getCalendarRange()` fetches `Event` rows (visibility-scoped, overlap with the range) + `Task` rows with `dueDate` in range (via `tasks`' `getTasksDueInRange()`) and merges them client-side (`toCalendarItems()`) — no `Event` row is ever created for a task, so completing a task from the calendar's own chip isn't wired (there is no chip-level complete action) but editing/completing it from `/tasks` or its Kanban card immediately reflects here since it's the same row
- [x] Month / week / day calendar views (`MonthView`/`WeekView`/`DayView`, day view is also what a month cell or "+N more" link navigates to) — **not implemented**: an hourly/pixel-per-time grid for week/day (items are listed chronologically per day, not positioned by exact time-of-day visually)

### Events emitted (owning module `tasks`)
- [x] `task.assigned` (`src/modules/tasks/events/emitters.ts`, called from `createTask` when `assigneeId` is set)
- [x] `task.completed` (called from `completeTask`)

### Kanban's event subscription (owning module `kanban`)
- [x] `EventSubscription` on `task.completed` — `onTaskCompleted()` moves the card to the board's first done-typed column, no-oping if the task has no board or the board has no done-typed column; guards against overriding a card already sitting in *some* done-typed column (e.g. one a member dragged it into directly) so it doesn't get snapped to the *first* one instead

### Events emitted (owning module `calendar`)
- [x] `event.created` (`src/modules/calendar/events/emitters.ts`, called from `createEvent`)
- [ ] `event.starting_soon` — would need its own scheduled sweep job (none built for Calendar specifically, unlike Reminders/Finance/Life Admin's five, all of which are now real and working — see §8); not emitted anywhere yet

---

## 3. Reminders & Notes

The shared alerting capability every other module must call into instead of
building its own notification logic.

### Entities
- [x] `Reminder` — householdId, title (snapshot — **not** kept in sync with source renames), description, reminderType (`one_off`/`recurring`), targetMemberId (single — no multi-recipient), createdByMemberId, sourceType (`manual`/`task`/`subscription`/`renewal`/`document`/`budget`/`other`), sourceModule/sourceEntityId, firstRemindAt, leadTimeValue/leadTimeUnit, recurrenceFrequency/Interval/DaysOfWeek/EndDate/Count, status (`active`/`paused`/`cancelled`), emailEnabled
- [x] `ReminderOccurrence` — reminderId, remindAt, status (`pending`/`notified`/`snoozed`/`dismissed`/`completed`/`missed`), notifiedAt/acknowledgedAt/snoozedUntil/snoozeCount
- [x] `Note` — householdId, authorMemberId, title, body (markdown), noteType (`standard`/`journal`), entryDate (journal only), visibility (default `household` for standard, `private` for journal), isPinned, isArchived
- [x] `NoteTag` — join table (noteId, tagId), same shape as `TaskTag`, reuses the shared `Tag`
- [x] `NoteLink` — noteId, linkedEntityModule/linkedEntityType (`task`/`subscription`/`event`)/linkedEntityId, createdByMemberId
- [x] `resolveReminderCategoryKey()` / `getEffectivePreference()` (`src/lib/notifications/entities/notification-preference.ts`) — the sourceType → categoryKey mapping docs/email.md §2.2 defines

`Reminder` is built end-to-end (PR "Reminders module vertical slice",
2026-07-25): `src/modules/reminders/` — a two-layer action design, since
this is the one module explicitly meant to be called with no acting
member/session at all (a cron sweep job): `createReminder()` (the trusted,
internal "platform capability", takes `householdId`/`createdByMemberId`
explicitly, does **not** call `requireMember()`) + `createManualReminder()`
(the actual client-facing Server Action, resolves the session, validates
`targetMemberId` belongs to the household, then delegates to
`createReminder()`) — `updateReminder`/`cancelReminder` actions,
`snoozeOccurrence`/`dismissOccurrence`/`completeOccurrence` actions
(target-member-only, checked against `Reminder.targetMemberId` since
Reminder carries no `visibility`/`ObjectShare` column at all —
`docs/access-control.md` §5.1's visibility-carrying list deliberately
excludes it), `getVisibleReminders`/`getReminder`/
`getActiveReminderOccurrences` queries, `ReminderForm`/`ReminderList`/
`OccurrenceActions` components, `/reminders` page,
`reminder.created`/`reminder.snoozed`/`reminder.completed`/
`reminder.cancelled` emitters. `Note`/`NoteTag`/`NoteLink` are also built
end-to-end (PR "Notes module vertical slice", 2026-07-25):
`src/modules/notes/` — `createNote`/`updateNote` (author-only edits, unlike
Contact's "visibility is the whole check" — Note follows Task/KanbanBoard/
Event's stricter pattern instead, docs/access-control.md §4.3) /
`archiveNote`/`unarchiveNote` actions, a dedicated
`upsertJournalEntry()` capability for "today's entry" (always
`noteType: "journal"`/`visibility: "private"`, neither user-choosable,
upserted via the `(authorMemberId, entryDate)` unique constraint — kept
separate from the standard-note create/update actions rather than folding
a noteType toggle into one form), `linkNote`/`unlinkNote` actions (only
`task`/`event` are wireable today; `subscription` waits on Finance),
`getVisibleNotes`/`getNote`/`getJournalEntry` queries,
`NoteForm`/`NoteList`/`NoteDetail`/`JournalWidget`/`NoteLinkDialog`/
`MarkdownBody` (via the newly added `react-markdown` dependency —
plan.md's own "Note.body supports markdown" requirement, not previously
renderable) components, `/notes` (list + journal widget) + `/notes/[noteId]`
(edit-in-place detail, matching `docs/resources.md`'s `ContactDetail`
pattern) pages, `note.created`/`note.linked` emitters.

### Features / behaviors
- [x] Any module that needs to alert a member creates a `Reminder` row via `createReminder()` — no module implements its own scheduling/alerting (not yet exercised by a second built-in the way `docs/recipes.md` §4's Finance/Budget worked example shows, since Finance isn't built yet — the capability itself is real and covered by tests)
- [x] Only one live `ReminderOccurrence` per reminder at a time — the first occurrence is created eagerly alongside the `Reminder`; for a `recurring` reminder, the *next* occurrence is now generated lazily once the current one reaches a terminal state (dismissed/completed/missed), capped by `recurrenceEndDate`/`recurrenceCount` — `generateNextOccurrenceIfDue()` (`src/modules/reminders/actions/generate-next-occurrence.ts`, Email & Scheduled Jobs phase), called from `completeOccurrence()`/`dismissOccurrence()` and the reminders-sweep's missed-sweep. Fully resolves the gap this line used to track.
- [x] Notification fires at `remindAt` via the reminders-sweep cron job (`sweep-due-occurrences.ts`, `/api/cron/reminders-sweep`, every 15 min) — real, built, and Resend-integrated (Email & Scheduled Jobs phase, §8)
- [x] 24-hour unacknowledged grace window before an occurrence flips to `missed` — same cron job's second pass
- [x] Snooze support (`snoozedUntil`, `snoozeCount`) with no cap enforced beyond UI affordance (`snoozeOccurrence`, three quick-pick presets in `OccurrenceActions`)
- [ ] Graceful degradation: if the `sourceModule`/`sourceEntityId` a reminder points to is deleted, the reminder converts to a standalone manual reminder — still not exercised; Renewal/Subscription/Task-sourced reminders now all exist for real (§4/§5/§2), but none of their own delete flows (if any) cancel-vs-convert their Reminders this way yet
- [x] Computed `"due"` status for a `pending` occurrence whose `remindAt` has passed (`getOccurrenceStatus()`) — the same derive-don't-store principle as Task's `getTaskStatus()`; the UI still reads a pending-and-overdue occurrence as actionable between sweep ticks (the cron runs at most every 15 min), not just before the cron existed
- [x] Journal notes: one entry per member per day, upserted by `entryDate` (not appended) — `upsertJournalEntry()`, backed by the `one_journal_entry_per_member_per_day` unique constraint
- [x] `NoteLink` renders as a chip/card **only on the note's own side** (`NoteDetail`'s "Linked to" section, resolving the linked Task/Event's title, not a raw id — a real bug caught via an actual browser test and fixed) — the *other* side (a link chip on the Task/Event's own page pointing back at the note) is **not implemented**; Task/Calendar detail views don't render inbound `NoteLink`s yet

### Events emitted (owning module `reminders`)
- [x] `reminder.due` — emitted by the reminders-sweep cron job (§8), system-triggered (`triggeredByMemberId: null`), for every occurrence it fires
- [x] `reminder.created` (called from `createReminder`)
- [x] `reminder.snoozed` (called from `snoozeOccurrence`)
- [x] `reminder.completed` (called from `completeOccurrence`)
- [x] `reminder.cancelled` (called from `cancelReminder`)

### Events emitted (owning module `notes`)
- [x] `note.created` (called from `createNote`)
- [x] `note.linked` (called from `linkNote`)

---

## 4. Finance

"Bills"/"subscriptions" collapse into a single `Subscription` entity —
expense-only in V1; income is logged as manual `Transaction` rows, never a
generalized recurring-income concept.

### Entities
- [x] `Category` — householdId, name, type (`expense`/`income`/`both`), color/icon, isSystemDefault (seeded starter set), archived, sortOrder
- [x] `Transaction` — householdId, type (`expense`/`income`), amount (always positive), currency (defaults to `Household.baseCurrency`, cosmetic only — no conversion), categoryId, title, notes, date, paidBy, source (`manual`/`subscription`/`imported` — imported reserved for V2), subscriptionId (optional), attachment (reuses `Document`, not rebuilt), linkedNoteId/linkedTaskId, visibility, splitType (`none`/`equal`/`percentage`/`custom`), status (`posted`/`void`)
- [x] `TransactionSplit` — transactionId, memberId, shareAmount, sharePercent, settled, settledBy
- [x] `Settlement` — householdId, fromMemberId, toMemberId, amount, date, method, note, status (`recorded`/`cancelled`), appliesTo (TransactionSplit[])
- [x] `Budget` — householdId, categoryId, memberId (nullable — null means whole-household), period (`weekly`/`monthly`/`yearly`), amount, effectiveFrom/endDate, alertThresholdPercent (default 80), alertOnExceeded, rolloverUnused (reserved, always `false` in V1)
- [x] `Subscription` — householdId, name, merchant, categoryId, amount, variableAmount, frequency (`weekly`/`biweekly`/`monthly`/`quarterly`/`yearly`/`custom`), customIntervalDays, startDate/endDate, nextDueDate, alertDaysBefore (default 3), responsibleMemberId, autoCreateTransaction, status (`active`/`paused`/`cancelled`), lastPaidDate
- [x] `MonthlySummary` — computed view (`getMonthlySummary()`: income/expense/net, by-category and by-member breakdowns, budget-vs-actual, subscriptions-due count) — a plain aggregation function, not a stored table
- [x] `MemberBalance` — computed view (`getMemberBalances()`: pairwise "who owes whom", derived from unsettled `TransactionSplit`s + free-standing `Settlement`s) — not a stored table

Built end-to-end (PR "Finance module vertical slice", 2026-07-25):
`src/modules/finance/` — `createCategory`/`updateCategory`/`archiveCategory`
(no ownership check — shared household config, like `Tag`) actions;
`createTransaction`/`updateTransaction`/`voidTransaction` (owner-gated on
`paidById`, blocked once any split is `settled`, per plan.md §9 Q23) with
cent-precise equal/percentage/custom split computation (`entities/split.ts`'s
`computeEqualSplits`/`splitsSumMatches`) and the payer's own split
auto-settled at creation; `createSettlement`/`cancelSettlement`
(owner-gated on being a party to the settlement; linking to specific
`TransactionSplit` rows is validated end-to-end — never trusts a
client-supplied split id without re-checking household/debtor/creditor
match); `createBudget`/`updateBudget` (no delete action — setting `endDate`
is how a budget "ends"); `createSubscription`/`updateSubscription`/
`pauseSubscription`/`resumeSubscription`/`cancelSubscription` plus the
two-layer payment-posting design mirrored from Reminders'
`createReminder()`/`createManualReminder()` split:
`postSubscriptionPayment()` (internal, session-less, callable from a cron
sweep) + `markSubscriptionPaid()` (the user-facing wrapper); a signup-time
`seedStarterCategories()` hook (8 starter categories per plan.md §3.4,
wired into `signUpAndCreateHousehold()`'s existing transaction). Two real,
callable sweep jobs (unlike Reminders'/Calendar's cron-gated gaps) —
`jobs/sweep-budget-thresholds.ts` and `jobs/sweep-subscription-due-dates.ts`
— wired to `src/app/api/cron/budgets-sweep` and
`.../subscriptions-sweep`, both `CRON_SECRET`-gated, both idempotent
(checked via an existing-`Reminder`-for-this-period lookup before creating
another one). Full UI: `TransactionForm`/`SplitEditor` (shared by
percentage/custom split entry — dollar amounts are the one canonical shape
that reaches the schema, `sharePercent` is display-only per plan.md §3.4)/
`TransactionList`/`TransactionRowActions`/`CategoryList`/`CategoryForm`/
`BudgetForm`/`BudgetList`/`SubscriptionForm`/`SubscriptionList`/
`SubscriptionRowActions`/`SettlementForm`/`SettlementList`/
`MonthlySummary`/`MemberBalances` (its "Settle up" button pre-fills a
`SettlementForm` dialog straight from a computed balance row) components;
`/finance` (dashboard: monthly summary + balances + categories + recent
transactions), `/finance/subscriptions`, `/finance/budgets`,
`/finance/settlements` pages. A shared `src/components/confirm-dialog.tsx`
was built here too — referenced by name in `docs/project-structure.md`/
`docs/forms.md`/`docs/ui-components.md`/`docs/tables.md` for a while
before it existed anywhere — first consumed by Transaction Void,
Subscription Cancel, and Settlement Cancel.

Two real bugs found via actual browser testing (Playwright, desktop +
mobile) and fixed in the same change, continuing this project's established
per-module pattern:
- **Prisma `Decimal` fields crossing into Client Components** — every
  Finance money field (`Transaction.amount`, `TransactionSplit.shareAmount`/
  `sharePercent`, `Settlement.amount`, `Budget.amount`, `Subscription.amount`)
  broke Next.js's RSC serialization the moment a row carrying one reached a
  `"use client"` component. Fixed platform-wide, not per call site: a new
  `decimalSerializeExtension` (`src/lib/db/decimal-serialize.ts`, chained
  onto `prisma` alongside the existing tenant-guard extension) recursively
  converts every `Decimal` in a query result to a plain `number` — covers
  Finance today and any Decimal field a future module adds, with no
  per-query mapper to remember.
- **"Paid by"/"Responsible"/"From" defaulted to the alphabetically-first
  household member, not the acting member** — `TransactionForm`,
  `SubscriptionForm`, and `SettlementForm` all used `members[0]?.id` for a
  new record's default owner-ish field instead of the logged-in member.
  For Transaction specifically this was consequential, not cosmetic: since
  `TransactionRowActions` only renders when `transaction.paidById ===
  actingMemberId`, the actual creator lost the ability to Edit/Void their
  own just-created transaction unless they remembered to manually reselect
  themselves. Fixed by threading `actingMemberId` down through
  `NewTransactionDialog`/`TransactionFormDialog`/`TransactionRowActions`
  (and the equivalent Subscription/Settlement chains).

Known UI scope cut: `SettlementForm` has no picker for `appliesToSplitIds`
— every settlement recorded through the UI is a free-standing balance
adjustment (the action layer's linked-settlement path, and its validation
that a linked split actually matches the from→to direction, is fully built
and tested — just not wired to a UI control yet). `MemberBalance`'s math
still nets these correctly, so nothing is broken, only a settlement can't
be explicitly tied to specific transactions from the UI today, only by
amount.

Also surfaced, not Finance-specific but discovered while browser-testing
Finance's multi-member flows: `/settings/members` has no `page.tsx` at all
— `inviteMember`/`acceptInvite`/`removeMember` etc. (ROADMAP.md §1) exist
as Server Actions with no route rendering a form for them. Noted in §1
below rather than built here — out of this module's scope.

### Features / behaviors
- [x] `Settlement` is the **only** fact that adjusts a balance — `TransactionSplit.settled` and `MemberBalance` are always derived, never edited directly
- [x] Editing or voiding a `Transaction` that has already-settled splits is **blocked**; the settlement must be undone first
- [x] No special stricter money-visibility rule — Finance rows use the same `Visibility`/`ObjectShare` contract as every other module
- [x] Budget alert with `memberId = null` notifies **all** household members, not just whoever tipped it over
- [x] Budget threshold breach creates a `Reminder` (`sourceType = budget`) via the real, callable `sweep-budget-thresholds` job — subject to normal per-category notification opt-out, not a hardcoded always-on alert
- [x] Subscription due-date approach (within `alertDaysBefore`) creates/refreshes a `Reminder` (`sourceType = subscription`) via the real, callable `sweep-subscription-due-dates` job
- [x] `autoCreateTransaction` subscriptions post a `Transaction` (`source = subscription`) and advance `nextDueDate`/`lastPaidDate` — both on the sweep job run and via the manual `markSubscriptionPaid()` path
- [x] `MonthlySummary`/`MemberBalance` implemented as plain server-side aggregation functions over `prisma.transaction`/`transactionSplit`/`settlement` queries, not a duplicated write-path table — `budgetsVsActual` deliberately evaluates each budget's own live "current period as of now" (`getCurrentPeriodRange(budget.period, new Date())`), not the summary's own `month` param or the budget's `effectiveFrom` — matches the sweep job's own math (`docs/recipes.md` §4.2 corrected to match)

### Events emitted (owning module `finance`)
- [x] `bill.due_soon` (called from the subscriptions-due-dates sweep job)
- [x] `transaction.recorded` (called from `createTransaction`)
- [x] `budget.threshold_exceeded` (called from the budget-thresholds sweep job)
- [x] `settlement.recorded` (called from `createSettlement`)

---

## 5. Life Admin

### Entities
- [x] `Document` — householdId, title, fileRef, mimeType, fileSizeBytes (fixed platform-wide limit, e.g. 10MB — not configurable per household), category (`warranty_proof`/`insurance_policy`/`id_document`/`receipt`/`manual_guide`/`contract`/`property_record`/`other`), description, linkedEntityType/linkedEntityId (`renewal`/`contact`/`subscription`/`task`/`note`/`event`), uploadedBy, visibility
- [x] `Renewal` — householdId, title, type (`warranty`/`insurance`/`registration_license`/`membership_subscription`/`certificate_id`/`lease_contract`/`domain_hosting`/`other` — `warranty` is one type value, not its own entity), provider, purchaseOrIssueDate, expiryDate, reminderOffsetsDays (default `[30]`), recurrence (`none`/`monthly`/`quarterly`/`annual`/`custom_interval`), status (`active`/`expiring_soon`/`expired`/`renewed`/`cancelled`), responsibleMemberId, providerContact, lastRenewedAt, visibility, createdBy
- [x] `Contact` — householdId, name, category (`medical`/`emergency_services`/`home_service_provider`/`insurance_agent`/`landlord_property_manager`/`school_childcare`/`financial_legal`/`utility_provider`/`family_friend`/`other`), phone/email/address/website (≥1 required), notes, isPinned, visibility, createdBy
- [x] `ShoppingList` — householdId, name, type (`shopping`/`household_tasks`/`packing`/`gift_ideas`/`other`), description, isArchived, visibility, createdBy
- [x] `ShoppingListItem` — listId, name, quantity, category, isChecked (+checkedBy/checkedAt), addedBy, sortOrder, notes

Built end-to-end (PR "Life Admin module vertical slice", 2026-07-25):
`src/modules/life-admin/` — all four entities share the same
`visibility`/`ObjectShare` pattern via the platform's `visibilityWhere()`
(`@/lib/access/visibility`) and `syncObjectShares()`
(`@/lib/household/actions/sync-object-shares`), never a per-entity
reimplementation. Ownership/edit-gate decisions, made deliberately per
entity since plan.md §9 Q30 only names Contact/ShoppingList explicitly:
`createContact`/`updateContact` — visibility **is** the whole edit check
(Q30); `deleteContact` — creator-or-admin/owner (harness extrapolation,
delete is stricter than edit); `createShoppingList`/`updateShoppingList` +
every `ShoppingListItem` action — Q30 applies directly, anyone with list
access edits/checks off/removes freely (no confirm dialog on item removal,
matching this project's own tier-3-exception convention); `Renewal`'s
create/update/markRenewed/cancel — creator-or-responsibleMember
(Task-shaped extrapolation, since Renewal has no Q30 carve-out but does
have an assignee-like field to mirror Task's own rule); `Document`'s
update-metadata/replace/delete — uploader-or-admin/owner (stricter
default, no carve-out named, and it's the most sensitive category in the
whole plan — `id_document`).

**Renewal reminder generation is real, not a documented gap**: creating or
updating a Renewal calls `regenerateRenewalReminders()`
(`actions/regenerate-renewal-reminders.ts`), which creates one `Reminder`
per `reminderOffsetsDays` entry via `createReminder()` (Reminders' shared
platform capability). Changing `expiryDate`/`reminderOffsetsDays`/
`responsibleMemberId` cancels the old reminders first — directly via
Prisma (`cancelRenewalReminders()`), not by calling reminders'
user-facing `cancelReminder()` action, since that action's own
authorization (must be the reminder's `createdByMemberId` or
`targetMemberId`) doesn't line up with "any member who can edit this
Renewal" — deliberate, documented in the code. `markRenewalRenewed()`
always prompts for a new `expiryDate` (plan.md §9 Q29, never
auto-advances) and resolves to `status: "active"` (recurring) or
terminal `"renewed"` (recurrence `none`) — `RenewalHistory` (V2,
out-of-scope) means this updates the same row in place, no per-cycle log.
`getRenewalLifecycleStatus()` derives `active`/`expiring_soon`/`expired`
at read time from `expiryDate`/`reminderOffsetsDays` — same derive-don't-
store ADR as Task/Reminder — and Q28's "auto-archive after a 30-day grace
period" is a query-level filter (`get-visible-renewals.ts`), not a stored
flag or cron job.

**Document upload is the full real signed-URL flow** (`docs/upload.md`):
`requestDocumentUpload`/`confirmDocumentUpload` (new file) and
`requestDocumentReplace`/`confirmDocumentReplace` (existing file, in
place — never the same object path, never deletes the old object before
the new one is confirmed written) mint a Supabase Storage signed upload
URL server-side; the browser PUTs bytes directly to Storage, bypassing
Vercel's serverless body-size limit entirely. `checkDocumentUploadPolicy()`
(`src/lib/storage/policy.ts` — 10MB, PDF/JPEG/PNG/WebP/HEIC only, plan.md
§9 Q27) is enforced client-side (UX only), server-side (the real gate,
checked twice — once per step), and at the bucket level
(`fileSizeLimit`/`allowedMimeTypes`, provisioned by the new
`scripts/setup-storage-bucket.ts` / `pnpm run storage:setup`).
`getDocumentDownloadUrl()` mints a 5-minute signed read URL only after
`getDocument()`'s visibility check passes — the entire access-control
gate for Storage, never cached, minted fresh per view
(`getDocumentPreview()`, a thin client-callable Server Action wrapper,
plus `<DocumentPreviewDialog>`, a `"use client"` component — not an async
Server Component rendered lazily, which doesn't actually work the way an
earlier docs/upload.md draft implied). `linkDocument`/`unlinkDocument` are
separate, dedicated actions (mirroring Notes' `linkNote`/`unlinkNote`
split) rather than folded into `updateDocumentMetadata`.

Full UI: `ContactForm`/`ContactList`/`NewContactDialog`,
`RenewalForm`/`RenewalList`/`NewRenewalDialog`/`MarkRenewalRenewedDialog`,
`DocumentUploadDialog`/`DocumentList`/`DocumentPreviewDialog`/
`ReplaceDocumentDialog`/`DocumentMetadataForm`,
`ShoppingListForm`/`NewShoppingListDialog`/`ShoppingListSummaryList`/
`ShoppingListDetail` components; `/life-admin` (a hub page — Documents/
Renewals/Contacts each get a flat top-level route per
`docs/project-structure.md`'s route tree, but ShoppingList only has a
`[listId]` detail route, so the list-of-lists + "New list" lives on the
hub instead, with links out to the other three sections),
`/life-admin/contacts`, `/life-admin/renewals`, `/life-admin/documents`,
`/life-admin/shopping-lists/[listId]` pages. Contact follows a "list +
inline edit dialog" pattern, not a separate detail page — the actual route
tree never gave it a `[contactId]/page.tsx`, unlike an earlier draft of
`docs/resources.md`'s own worked example.

**Known, deliberate UI scope cut**: no drag-and-drop reordering for
`ShoppingListItem.sortOrder` — items append at the end only (same
accepted scope cut as Kanban's own card drag-and-drop). No UI control for
linking an existing `Document` to a Renewal/Contact after upload beyond
what `linkDocument`/`unlinkDocument` support at the action layer — the
capability is real and tested, just not wired to a button yet (same shape
as Finance's Settlement `appliesToSplitIds` gap).

Three real bugs found via actual browser testing (Playwright, desktop +
mobile) and fixed in the same change:
- **React controlled/uncontrolled input warnings on every "create" form**
  — `ContactForm`/`RenewalForm`/`DocumentUploadDialog`/`ShoppingListForm`'s
  create-mode `defaultValues` all omitted the required text field
  (`name`/`title`), so the `<Input>` started uncontrolled (`value={undefined}`)
  and flipped to controlled once typed. Fixed by adding the missing empty-
  string default to each — the edit-mode branches already had it right.
- **`revalidatePath("/life-admin/shopping-lists")` targeted a route with no
  `page.tsx`** (`create-shopping-list.ts`/`archive-shopping-list.ts`/
  `unarchive-shopping-list.ts`/`update-shopping-list.ts`) — only
  `/life-admin/shopping-lists/[listId]` is a real route; the list-of-lists
  renders on `/life-admin`. Didn't cause a visible symptom in dev (Next
  still re-ran the Server Component on navigation), but was pointing at
  the wrong path — fixed to revalidate `/life-admin`.
- `ContactList`'s "All contacts" section rendered its heading even when
  empty (e.g. right after pinning a household's only contact) — minor,
  fixed by conditioning the section on `rest.length > 0`.

**Environment gap, not a code bug, also fixed**: the local Supabase
Storage `documents` bucket was never provisioned — `README.md`'s setup
steps went straight from `pnpm prisma db seed` to `pnpm dev` with no
storage-provisioning step, so every `Document` upload would fail on a
fresh environment. Added a step 4 (`pnpm run storage:setup`) to
`README.md`'s Getting Started sequence.

**Also surfaced, a genuinely wider finding**: while correcting
`docs/resources.md`/`docs/upload.md` to match the real, shipped helper
names (`requireMember()` returns a flat `ActingMember | null`, never
`{ member, household }`; `visibilityWhere()` from `@/lib/access/visibility`,
not a `withVisibility()` from `@/lib/household/visibility`; `hasAtLeastRole()`
from `@/lib/access/roles`, not a `requireRole()` helper, which doesn't
exist anywhere in this codebase), the same three fictional names turned up
in `docs/auth.md`, `docs/forms.md`, `docs/module-architecture.md`,
`docs/recipes.md`, `docs/ui-components.md`, and `docs/project-structure.md`
too — evidently all six were written in the same original Phase-0 pass,
before any real module existed, and never reconciled against what actually
got built across Tasks/Kanban/Calendar/Reminders/Notes/Finance/Life Admin.
Correcting `docs/resources.md`/`docs/upload.md` (the two this PR's work
directly followed) was in scope for this change; the other six are a
**known, not-yet-fixed follow-up** — flagging explicitly rather than
leaving it to be silently rediscovered per-file.

### Features / behaviors
- [ ] Household-level default `reminderOffsetsDays` setting that new `Renewal` rows inherit — no schema field for this yet (plan.md §9 Q26); every Renewal defaults to the Prisma column's own `[30]` and is overridable per record
- [x] One `Reminder` generated per `reminderOffsetsDays` entry; changing `expiryDate`/`reminderOffsetsDays`/`responsibleMemberId` **regenerates** the reminders (cancel old ones, create new)
- [x] `status = expired` auto-archives after a ~30-day grace period — a query-level filter (`getVisibleRenewals()`'s default), not a stored flag or scheduled job
- [x] Marking a renewal "renewed" always prompts the member to confirm/enter the new `expiryDate` — never auto-advances silently
- [x] `Contact` form validation requires at least one of phone/email/address/website
- [x] `ShoppingListItem` checking is available to anyone with list access — no view-only tier
- [x] Checking a `ShoppingListItem` never auto-creates a Finance `Transaction` — always a separate, explicit manual step
- [x] `Document` reused as the attachment mechanism by Finance (`Transaction.attachment`) rather than a second upload system — the real relation with `onDelete: SetNull` already exists in the schema; Finance's own transaction form doesn't yet embed `<DocumentUploadDialog>` to attach a receipt inline (not built this pass — Finance's UI shipped before Document existed)

### Events emitted (owning module `life_admin`)
- [x] `contact.created` (called from `createContact`)
- [x] `contact.updated` (called from `updateContact`)
- [x] `renewal.created` (called from `createRenewal`)
- [x] `renewal.renewed` (called from `markRenewalRenewed`)
- [x] `renewal.cancelled` (called from `cancelRenewal`)
- [ ] `renewal.expiring_soon` / `renewal.expired` — plan.md §4.8 names both, but since Renewal's lifecycle status is derived at read time (never stored, never transitioned by a job), there's no discrete moment to emit either from — same accepted gap as Calendar's `event.starting_soon`
- [x] `document.uploaded` (called from `confirmDocumentUpload`)
- [x] `document.linked` (called from `confirmDocumentUpload` when linked at upload time, and from `linkDocument`)
- [x] `shoppingList.item_added` (called from `addShoppingListItem`)
- [x] `shoppingList.item_checked` (called from `toggleShoppingListItemChecked`)
- [x] `shoppingList.item_unchecked` (called from `toggleShoppingListItemChecked`)

---

## 6. Dashboard

Pure query/aggregation layer — **no new entities of its own**. The 8th and
final built-in module — all 8 are now built end-to-end.

Built (PR "Dashboard module vertical slice", 2026-07-26):
`src/modules/dashboard/` — `getTodayView(actingMember, householdTimezone)`
composes four independently-visibility-scoped queries into one common
`DashboardItem` projection (`entities/dashboard-item.ts`: kind, source
module/entity type/id for deep-linking, trigger datetime, deep-link href,
optional member name/badge/overdue flag) — the same shape both the Today
view and cross-entity search return, per plan.md §4.1's "one registry, two
presentations" framing. Two small, additive query extensions to
already-shipped modules made this possible without reaching into their
internals: Tasks' `getVisibleTasks()` gained an optional `dueBefore` filter
(overdue-or-due-by, no lower bound — a task overdue by weeks still
surfaces), and Finance gained a new `getUpcomingSubscriptions(householdId,
lookaheadDays)` query (Subscription has no visibility column, so no
`visibilityWhere()` needed). Calendar's existing `getCalendarRange()` and
Reminders' existing `getActiveReminderOccurrences()` (already explicitly
built "for the Today dashboard," per its own code comment from the
Reminders pass) were reused as-is. A new `src/lib/dates.ts` — referenced by
an earlier docs/project-structure.md draft but never actually built until
now — provides `startOfHouseholdDay`/`endOfHouseholdDay`/
`formatInHouseholdTimezone`/`isTodayInHouseholdTimezone`, all built on
`@date-fns/tz`'s `TZDate` (already a dependency, unused until this pass).

Cross-entity search (`searchEverything()`) reads which modules actually
registered a `global_search_provider` `ModuleSurfaceRegistration` row
(`enabled: true`, owning `Module.status: "active"`) before searching them —
disabling a module (or a 9th module simply never registering) removes it
from search with no Dashboard code change — but dispatch itself is still a
small, explicit per-module branch (Tasks/Notes/Finance Transactions/Life
Admin Contacts), not a fully generic "any entity searchable via config
alone" mechanism; a genuinely new searchable entity means adding both its
registration row and a branch in `search.ts`. Household-scale data — a
plain in-memory `contains` filter over each module's already-visibility-
scoped rows, no dedicated search index.

Quick capture (`src/components/app-shell/quick-capture.tsx` +
`quick-capture-button.tsx`, wired into `src/app/(app)/layout.tsx`, visible
on every page) reads `quick_capture_target` registrations (already seeded
for Tasks/Notes/Reminders since Phase 0) and reuses each module's real,
existing `TaskForm`/`NoteForm`/`ReminderForm` directly — "a direct,
synchronous create against the normal entity using each module's own
defaults... no separate staging/draft entity" (plan.md §4.1), exactly as
specified. This is the one place a component reaches directly into another
module's `components/` folder from outside that module — legitimate
because `src/components/app-shell/` is app-tier, not a module, the same
"app → module component" exception `docs/resources.md` §2.7 already
documents for pages.

- [x] **Success feedback for Quick Capture, found missing during a design-review pass**: closing the dialog was the only signal that a create had succeeded — invisible if you weren't already looking at the relevant module's list (e.g. capturing a task from `/dashboard`). Fixed with `toast.success()` (Sonner) after each of the three forms' `onDone`. **Real gap found while fixing this**: shadcn's `Toaster` component (`src/components/ui/sonner.tsx`) was scaffolded at Phase 0 but never mounted anywhere — calling `toast()` from any component would have silently done nothing until now. Mounted once in the root `src/app/layout.tsx`. Originally scoped narrow (Quick Capture only) — superseded almost immediately: the user tried adding a task through its own `/tasks` page (not Quick Capture) and got no feedback either, which is what prompted the app-wide rollout below. The "~25 other `onDone` call sites already have visible results" reasoning this bullet originally used turned out not to hold up in practice — see §7's "Registration & runtime" for the real, app-wide fix.

Command palette and cross-entity search ended up **unified into one UI**
(`src/components/app-shell/command-palette.tsx`, Cmd/Ctrl+K or a nav
button) rather than plan.md's two separately-bulleted presentations: no
module has ever registered a `command_palette_action` row (only
`global_search_provider` and `quick_capture_target` exist in any module's
`module.ts`), so there was nothing distinct for a dedicated palette to
source beyond search results. Building a parallel, empty registry surface
purely to match the spec's letter would have been scope for its own sake;
if a future module registers real standalone actions (not just "search
for X" or "create a Y"), give the palette a second, genuinely distinct
`command_palette_action` section then.

Five real bugs found via actual browser testing (Playwright, desktop +
mobile) and fixed in the same change:
- **Search/command palette crashed the entire app on open, 100% of the
  time** — `src/components/ui/command.tsx`'s `CommandDialog` (a shadcn-
  scaffolded file) rendered its children directly inside `DialogContent`
  without wrapping them in the `Command` (`cmdk`) root those children need
  for context; `CommandInput`/`CommandList` threw `Cannot read properties
  of undefined (reading 'subscribe')` on mount, with no error boundary
  anywhere in the app to catch it, so the whole page went blank. Fixed by
  wrapping `{children}` in `<Command>`.
- **Search results resolved correctly but never rendered** — cmdk
  memoizes each `CommandItem`'s filter value from its rendered text
  exactly once, before the item's DOM ref is even attached, when no
  explicit `value` prop is given; since this app's `CommandItem` renders
  JSX children (two `<span>`s), not a plain string, that memoization
  locked in an empty value forever, so a real, server-resolved match could
  never pass cmdk's filter and never appeared. Fixed by passing
  `value={item.title}` explicitly.
- **A Finance Subscription due "today" via the form's `new Date()`
  default showed "Overdue" on the Dashboard almost immediately** — Bill's
  overdue check compared `nextDueDate` against the exact current instant
  (`now`) instead of the start of the household's day, unlike Task's own
  (correct) day-boundary check. Fixed to match Task's semantics; Reminder
  deliberately keeps its own instant-based "due" check as-is, since that
  matches Reminders' pre-existing `getOccurrenceStatus()` semantics, not
  an oversight to unify away.
- **Dashboard's Today-list timestamps rendered in the server process's
  own timezone**, not the household's — `TodayList` is a Server Component
  calling `date.toLocaleString()` with no timezone context, off by a full
  calendar day in one reproduction. Fixed via the new
  `formatInHouseholdTimezone()` helper.
- **Login/signup/password-reset still redirected to `/tasks`**
  (`src/app/(auth)/actions.ts`, `src/app/api/auth/callback/route.ts`) —
  leftover `// TODO: /dashboard once that module ships` comments from
  before this module existed; `src/app/page.tsx`'s root-path redirect had
  already been updated to `/dashboard` but these three call sites hadn't.
  Fixed all three, root cause removed (not just one call site).

Two adjacent, pre-existing bugs in already-shipped modules, surfaced by
this same household-timezone-focused testing (not introduced by Dashboard,
but fixed in the same change since the tooling and root-cause
understanding were already in hand): Calendar's `MonthView`/`WeekView`
used date-fns' plain `isToday()` (comparing against the *runtime's* local
time — the server's host timezone on first render, the browser's on
client hydration, neither guaranteed to be `Household.timezone`), causing
a hydration mismatch whenever those disagreed; same root cause in Tasks'
`TaskList` (`new Date(task.dueDate).toLocaleDateString()`). Both fixed via
the same `src/lib/dates.ts` helpers, threading `householdTimezone` down as
a prop. `/calendar`'s own default-to-"today" (no `?date=` param) also now
resolves "today" from `Household.timezone` via a `TZDate`, not the
server's.

Also found and fixed, unrelated to any specific bug: a `"use client"`
component importing a Server Action through a module's barrel (rather than
straight from that action's own file) can break the production build
outright if any sibling barrel export has a heavier transitive dependency
— see `docs/project-structure.md` §7 for the concrete before/after; this
is now a documented, verified convention, not a one-off fix.

Full UI: `TodayList` component; `/dashboard` page (the new root landing
page — `src/app/page.tsx`'s authenticated redirect now points here,
replacing `/tasks`).

### Features / behaviors
- [x] "Today" view: tasks due + today's events + upcoming bills (fixed 7-day lookahead, **not** per-member configurable) + active reminders
- [x] All "today" boundaries computed using `Household.timezone`, never the browser's local timezone
- [x] Quick capture affordance (task / note / reminder) reachable from anywhere in the app
- [x] Cross-entity search reads `ModuleSurfaceRegistration` rows (`surface = global_search_provider`) — adding a 9th module's search provider requires **zero** Dashboard code changes (dispatch is still a small explicit per-module branch in `search.ts`, not fully generic — see narrative above)
- [~] Command palette reads `ModuleSurfaceRegistration` rows (`surface = command_palette_action`) the same way — **unified with search instead**: no module has ever registered a `command_palette_action` row, so palette and search are one presentation, not two, until a module actually registers a standalone action
- [x] Dashboard widgets themselves are registered via `ModuleSurfaceRegistration` (`surface = dashboard_widget`) — one row (`Today`) exists; the page itself isn't yet built as swappable/reorderable widget cards, it's the one Today list

---

## 7. Platform & Extensibility

Architecture-ready in V1, no live installer — a 9th module is added by a
developer/agent through code, not an end-user marketplace flow.

### Entities
- [x] `Module` — key (unique, immutable, e.g. `tasks`, `finance`), name/description, version, kind (`built_in`/`custom`), status (`active`/`disabled`/`error`, platform-wide), dependsOnModules (soft deps, self m2m — verified via query against the seeded data), healthStatus (`ok`/`degraded`/`missing_dependency`, derived), installedAt, registeredBy
- [x] `ModuleEventType` — owningModule, key (dot-namespaced, e.g. `task.completed`), label, payloadSummary, contractVersion (bumped only on breaking changes), relatedEntityType
- [x] `EventSubscription` — subscriberModule, eventType, reactionDescription, active, onFailure (`ignore`/`log_only`/`disable_after_n_failures`), consecutiveFailureCount, lastTriggeredAt/lastError
- [x] `EventOccurrence` — householdId, eventTypeId, emittedByModule, occurredAt, triggeredByMemberId, payloadSnapshot (**`Json`**, not `String` — plan.md's field digest said "string" but docs/module-architecture.md's actual emitEvent() code assigns the payload object directly; Json is the correct column type), subscriptionsNotified
- [x] `ModulePermissionDeclaration` — moduleId, resourceDomain (`tasks`/`kanban`/`calendar`/`reminders`/`notes`/`finance`/`life_admin`/`members_household`/`notifications_email`/`cross_module_events`), accessLevel (`read`/`write`/`read_write`), purpose, isRequired — `@@unique([moduleId, resourceDomain])`
- [x] `ModuleGrant` — householdId, moduleId, permissionDeclarationId, status (`granted`/`revoked`/`pending_review`)
- [x] `ModuleSurfaceRegistration` — moduleId, surface (`dashboard_widget`/`global_search_provider`/`command_palette_action`/`navigation_item`/`quick_capture_target`/`email_notification_category`), label/icon, target, sortOrder, enabled — **not** household-scoped; platform catalog data like `Module`/`ModuleEventType`; `@@unique([moduleId, surface, target])` added (needed for the seed's upsert, not in the original digest)

### Registration & runtime
- [x] `src/modules/<key>/module.ts` for all 8 built-ins (`moduleRegistration`, `eventTypes`, `permissionDeclarations`, `surfaceRegistrations`) — kanban's `eventSubscriptions` now implemented (`onTaskCompleted`, see §2). **All 8 modules now have a `navigation_item` entry** — Finance/Life Admin/Dashboard's were added in the same change each module's real page shipped, closing out the "only 5 of 8" gap this line used to track (docs/module-architecture.md §9.1's added note, and the real-dead-link bug caught earlier via browser test, both still apply as the rule going forward: never register `navigation_item` before the page exists)
- [x] `src/components/app-shell/nav.tsx` — renders `navigation_item` rows live (replaces an earlier hardcoded `NAV_ITEMS` array in `(app)/layout.tsx` that included a `/dashboard` link with no page behind it — same bug class as above)
- [x] **Visual redesign of the sidebar nav** (user-requested, after an honest design review following the font-bug fix): per-module icons — `ModuleSurfaceRegistration.icon` (schema column, previously unused/always-null across all 9 modules) now populated for each `navigation_item` entry, rendered via a small local `Record<string, LucideIcon>` lookup in a new `src/components/app-shell/nav-links.tsx` Client Component (extracted out of `nav.tsx`, which stays an unchanged Server Component doing the same query); active-route highlighting via a generic top-level-path-segment match (`isNavItemActive()`, unit-tested), so a nested route (`/kanban/[boardId]`) or any `/settings/*` sub-page both correctly highlight their parent nav item with zero per-module special-casing; the sidebar `<nav>` in `layout.tsx` now uses the `--sidebar`/`--sidebar-border` design tokens that already existed in `globals.css` (shadcn-init leftovers) but were completely unused until now. **Real seed-script bug found and fixed along the way**: `prisma/seed/platform.ts`'s `ModuleSurfaceRegistration` upsert only named `label`/`sortOrder`/`enabled` in its `update` clause, so any new optional column (like `icon`) would never reach an already-seeded database on re-run — fixed by spreading the whole surface object (`update: { ...surface, enabled: true }`, matching the `create` clause), which also fixes the same bug class for any future optional column, not just this one. Browser-verified (desktop + mobile): icons render, active-highlighting correct on both edge cases, sidebar tint applied, and the pre-existing mobile fade-scroll affordance confirmed untouched and still functioning. Re-seeded production's platform catalog only (never the full household-resetting seed) to push icons live without touching the real household that now exists there.
- [x] **Color palette overhaul + sidebar UX fixes** (user feedback: the stock shadcn "neutral" scaffold — every token in `globals.css` was `oklch(... 0 0)`, literally zero chroma anywhere — read as sterile/generic, "ova osnovna bijela boja mi nije sjela"). `globals.css`'s `:root`/`.dark` blocks rewritten around one accent hue (a muted sage green, ~155° in OKLCH) applied to `--primary`/`--ring`/`--sidebar-primary`/`--sidebar-accent`, plus a warm off-white background/foreground (~75-85° hue, very low chroma) replacing pure white/black — `--destructive` and Finance's income/expense red/green left untouched since those carry semantic meaning. Dark-mode tokens updated in parallel for palette coherence even though currently unreachable in practice (`next-themes`' `useTheme()` is called by `sonner.tsx` but no `<ThemeProvider>` is mounted anywhere and there's no toggle — light mode is the only one a user can actually see today; noted here so it isn't mistaken for "dark mode is live"). Two follow-up fixes in the same pass: **(1)** `src/components/ui/button.tsx`'s shared `buttonVariants` never set `cursor-pointer` (Tailwind/shadcn's base button resets to `cursor: default`, matching the native browser default, not `pointer`) — every button in the app showed an arrow cursor on hover; fixed once, at the shared component, plus `disabled:cursor-not-allowed` alongside the pre-existing `disabled:opacity-50`. **(2)** No UI anywhere showed *who* was logged in — new `src/components/app-shell/user-menu.tsx` (colorTag-tinted initial avatar + displayName + role, title-attribute tooltip) rendered next to "Log out", pinned to the bottom of the desktop sidebar (mobile keeps it inline in the top icon strip instead — no vertical room for a real "bottom" there, so the same `userFooter` JSX fragment in `layout.tsx` is rendered twice, toggled by breakpoint rather than fighting one element's flex-direction across both). **Real bug found while placing it at the bottom**: pinning it via `mt-auto` alone did nothing useful on a long page (e.g. `/settings/modules`) — `<nav>` had no independent height or position, so it scrolled away *with* the page instead of staying put, meaning "bottom of the sidebar" was only reachable by scrolling the entire page down first. Fixed by making the desktop sidebar `sticky top-0 h-screen overflow-y-auto`, so it's pinned to the viewport and scrolls independently of `<main>`. Verified via `pnpm typecheck`/`lint`/`test` (460 passing)/`build`, all clean, plus direct browser screenshots (desktop + mobile) confirming the palette, cursor, avatar/name/role placement, and independent sidebar scroll all render correctly.
- [x] **App-wide success/error toast rollout** (user-requested: "treba implementirati u cijeloj aplikaciji gdje imas upis ili azuriranje necega, kao i brisanje" — every create/update/delete across the whole app, not just Quick Capture, per the note above). Two Explore passes inventoried every mutation entry point (~60 call sites across ~45 files); grouped into five mechanisms rather than one universal wrapper forced onto all of them: **(A)** a `toast.success()` line added to all 15 `*-form.tsx` components' existing `onSubmit` (past-tense "{Entity} created"/"{Entity} updated", or a more specific verb when one exists — e.g. "Subscription paused", never the generic "updated" once a named-state transition exists) — Quick Capture's own three forms now get this for free, so its 3 bespoke `toast.success()` calls were deleted as redundant; **(B)** a new `successMessage?: string` prop on the shared `src/components/confirm-dialog.tsx` (previously untested — `confirm-dialog.test.tsx` added in the same change), wired into 10 call sites across 9 files (renewal cancel, transaction void, settlement/subscription cancel, module-grant revoke, member remove/transfer, etc.) — deliberately omitted on `close-household-section.tsx`, whose `onConfirm` calls `logout()` immediately after; **(C)** a new shared hook, `src/hooks/use-action-feedback.ts` (+ test, first file under `src/hooks/`) — wraps `useTransition`+try/catch+`toast.error()` for ~19 previously-fire-and-forget button actions that had **zero error handling at all** (a thrown error was a silent unhandled rejection before this — checkbox toggles, archive/pause/resume/snooze/dismiss actions), message omitted for rapid-fire toggles (task-complete checkbox, shopping-item check) to avoid toast spam; **(D)** two real, previously-undiscovered bugs fixed by migrating onto `ConfirmDialog`: `board-header.tsx` (archive board) and `event-detail-dialog.tsx` (delete event) both hand-rolled an uncontrolled `<AlertDialog>` with no try/catch of any kind — migrated to the shared component, which also means the archive-board toast now correctly renders on `/kanban` *after* the redirect away from the just-archived board's own page; **(E)** one-line `toast.success()` additions to 5 already-correct bespoke flows (document upload/replace, mark-renewal-renewed, digest settings, accept-invite). **Caught during planning, before implementation**: `changeMemberRole()` and 2 of `reviewModuleGrant()`'s call sites return `ActionResult` (`{success, error}`) rather than throwing — the new hook assumes throw-on-failure, so using it as-is there would have silently swallowed a `{success:false}` response and shown a false-positive success toast; fixed those two call sites by hand instead (one added `else toast.success(...)` line each, alongside their pre-existing `if (!result.success)` branch). `docs/ui-components.md` (new "Success/error feedback" section — the wording convention, and when to use which of the three real mechanisms) and `docs/testing.md` (new "Hook" row in the four-layer testing table) updated in the same change. Verified: `pnpm typecheck`/`lint`/`test` (460 passing, incl. both new test files)/`build` all clean; browser-verified via Playwright against the local stack, one representative site per mechanism (task create + edit, renewal cancel, category archive, silent shopping-item toggle, kanban board archive-then-redirect, document upload) — every toast rendered with the right message and every dialog still closed/navigated exactly as before.
- [x] `src/lib/module-registry/registry.ts` — `ALL_MODULES` barrel
- [x] `prisma/seed/platform.ts` — `seedPlatformCatalog()`, two-pass (scalars first, then `dependsOn` self-relation once every `Module` row exists) — **verified**: `pnpm db:seed` runs clean against the local dev database, all 8 modules + 4 `ModuleEventType`s + correct `dependsOn` graph confirmed via direct query
- [x] `src/lib/events/emit.ts` — `emitEvent()`
- [x] `src/lib/events/dispatch.ts` — `dispatchToSubscribers()`, `onFailure` semantics (`ignore`/`log_only`/`disable_after_n_failures` incl. the disable-after-5 threshold). **Critical bug, caught only by an actual end-to-end browser test (not by typecheck/lint/the unit tests, because `dispatch.test.ts` didn't exist yet either — see the Kanban decision note below):** the function's final `prisma.eventOccurrence.update({ where: { id: occurrence.id } })` call was missing `householdId`, so the tenant guard (`src/lib/db/tenant-guard.ts`) rejected it on *every single* `emitEvent()` call, for *any* event type — meaning `completeTask()` (and anything else that emits an event) has been throwing since the day it was written. Fixed by scoping the `where` to `{ id, householdId: occurrence.householdId }`; `src/lib/events/dispatch.test.ts` now exists and directly regression-tests this
- [x] `src/lib/events/handlers.ts` — the static `eventHandlers` dispatch map — `"kanban:task.completed": onTaskCompleted`
- [x] `src/lib/access/module-grants.ts` — `seedModuleGrantsForHousehold()` (also called from real signup, not just the seed script), `hasModuleGrant()`

### Features / behaviors
- [x] Seed all 8 built-in modules as `Module` rows (`kind = built_in`) — done via `pnpm db:seed`, not yet wired into a deploy/migrate hook
- [x] Seed `ModuleEventType` rows for every real event key across all 8 built-ins plus the `household` pseudo-module (§1) — 28 rows total, verified via direct query after `pnpm db:seed`; includes `renewal.expiring_soon`/`renewal.expired` (newly seeded alongside this phase's `renewals-sweep` job, §8 — previously deliberately unregistered, per life_admin's own `module.ts` comment, because they needed a cron sweep to actually fire) and `household.invite_received`/`share.received` (§1's resolution of the `household`-isn't-a-`Module` gap)
- [x] Built-in modules' `isRequired = true` `ModulePermissionDeclaration` grants are **pre-seeded as `granted`** on household creation — all 8 built-ins work with zero setup (both the seed script and the real `signUpAndCreateHousehold` action call the same `seedModuleGrantsForHousehold()`)
- [x] Custom (non-built-in) modules always land as `ModuleGrant.status = pending_review` — no auto-grant convenience, ever (encoded in `seedModuleGrantsForHousehold`'s condition)
- [x] Household-facing review/revoke screen for `ModuleGrant` (the one end-user-facing part of this system, docs/access-control.md §7.3) — `canManageModuleGrant()` added to `household-permissions.ts` (owner-only for an `isRequired` declaration, admin+ otherwise — asymmetric like `canRemoveMember`/`canChangeMemberRole`, but keyed off the declaration rather than the target member); `reviewModuleGrant()` Server Action (`src/app/(app)/settings/modules/actions.ts`) transitions an existing grant's status (never creates one — `seedModuleGrantsForHousehold()` already guarantees a row per declaration); `settings/modules/{page,module-grant-list,module-grant-row-actions}.tsx` — grants grouped by module, status badge, Approve/Deny when `pending_review`, Revoke (behind a confirm dialog) when `granted`, Re-grant when `revoked`; new "Modules" tab on `settings-nav.tsx`. One real wrinkle hit along the way: `ModuleGrant`'s compound unique key is 3 fields (`householdId_moduleId_permissionDeclarationId`), so `update()`'s top-level `where` doesn't literally contain a `householdId` key — the tenant guard would reject it outright; fixed by pairing the compound key with an explicit top-level `householdId`, the same idiom `updateNotificationPreference()` already established. Browser-verified end-to-end (desktop + mobile, all 3 roles): seeded optional declarations (Finance's `tasks`/write, Notes' `tasks`/read, Dashboard's `notes`/`life_admin` reads) correctly show `pending_review`; approve/revoke/re-grant persist server-side (confirmed via reload + a direct DB query, not just optimistic UI); admin can manage optional grants but not revoke a required one; a plain member sees a fully read-only page with zero action buttons; no mobile clipping.
- [ ] Disabling a built-in module via code leaves its own rows untouched; other modules' optional references to it stop resolving/rendering gracefully, they don't error — not exercised yet (no module has optional cross-module reads built)
- [x] `EventOccurrence` written for every event actually emitted, for audit/reliable delivery
- [x] `EventSubscription.onFailure = disable_after_n_failures` actually flips `active = false` after the Nth `consecutiveFailureCount` (implemented in `dispatchToSubscribers()`; exercised by `src/lib/events/dispatch.test.ts`'s `onFailure`-branch cases now that Kanban's `task.completed` subscription is a real, live subscriber)

---

## 8. Email Notifications

- [x] Resend wired as the real transactional email send path (`src/lib/email/resend-client.ts`'s `sendTransactionalEmail()` — the one function that ever calls the Resend SDK). No simulated/logged sends, ever — every environment makes a real API call; `EMAIL_DEV_REDIRECT_TO` only ever redirects the envelope recipient outside production. **Real bug found and fixed**: the Resend client was originally constructed at module scope (`const resend = new Resend(process.env.RESEND_API_KEY)`), which throws `Missing API key` the instant anything merely *imports* the file — this broke `pnpm build`'s page-data-collection step for every cron Route Handler in an environment with no `RESEND_API_KEY` configured (e.g. this repo's own local dev). Fixed by constructing the client lazily inside `sendTransactionalEmail()` itself, so only actually *calling* it requires a real key.
- [x] `NotificationPreference` (per `categoryKey`: email/inApp/digest) enforced before any send — `getEffectivePreference()` (missing row = "on"), consulted by `fanOutNotificationsForOccurrence()` for both `inAppEnabled` and, now, `emailEnabled` (which actually calls `sendCategoryEmail()`). **Real bug found and fixed**: `NotificationPreference`/`DigestSubscription` were missing `householdId` entirely despite being listed in `tenant-guard.ts`'s enforced set — every real call would have thrown `Refusing NotificationPreference.*: missing householdId`. Migrated (`add_household_id_to_notification_preference_and_digest_subscription`), `getEffectivePreference()`/`updateNotificationPreference()`/`updateDigestSubscription()` all updated to scope by it.
- [x] `DigestSubscription` (daily/weekly rollup) implemented as a distinct, independent control from per-category prefs — `updateDigestSubscription()` (`src/lib/notifications/actions/update-preferences.ts`), `nextDigestRunAt()` (`src/lib/dates.ts`, timezone-aware, mirrors `startOfHouseholdDay()`'s `TZDate` pattern)
- [x] `categoryKey` values kept in lockstep with `ModuleEventType.key` values (shared dot-namespace) — every registered `email_notification_category` `ModuleSurfaceRegistration.target` IS a `categoryKey`/`ModuleEventType.key` value; `getNotificationCategories()` (`src/lib/notifications/queries/get-preferences.ts`) enumerates the registry generically, no hardcoded list
- [x] Scheduled job: sweep due `ReminderOccurrence` rows and send/notify — `src/modules/reminders/jobs/sweep-due-occurrences.ts`, backs `/api/cron/reminders-sweep` (every 15 min). Atomically claims `pending → notified` before any side effect (docs/email.md §9.7); sweeps `notified → missed` after a 24h grace window; delivers email via `sendCategoryEmail()`, gated by both `Reminder.emailEnabled` and the resolved `categoryKey`'s preference (never the Notification-row path — `ReminderOccurrence` itself is the in-app surface, plan.md §4.5)
- [x] Scheduled job: sweep `Subscription.nextDueDate` within `alertDaysBefore` — `src/modules/finance/jobs/sweep-subscription-due-dates.ts`, backs `/api/cron/subscriptions-sweep` (built in an earlier phase, already live)
- [x] Scheduled job: sweep `Budget` usage vs. `alertThresholdPercent` — `src/modules/finance/jobs/sweep-budget-thresholds.ts`, backs `/api/cron/budgets-sweep` (built in an earlier phase, already live)
- [x] Scheduled job: sweep `Renewal.expiryDate` against `reminderOffsetsDays` — `src/modules/life-admin/jobs/sweep-renewal-lifecycle.ts`, backs `/api/cron/renewals-sweep`. Emits `renewal.expiring_soon`/`renewal.expired` as audit-trail-only events, idempotent per lifecycle window (a read-only `EventOccurrence` existence check, not an atomic claim — a duplicate audit row from a rare overlapping invocation is harmless, unlike a duplicate email). Deliberately does **not** create `Reminder`s itself — `regenerateRenewalReminders()` already does that eagerly at Renewal creation/update time; the member-facing alert is delivered by reminders-sweep above, not by this job.
- [x] Scheduled job: `DigestSubscription` send scheduler — `src/lib/notifications/jobs/send-digests.tsx`, backs `/api/cron/digests-send` (hourly). Claims by atomically advancing `nextRunAt` before sending (so a mid-send crash skips one digest rather than duplicating it); rolls up unread `Notification` rows + active `ReminderOccurrence`s, filtered by each category's `digestEnabled`.
- [x] Email templates: `reminder-firing.tsx`, `bill-due-soon.tsx` (the same firing pipeline, nicer copy for `sourceType: "subscription"`), `task-assigned.tsx`, `share-received.tsx`, `household-invite-received.tsx`, `digest.tsx` — all under `src/lib/email/templates/`
- [x] **Resilience, found only by actually trying to exercise the send path with no real `RESEND_API_KEY` configured**: every email-send call site that isn't the sole delivery mechanism for its action now wraps `sendCategoryEmail()`/`sendTransactionalEmail()` in try/catch, logs, and never rethrows — `fanOutNotificationsForOccurrence()`, `deliverFiredOccurrence()` (reminders-sweep), and `sendDueDigests()`'s per-member loop. Without this, a single Resend outage/misconfiguration would have broken *every* task/note/event creation in the entire app (anything that calls `emitEvent()`), or stopped an entire sweep/digest batch after its first failure. The one exception is `inviteMember()`'s invite email — the *only* delivery mechanism for that Invite, so a failed send there rolls back the just-created `Invite` row and surfaces a clear error instead of swallowing it.
- [x] **Real bug found and fixed, adjacent to this phase**: `inviteMember()` (`src/app/(app)/settings/members/actions.ts`) created the `Invite` row but never sent any email — the invitee had no way to ever discover the invite existed. Fixed by calling `sendHouseholdInviteEmail()` directly (bypassing the `NotificationPreference` pipeline entirely, since the invitee has no `Member` row yet to gate against). Also **the entire `app/(auth)/invite/[token]/page.tsx` acceptance page didn't exist** — `acceptInvite()` was fully built and tested but unreachable from a browser. Built the page + `accept-invite-form.tsx` per docs/auth.md §5's spec. Along the way, found and fixed two more real bugs in `acceptInvite()`/`getInviteByToken()`: the token lookup used the tenant-guarded `prisma` with no `householdId` (impossible — the whole point of the lookup is to discover which household the token belongs to; fixed via `prismaAuthBootstrap`, the same bypass `login()` already uses for `Member.supabaseUserId`), and the transaction's `tx.invite.update()` was missing `householdId` in its `where` (fixed once the surrounding householdId was known).
- [x] `seedNotificationPreferencesForMember()` (`src/lib/notifications/actions/seed-preferences.ts`) — mirrors `seedModuleGrantsForHousehold()`'s shape, wired into both `signUpAndCreateHousehold()` (owner) and `acceptInvite()` (everyone else), inside the same transaction as the `Member` row
- [x] **Verified in-browser, desktop and mobile**: signup → owner dashboard, the new "Settings" nav link, `/settings/notifications` (all 7 categories render with working toggles that persist across reload, digest frequency/day/time form incl. the weekly↔daily field-visibility swap), `/settings/members` (owner listed correctly; inviting a member with no `RESEND_API_KEY` configured shows the designed inline error — `Could not send the invite email (Missing API key...). Please try again.` — never a crash, confirming the rollback/error-surfacing design above actually works), and a full regression smoke test across all 8 pre-existing modules (all 200, nothing broken). **Two real, minor mobile-only UX bugs found and fixed**: the horizontally-scrolling main nav (`src/components/app-shell/nav.tsx`) and the notification-preferences table (`notification-preferences-form.tsx`) both clip content off-screen on a phone viewport with **zero visual affordance** that there's more to scroll — a 10th nav item (this phase's new "Settings" link) pushed the nav row wide enough to make this concretely visible, though the notifications table had the identical latent issue independently. Fixed both with a `mask-image` right-edge fade (mobile-only, reset to `none` at `sm:` and up) — CSS-only, no JS, a standard "there's more here" affordance.

```json
// vercel.json — cron entries stubbed in Phase 0, wired to real logic per job above.
// Superseded by .github/workflows/cron.yml during real deployment (Vercel
// Hobby plan rejects any schedule finer than once/day) — see the
// Deployment section below. Kept here only as a historical record of the
// original, Pro-plan-shaped intent; vercel.json itself no longer has a
// `crons` key.
{
  "crons": [
    { "path": "/api/cron/reminders-sweep", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/subscriptions-sweep", "schedule": "0 6 * * *" },
    { "path": "/api/cron/budgets-sweep", "schedule": "0 6 * * *" },
    { "path": "/api/cron/renewals-sweep", "schedule": "0 6 * * *" },
    { "path": "/api/cron/digests-send", "schedule": "0 * * * *" }
  ]
}
```

---

## Tooling decisions (not checklist items — recorded so nobody re-litigates them)

- **Storybook: evaluated, deliberately deferred — not started, not missing.**
  shadcn/ui already ships consistent, self-documenting components copied
  into `src/components/ui/`, so there's no bespoke component library to
  document yet. Revisit only if/when a large custom component library
  emerges beyond shadcn/ui basics — do not add Storybook preemptively.
- **Real-time:** no websockets in V1. Every list/board/calendar view relies
  on refresh/refetch or polling; do not build a websocket layer "just in
  case."

## Known harness gaps (not per-module — cut across the whole doc set)

- **Stale helper names in six docs, not yet fixed.** `docs/resources.md`
  and `docs/upload.md` were corrected during Life Admin's build (§5 above)
  to match the real, shipped helpers: `requireMember()` returns a flat
  `ActingMember | null` (never `{ member, household }`), `visibilityWhere()`
  from `@/lib/access/visibility` (not `withVisibility()` from
  `@/lib/household/visibility`), and `hasAtLeastRole()` from
  `@/lib/access/roles` (there is no `requireRole()` helper anywhere in this
  codebase). The same three fictional names are still present in
  `docs/auth.md`, `docs/forms.md`, `docs/module-architecture.md`,
  `docs/recipes.md`, `docs/ui-components.md`, and `docs/project-structure.md`
  — all six evidently written in the same original Phase-0 pass, before any
  module existed, and never reconciled against reality since. Fix
  opportunistically: correct a doc's stale references the next time a task
  actually touches that doc's subject matter, the same way this pass fixed
  `docs/resources.md`/`docs/upload.md` while building the entity/upload
  flow they cover — don't let it block unrelated work, but don't let it
  silently persist either.
- **The module-boundary `no-restricted-imports` ESLint rule described in
  `docs/project-structure.md` §7 was never actually added to
  `eslint.config.mjs`** — confirmed directly during Dashboard's build.
  Every module built so far (all 8) followed the barrel-only convention by
  discipline, which is exactly why this went unnoticed for that long.
  Implementing it isn't a drop-in copy of the doc's original sketch: a
  blanket `@/modules/*/components/*` block would immediately flag every
  existing page's already-correct direct component import
  (`docs/resources.md` §2.7's documented exception), so it needs real
  per-file `files`/`ignores` glob scoping in ESLint's flat config, not the
  single pattern shown in an earlier draft. `docs/project-structure.md` §7
  now says so explicitly rather than claiming enforcement that isn't
  there.
- **A real, verified gotcha, not just a convention gap**: a `"use client"`
  component must import a Server Action straight from that action's own
  file, never through a barrel that also re-exports a sibling with a
  heavier transitive dependency — confirmed by an actual `pnpm build`
  failure while wiring Dashboard's command palette
  (`src/components/app-shell/command-palette.tsx` importing `search` from
  `@/modules/dashboard` dragged in Life Admin's `getDocumentDownloadUrl` →
  `@/lib/supabase/admin`'s `"server-only"` client, via a sibling barrel
  export it never used). Fixed by importing directly from
  `@/modules/dashboard/actions/search-action` instead. Documented in
  `docs/project-structure.md` §7 with the concrete before/after — worth
  knowing before the next module adds a client-callable Server Action
  next to other barrel exports with deep dependency chains (Documents,
  Storage, anything Supabase-admin-adjacent).
- **`import "server-only"` couldn't be resolved by Vitest at all, for any
  test that imports the real (non-mocked) implementation of a file
  carrying the tag** — not just `tsx` (docs/toolkit.md §1 point 3's
  existing note), Vitest too, since `server-only` isn't a real installed
  package either way. Previously worked around per-test-file by mocking
  away the tagged module entirely, even in files that need to exercise its
  *real* logic. Fixed properly this phase: `vitest.config.ts`'s
  `resolve.alias` now points the bare `server-only` specifier at
  `src/lib/test/server-only-stub.ts` (an empty `export {}`), so a test can
  import the real implementation of e.g. `sync-object-shares.ts` or
  `send-category-email.tsx` directly and only needs to mock its actual
  dependencies (`@/lib/db`, `./resend-client`). Documented in
  `docs/testing.md` §2. The `tsx`-side limitation (`scripts/*.ts`,
  `prisma/seed.ts`) is unchanged — no equivalent alias exists there.
- ~~**`prisma/seed.ts` never actually seeds a household, members, or any
  per-module sample data — only the platform catalog.**~~ **Resolved.**
  Built full-scope this phase, per `docs/seeding.md`'s spec, reconciled
  against reality where the doc's illustrative code had drifted (stale
  field names — `createdById` not `createdBy`, `addedById`/`checkedById`
  not `addedBy`/`checkedBy`; a `TaskRecurrenceRule`-backed "recurring task"
  that would have fabricated a data shape no real Tasks code ever
  reads/writes; the local-Docker-vs-hosted-Supabase assumption in §7.2).
  `prisma/seed/{constants,reset,household,tasks-kanban-calendar,
  reminders-notes,finance,life-admin}.ts` + the real
  `prisma/seed.ts` entrypoint — verified end-to-end: fresh run, idempotent
  re-run, every cross-module link (`NoteLink` → `Task`, subscription-sourced
  `Reminder.sourceEntityId` → `Subscription`), and — with
  `ALLOW_DEV_SEED_AUTH_USERS=true` — a real Supabase Auth login for
  `sam@seed.local` confirmed via a direct `POST /auth/v1/token?grant_type=password`
  call returning a genuine access token, plus a second run confirming the
  same `supabaseUserId` is reused rather than duplicated. One new,
  cross-cutting gotcha discovered building this: `createReminder()`/
  `regenerateRenewalReminders()` can't be reused from the seed script the
  way `seedModuleGrantsForHousehold()`/`seedStarterCategories()` are —
  their module chain transitively imports the email pipeline's
  `"server-only"`-tagged `send-category-email.tsx`, which throws under
  plain `tsx` the same way `docs/toolkit.md` §1 point 3 already documents
  for a different chain. Every seeded `Reminder` is hand-rolled directly
  via `prisma.reminder.create()` instead, documented inline in
  `reminders-notes.ts`/`finance.ts`/`life-admin.ts`.
- **Zero component tests exist anywhere in the codebase**, despite
  `docs/testing.md` §5 / `docs/ui-components.md` §12 stating the convention
  ("Client Components with real logic earn a colocated `.test.tsx`") —
  confirmed by direct count: 71 non-test `.tsx` files under `src/modules/`,
  0 `.test.tsx` files, across all 8 built-in modules. This phase added
  several more such components (`invite-member-dialog.tsx`,
  `member-row-actions.tsx`, `notification-preferences-form.tsx`,
  `digest-settings-form.tsx`) and, for consistency with the actual
  established practice rather than the stated-but-unenforced doc
  convention, did **not** break precedent by being the first to add
  component tests. If component testing is ever prioritized, it needs a
  deliberate decision to backfill across all 71 existing components, not
  quiet inconsistency where only the newest few have coverage.
- ~~**Recurring `Reminder`s never regenerate a second occurrence.**~~
  **Resolved.** `src/modules/reminders/actions/generate-next-occurrence.ts`'s
  `generateNextOccurrenceIfDue()` — computes the next `remindAt` from
  `recurrenceFrequency`/`recurrenceInterval` relative to the just-terminated
  occurrence's own `remindAt`, capped by `recurrenceEndDate`/`recurrenceCount`
  (counting existing `ReminderOccurrence` rows for the cap, since there's no
  stored counter). Called from `completeOccurrence()`/`dismissOccurrence()`
  (dismissed/completed are terminal) and from `sweepDueOccurrences()`'s
  missed-sweep (missed is terminal) — never from `snoozeOccurrence()`,
  which reuses the same row (plan.md §3.3), and never for a `one_off`
  reminder. `recurrenceDaysOfWeek` deliberately still isn't consulted — no
  real UI path (`create-manual-reminder`'s form, `updateReminder()`) ever
  sets it, and no format for it was ever established; same "schema column
  exists, feature was never built" tier as `TaskRecurrenceRule` below.
- ~~**`task.due_soon` has no code path that ever creates such a
  `Reminder`.**~~ **Resolved** — opt-in per task, not automatic for every
  task with a due date (explicit choice: automatic reminders for every
  task risked being noisy/unwanted for low-stakes items, unlike
  Renewal/Subscription's inherently-must-not-forget dates). Task's
  create/edit form (`task-form.tsx`) gained a "Remind me before due date"
  switch, shown only once a due date is set, plus a lead-time value+unit
  pair (reusing `Reminder.leadTimeValue`/`leadTimeUnit`, defaults to 1 day)
  — `regenerateTaskDueReminder()`/`cancelTaskDueReminder()`
  (`src/modules/tasks/actions/regenerate-task-due-reminder.ts`) mirror Life
  Admin's `regenerateRenewalReminders()` cancel-and-recreate shape exactly.
  Wired into `createTask()`, `updateTask()` (always regenerates — dueDate/
  assignee/lead-time may have changed), and `completeTask()` (cancels — no
  point reminding about a done task). `tasks/module.ts` gained
  `dependsOnModules: ["reminders"]` to match a `permissionDeclarations`
  entry that had *already* required it from day one (a separate,
  pre-existing inconsistency this closes) plus a `task.due_soon`
  `email_notification_category` registration. No new `ModuleEventType`
  needed — unlike `bill.due_soon`/`renewal.expiring_soon`, `task.due_soon`
  has no parallel audit-trail sweep job (out of scope for this change,
  deliberately not built — flagged below).
- **Real, previously-undiscovered gap found while building the above: there
  was no "Edit task" UI anywhere.** `updateTask()` was fully built and
  tested, but `TaskForm` was only ever rendered in create mode
  (`new-task-dialog.tsx`, quick capture) — no row-actions, no edit button,
  anywhere in `/tasks`. Fixed alongside the reminder feature (editing a
  task's reminder settings needs an edit path to exist at all):
  `task-row-actions.tsx` (Edit button + dialog, same "list + inline edit
  dialog" pattern as Life Admin's `ContactList`), `getVisibleTasks()` now
  includes `tags`/a task's live `task`-sourced `Reminder` so the edit
  dialog pre-fills correctly.
- **Critical, previously-undiscovered bug found while adding the recurring-
  reminder regeneration hook to the missed-sweep: all 5 Vercel Cron jobs
  were completely broken.** Every sweep job ran one cross-household bulk
  query (`prisma.subscription.findMany({ where: { status: "active" } })`
  and equivalents for `Budget`/`Renewal`/`ReminderOccurrence`/
  `DigestSubscription`) with no `householdId` anywhere in the `where` —
  every one of those five models is tenant-scoped
  (`src/lib/db/tenant-guard.ts`), so the guard rejects the query outright
  the instant it actually runs against the real, guarded Prisma client.
  Confirmed empirically for all five (`Refusing Subscription.findMany:
  missing householdId`, etc.) — never caught before because every job's
  own unit tests mock `@/lib/db` entirely, and no cron route had ever
  actually been invoked against a real database connection in any prior
  phase. Fixed the same way in all five:
  `sweep-due-occurrences.ts`/`sweep-subscription-due-dates.ts`/
  `sweep-budget-thresholds.ts`/`sweep-renewal-lifecycle.ts`/`send-digests.tsx`
  now all fetch active households first (`prisma.household.findMany({
  where: { status: "active" } })` — `Household` itself isn't tenant-scoped,
  it's the tenant root) and loop per household, scoping every inner query
  by that household's id — never a single unscoped batch query across
  every household in the database. Verified the exact fixed query shapes
  succeed against the real tenant-guarded client, across all seeded
  households, where the old unscoped shapes failed.
- **Critical, previously-undiscovered bug found via an actual browser test of
  the new `task.due_soon` feature: `createReminder()` never set any of the
  polymorphic-source convenience FKs.** `prisma/schema.prisma`'s
  `Task.reminders`/`Subscription.reminders`/`Renewal.reminders`/
  `Document.reminders`/`Budget.reminders` relations are all defined through
  a dedicated FK column (`sourceTaskId`/`sourceSubscriptionId`/
  `sourceRenewalId`/`sourceDocumentId`/`sourceBudgetId`), separate from the
  generic `sourceType`+`sourceEntityId` pair — but `createReminder()`
  (`src/modules/reminders/actions/create-reminder.ts`) only ever populated
  the generic pair, for every `Reminder` any module ever created, since the
  function was first written. Symptom: the Task edit dialog's "Remind me
  before due date" toggle never prefilled, because `getVisibleTasks()`'s
  `reminders` include relies on the `sourceTaskId` relation, which was
  always empty regardless of `sourceType` — the generic
  `where: { sourceType, sourceEntityId }` lookup path always worked fine,
  masking the bug everywhere except a relation-based include. A systemic
  bug affecting every module's source-relation include, not just Tasks' new
  feature. Fixed at the root via a new `sourceConvenienceFields(sourceType,
  sourceEntityId)` helper in `create-reminder.ts`, spread into the
  `prisma.reminder.create()` call — covered by a parameterized
  `it.each` test over all 5 `sourceType`→FK pairs plus a "manual sets none"
  case in `create-reminder.test.ts`. The seed scripts' hand-rolled
  `prisma.reminder.create()`/`createMany()` calls (`finance.ts`/
  `life-admin.ts` — can't call `createReminder()` itself, see the
  `tsx`/`server-only` gotcha above) were updated to set the same FKs for
  consistency, verified by direct query against the reseeded database.
- **`task.due_soon` has no parallel audit-trail `ModuleEventType`/sweep job**
  the way `bill.due_soon` (`subscriptions-sweep`) and `renewal.expiring_soon`
  (`renewals-sweep`) do — those two also emit a separate `EventOccurrence`
  for observability/future-automation when their alert window is crossed,
  raised by a daily sweep, independent of the `Reminder` itself (which is
  created eagerly at source-entity creation/update time). Building a
  `tasks-due-soon-sweep` 6th cron job to do the same for tasks was
  considered out of scope for this change — the actual member-facing
  reminder already works end-to-end without it (delivered by the existing
  `reminders-sweep`, same as every other `Reminder`); the missing piece is
  purely the audit-trail event, a nice-to-have observability layer, not a
  functional gap.

---

## V2 (out of scope for now — do not build ahead of schedule)

Listed here so nobody accidentally implements these while touching an
adjacent V1 feature. Moving any of these into V1 requires editing `plan.md`
first (see "How to keep this file honest" above).

**Household & Sharing**
- `CustomRole` (fixed 3-role enum only in V1)
- `UserAccount` (global multi-household identity — one account per household only in V1)
- Public/self-serve household join links (V1 invites are always named-email, token-based only)
- Any admin/owner override of `private` visibility (private truly means private, no built-in override, ever)

**Tasks, Kanban & Calendar**
- `EventRecurrenceRule` (events are one-off only in V1)
- `TaskAssignment` (multi-assignee — single `assigneeId` only in V1)
- `EventAttendee`

**Reminders & Notes**
- `ReminderRecipient` (multi-recipient — single `targetMemberId` only in V1)

**Finance**
- `PaymentAccount`
- `ExchangeRate` (multi-currency — single `baseCurrency`, no conversion, in V1)
- Itemized/line-level splitting (only transaction-level splits in V1)
- Bank import (`Transaction.source = imported` is reserved, not implemented)
- Budget rollover (`Budget.rolloverUnused` is reserved, always `false` in V1)

**Life Admin**
- `DocumentVersion`
- `RenewalHistory`
- `ShoppingListTemplate`

**Platform & Extensibility**
- `AutomationRule` and any user-facing "when this, then that" rule-builder
  UI — genuinely planned for a later release, not just illustrative. V1
  ships only the underlying event bus (`Module`/`ModuleEventType`/
  `EventSubscription`/`EventOccurrence`) that such a builder would consume.
- Live plugin installer / end-user marketplace UI to install or remove
  modules at runtime

**Platform-wide**
- No real-time websocket sync (refresh/refetch/polling only)
- No multi-currency
- No multi-household login
- Single assignee/target everywhere a "who does this apply to" field exists
