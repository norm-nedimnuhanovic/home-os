# Verify — What "Done" Means

This is the exact checklist every change — a new module, a bug fix, a docs
edit — must pass before it's reported as finished. `CLAUDE.md`'s
"Before You're Done" section is a summary of this file; this file is the
source of truth.

Don't skip a step because it "should" pass. Run it. If a step fails for a
reason unrelated to your change, say so explicitly instead of silently
reporting success.

## 1. The standard sequence

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run them in this order — each catches a cheaper class of mistake than the
next, so a broken build never has to wait behind a slow `pnpm build` to
surface a typo `pnpm lint` would have caught in seconds:

| Command | Runs | Catches |
|---|---|---|
| `pnpm lint` | ESLint across `src/`, `prisma/`, `scripts/` | The `no-restricted-imports` module-boundary rule (`docs/project-structure.md` §5 — one module reaching into another's internals instead of its `index.ts` barrel or an event), unused vars, import-order |
| `pnpm typecheck` | `tsc --noEmit` | Type errors, including any drift between `prisma/schema.prisma` and code that hasn't run `pnpm prisma generate` since the last schema edit |
| `pnpm test` | Vitest — every `*.test.ts` colocated with the code it tests (`docs/testing.md` §1–2) | Broken business logic, validation, and server-action authorization — unit + integration in one run |
| `pnpm build` | `next build` | Anything only a production build catches: server/client component boundary violations, edge-runtime incompatibilities, unresolved dynamic imports |

All four must exit 0. `pnpm test` and `pnpm build` both need a reachable
Postgres database (Supabase local or your dev project) with migrations
applied — see §2 if you touched `prisma/schema.prisma`, or `pnpm db:migrate`
with no pending changes otherwise.

## 2. If `prisma/schema.prisma` changed

Also run, before the sequence in §1 (the standard sequence's `pnpm
typecheck`/`test`/`build` all assume the Prisma Client already matches the
schema):

```bash
pnpm prisma format
pnpm prisma validate
pnpm prisma migrate dev --name <descriptive_name>
```

Per `docs/orm-conventions.md` §7.1, `migrate dev` both creates the migration
SQL under `prisma/migrations/` and regenerates the Prisma Client, so this
step has to come first — `pnpm typecheck`/`test`/`build` will fail with
stale-client type errors otherwise, not schema errors, which is a confusing
way to discover you forgot this step. Never hand-write a migration's SQL
after the fact and never run `prisma db push` outside a throwaway local
experiment — `migrate dev` is the only path that produces a committed,
reviewable migration file (`docs/orm-conventions.md` §5).

## 3. If you added or changed a `ModuleEventType`, `EventSubscription`, or `ModulePermissionDeclaration`

Re-run the platform-catalog seed so local/dev state matches the manifest
change — a stale `Module`/`ModuleEventType` row is a common source of a
`pnpm test` failure that looks unrelated to your change:

```bash
pnpm db:seed
```

`docs/seeding.md` §5.3's upsert is idempotent, so this is always safe to
re-run.

## 4. E2E (only when a change genuinely crosses modules)

```bash
pnpm test:e2e
```

Not part of the standard §1 sequence — Playwright needs a running dev/build
server plus a real seeded database (`docs/testing.md` §5), so it's slower
and is reserved for the cross-module flows §1's `pnpm test` can't exercise
(e.g. completing a `Task` from the plain list correctly moving its Kanban
card — `docs/seeding.md` §5.4). A same-module change doesn't need this step;
`pnpm test`'s integration tier already covers it.

## 5. CI

The same four §1 commands, plus `prisma migrate deploy` (not `migrate dev`
— CI applies already-committed migrations, it never generates new ones)
before `pnpm build`, in this order:

```bash
pnpm install --frozen-lockfile
pnpm prisma migrate deploy
pnpm prisma generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`postinstall` (`docs/orm-conventions.md` §7.1's `package.json` excerpt)
already runs `prisma generate` after `pnpm install`, so the explicit
`prisma generate` line here is only for the case where `migrate deploy`
altered the schema state after `postinstall` already ran once.

## 6. What "done" does not mean

Passing this checklist means the change is mechanically sound — it does not
substitute for the things it can't check: that you actually re-read
`plan.md` for the entity/decision you touched, that a new module followed
every step of `AGENTS.md` §2's registration checklist (a missing
`ModuleSurfaceRegistration` row won't fail a build, it'll just make the
module invisible in Dashboard/Search/Nav), or that a Server Action has both
a happy-path and a rejected/unauthorized-path test as `CLAUDE.md` rule 4
requires — `pnpm test` passing with zero tests for a new action is not the
same as `pnpm test` passing because the right tests exist.
