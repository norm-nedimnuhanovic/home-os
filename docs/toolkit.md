# Toolkit — Internal Helper Scripts

This doc covers the handful of scripts that exist to make building Home OS
faster — seeding a fresh household, scaffolding a new module's folder
skeleton — as opposed to product code itself. Nothing under `scripts/` (or
`prisma/seed*`) is imported by `src/app/`, `src/modules/`, or `src/lib/`; the
dependency arrow only ever points from "developer/agent runs a command" to
"repo state changes," never the other way.

This doc doesn't re-specify what already has its own doc — it's the index
and the `package.json`/`scripts/` wiring that ties them together:

- **[docs/seeding.md](./seeding.md)** owns the seed script itself
  (`prisma/seed.ts` + `prisma/seed/*.ts`) in full — every entity it seeds,
  the two idempotency strategies, the `ALLOW_DEV_SEED_AUTH_USERS` flag,
  troubleshooting. §3 below is a thin pointer to it, not a duplicate.
- **[AGENTS.md](../AGENTS.md) §2** and **[docs/project-structure.md](./project-structure.md)
  §3, §9** own the shape a module folder must have and the full 9th-module
  registration checklist. §4 below only covers the one mechanical step that
  checklist doesn't script for you yet: creating the folder skeleton.
- **[docs/module-architecture.md](./module-architecture.md)** owns what
  `ModuleManifest`'s fields (`eventTypes`, `permissionDeclarations`,
  `surfaceRegistrations`) actually mean.
- **[docs/orm-conventions.md](./orm-conventions.md) §7.1** owns the
  `package.json` `"prisma"."seed"` wiring and the `db:*` script names §2
  below assembles into one place.

If a task needs a script this doc doesn't cover, write it following §5's
"what doesn't belong here" boundary before adding it to `scripts/`.

---

## 1. Where scripts live

| Lives at | Invoked via | Owned by |
|---|---|---|
| `prisma/seed.ts`, `prisma/seed/*.ts` | `pnpm prisma db seed` (Prisma's own CLI hook — see §3) | `docs/seeding.md` |
| `scripts/scaffold-module.mjs` | `pnpm run scaffold:module -- <module-key>` | this doc, §4 |
| `scripts/*.mjs` (future additions) | a `package.json` `"scripts"` entry, same pattern | whichever doc introduces it |

Two rules, both already implicit in how `docs/seeding.md` and
`docs/project-structure.md` reference these paths, made explicit here:

1. **The seed script is not under `scripts/`.** Prisma's own CLI (`prisma db
   seed`, and `prisma migrate dev`/`migrate reset`, which auto-run it) looks
   for the seed entrypoint at whatever path `package.json`'s `"prisma":
   {"seed": ...}` field names — by convention, and per `docs/seeding.md` §1,
   that's `prisma/seed.ts`, run via `tsx`. Moving it into `scripts/` would
   just mean re-pointing that same config field; there's no benefit, so
   don't move it.
2. **Everything else dev-ergonomics-only goes under `scripts/`,** plain
   Node (`.mjs`, no build step, no `tsx` needed unless it imports something
   `@prisma/client`-typed), and gets exactly one `package.json` `"scripts"`
   entry so it's discoverable via `pnpm run` with no arguments (pnpm prints
   every script name). A script nobody can find by running `pnpm run` with
   no args might as well not exist.
3. **A `scripts/*.ts` file run via `tsx` can't import anything tagged
   `import "server-only"`** (`src/lib/supabase/admin.ts`,
   `src/lib/storage/paths.ts`, `src/lib/household/actions/sync-object-shares.ts`,
   and any future file that carries the same tag). That package resolves
   fine inside Next.js's own build (its bundler special-cases the bare
   `"server-only"`/`"client-only"` specifiers) but genuinely doesn't exist
   in `node_modules` — `tsx`, running outside Next's bundler entirely,
   throws `Cannot find module 'server-only'` the moment it (even
   transitively) reaches one. `scripts/setup-storage-bucket.ts` hit exactly
   this: it needs a Supabase admin client, but can't import
   `@/lib/supabase/admin.ts` for it, so it constructs its own few-line
   client inline instead of reaching into app code that carries the tag.
   Same applies to `prisma/seed.ts`/`prisma/seed/*.ts` — which is also why
   they already use `../../src/lib/db` (no `"server-only"` in that file's
   chain) rather than anything storage/supabase-admin-adjacent.

---

## 2. `package.json` — the scripts block

Every command referenced across `README.md`, `AGENTS.md`,
`docs/project-structure.md`, and `docs/orm-conventions.md` resolves to one
of these entries — this is the one place they're all assembled together:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "postinstall": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "prisma db seed",
    "db:reset": "prisma migrate reset",
    "db:studio": "prisma studio",
    "scaffold:module": "node scripts/scaffold-module.mjs"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

`db:migrate`/`db:deploy`/`db:seed`/`db:studio` are exactly
`docs/orm-conventions.md` §7.1's block, reused verbatim rather than
re-invented; `db:reset` is the same convenience wrapper for the
`pnpm prisma migrate reset` command `docs/seeding.md` §4 already documents
as the "drop the local DB, reapply every migration, reseed" loop.
`scaffold:module` is new — it's the piece `AGENTS.md` §2 and
`docs/project-structure.md` §9 already show being *invoked*
(`pnpm run scaffold:module -- meal-planning`) without ever defining what
backs it. That's this doc's job, §4 below.

The `--` in `pnpm run scaffold:module -- meal-planning` isn't optional
decoration: without it, pnpm tries to interpret `meal-planning` as one of
its own flags before forwarding anything to the script. Every script that
takes a CLI argument in this repo is invoked the same way.

---

## 3. Seeding a fresh household

Full ownership: **`docs/seeding.md`**. This section only wires it into the
commands above — don't duplicate the seed logic itself here if this doc is
ever extended.

| Command | What it does |
|---|---|
| `pnpm db:seed` | Runs `prisma/seed.ts` directly against whatever DB `DATABASE_URL`/`DIRECT_URL` point at. Safe to re-run — platform-catalog rows are upserted by natural key, the seeded household's own data is deleted-then-recreated (`docs/seeding.md` §3). |
| `pnpm db:migrate` | Applies pending migrations, **then auto-runs the seed** (every invocation, not just the first — pass `--skip-seed` to suppress it for one run). |
| `pnpm db:reset` | Drops the local DB, reapplies every migration, then auto-runs the seed — the fastest "start completely over" loop. |
| `pnpm db:studio` | Opens Prisma Studio to inspect what got seeded (`docs/seeding.md` §12). |

What you get after `pnpm db:seed`: one household ("The Rivera Household"),
three `Member`s across all three roles, every built-in module's platform
catalog rows, and connected sample data across all 8 modules — see
`docs/seeding.md` §11 for the exact row counts. Local login as one of the
seeded members requires `ALLOW_DEV_SEED_AUTH_USERS=true` in `.env`
(`docs/seeding.md` §7 for why that's opt-in, not automatic).

**Extending the seed for a new module** is `docs/seeding.md` §13, and is
also step 5 of §4's scaffold checklist below — the two scripts in this doc
are meant to compose: scaffolding a module and giving it demo data both
funnel through the one `prisma/seed.ts` entrypoint, never a second seeding
mechanism invented per module.

---

## 4. Scaffolding a new module's boilerplate — `scripts/scaffold-module.mjs`

### 4.1 Usage

```bash
pnpm run scaffold:module -- meal-planning
```

The argument is the module's folder key, kebab-case, matching the Next.js
route segment (`docs/project-structure.md` §5's "folder name vs.
`Module.key`" distinction) — the script derives the snake_case
`Module.key` (`meal_planning`) from it automatically.

### 4.2 What it creates

Exactly the shape every module in `src/modules/` already follows
(`docs/project-structure.md` §3) — nothing custom per module:

```
src/modules/meal-planning/
├── entities/.gitkeep
├── actions/.gitkeep
├── queries/.gitkeep
├── components/.gitkeep
├── events/.gitkeep
├── jobs/.gitkeep
├── module.ts        # stub ModuleManifest — key/name/version filled in, everything else TODO
└── index.ts          # empty public barrel
```

Delete whichever `.gitkeep`-only subfolders end up unused (e.g. `jobs/` if
the module never backs a cron sweep) — `docs/project-structure.md` §3 is
explicit that "not every module needs every subfolder," this script just
doesn't try to guess which ones in advance.

### 4.3 What it deliberately does *not* do

- **Never touches `prisma/schema.prisma`.** Adding a Prisma model means
  deciding relations, `householdId` denormalization, enum values, and
  `ownerField`/`moduleKey` visibility wiring — every one of those is a
  judgment call `docs/orm-conventions.md` §9's checklist walks through by
  hand. A script that guesses at this would either generate something wrong
  silently or add nothing useful; better to print the reminder (step 1 of
  §4.5) and stop.
- **Never touches `src/lib/module-registry/registry.ts`.** Per
  `docs/project-structure.md` §9 step 4, registering a new manifest is *"the
  only files outside the module's own folder that get touched"* — kept to
  one import + one array entry specifically so it shows up as an obvious,
  reviewable one-line diff. Auto-editing a shared file from a scaffold
  script risks mangling an unrelated part of it; printing the exact snippet
  to paste (§4.5 step 3) keeps the same reviewability without the risk.
- **Never runs `prisma migrate dev` or `pnpm db:seed` for you.** Both are
  cheap to run by hand once you've actually added something worth
  migrating/seeding — running them automatically against an empty stub
  would just create a no-op migration and a no-op catalog upsert.
- **Refuses to overwrite an existing module folder.** Re-running the
  command against a module key that's already scaffolded exits with an
  error rather than clobbering work in progress.

### 4.4 The script

```js
#!/usr/bin/env node
// scripts/scaffold-module.mjs
//
// Scaffolds the folder skeleton + module.ts + index.ts stub for a new
// platform module, per docs/project-structure.md §3 (folder shape) and §9
// (registration checklist). Never touches prisma/schema.prisma or
// src/lib/module-registry/registry.ts — see docs/toolkit.md §4.3 for why;
// those stay deliberate, reviewed edits, printed as a checklist below.
//
// Usage:
//   pnpm run scaffold:module -- <module-key>
// Example:
//   pnpm run scaffold:module -- meal-planning

import { mkdir, writeFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import process from "node:process";

const SUBFOLDERS = ["entities", "actions", "queries", "components", "events", "jobs"];

function toPascalCase(kebab) {
  return kebab.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

function toCamelCase(kebab) {
  const [first, ...rest] = kebab.split("-");
  return first + rest.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
}

async function pathExists(p) {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function moduleTsTemplate({ moduleKey, folderKey, displayName, manifestConst }) {
  return `// src/modules/${folderKey}/module.ts
import type { ModuleManifest } from "@/lib/module-registry/types";

// TODO(scaffold): fill in description, dependsOnModules, eventTypes,
// permissionDeclarations, surfaceRegistrations. See:
//   - docs/module-architecture.md §3-9 (what each field means)
//   - AGENTS.md §2 steps 3-7 (a full worked example, "meal_planning")
export const ${manifestConst}: ModuleManifest = {
  key: "${moduleKey}",
  name: "${displayName}",
  description: "TODO: one sentence describing what this module does.",
  version: "1.0.0",
  kind: "custom", // 9th+ modules are always "custom", never "built_in"
  status: "active",
  dependsOnModules: [], // e.g. ["reminders", "life_admin"] — soft deps only

  eventTypes: [
    // { key: "${moduleKey}.example_happened", label: "...", payloadSummary: "{ ... }", contractVersion: 1 },
  ],

  permissionDeclarations: [
    // { resourceDomain: "reminders", accessLevel: "write", purpose: "...", isRequired: true },
  ],

  surfaceRegistrations: [
    // { surface: "navigation_item", label: "${displayName}", target: "/${folderKey}", sortOrder: 90, enabled: true },
  ],
};
`;
}

function indexTsTemplate({ displayName }) {
  return `// index.ts — the ONLY import path other modules use to reach ${displayName}.
// Export queries/actions/types here as you build them, e.g.:
//
//   export { getSomething } from "./queries/get-something";
//   export { createSomething } from "./actions/create-something";
//   export type { CreateSomethingInput } from "./entities/something";
//
// Never let another module import from entities/actions/queries/events/jobs/
// components directly — see docs/project-structure.md §7.
export {};
`;
}

function printChecklist({ folderKey, moduleKey, manifestConst }) {
  console.log(`
Next steps (none of these are automated — each is a deliberate, reviewed edit):

  1. Add any genuinely new Prisma models under a new banner section at the
     bottom of prisma/schema.prisma (check the reuse table in AGENTS.md §2
     Step 0 first — most new modules need zero new models). Then:
       pnpm db:migrate --name add_${moduleKey}

  2. Fill in src/modules/${folderKey}/module.ts's eventTypes /
     permissionDeclarations / surfaceRegistrations
     (docs/module-architecture.md §4, §8, §9).

  3. Register it — the only shared file this touches:

       // src/lib/module-registry/registry.ts
       import { ${manifestConst} } from "@/modules/${folderKey}/module";

       export const moduleManifests = [
         // ...existing manifests...
         ${manifestConst},
       ];

  4. Upsert its catalog rows:
       pnpm db:seed

  5. If it owns genuinely new entities worth demoing, add
     prisma/seed/${folderKey}.ts and wire it into prisma/seed.ts
     (docs/seeding.md §13) — skip this if it only reuses existing entities
     (Reminder, Document, ShoppingListItem, ...).

  6. Implement entities/, actions/, queries/, components/ with colocated
     tests, following docs/resources.md's worked Contact example end to end.

  7. Run the full checklist before calling it done:
       pnpm lint && pnpm typecheck && pnpm test && pnpm build
`);
}

async function main() {
  const rawKey = process.argv[2];

  if (!rawKey) {
    console.error("Usage: pnpm run scaffold:module -- <module-key>  (kebab-case, e.g. meal-planning)");
    process.exit(1);
  }

  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(rawKey)) {
    console.error(`"${rawKey}" isn't kebab-case. Use lowercase words separated by hyphens, e.g. meal-planning.`);
    process.exit(1);
  }

  const folderKey = rawKey;                          // kebab-case — matches the Next.js route segment
  const moduleKey = rawKey.replace(/-/g, "_");        // snake_case — the Module.key value
  const displayName = toPascalCase(rawKey);           // "Meal Planning"
  const manifestConst = `${toCamelCase(rawKey)}Manifest`; // "mealPlanningManifest"

  const moduleDir = path.join("src", "modules", folderKey);

  if (await pathExists(moduleDir)) {
    console.error(`${moduleDir} already exists — refusing to overwrite. Remove it first if you really want to re-scaffold.`);
    process.exit(1);
  }

  for (const sub of SUBFOLDERS) {
    const dir = path.join(moduleDir, sub);
    await mkdir(dir, { recursive: true });
    // Empty dirs aren't tracked by git — .gitkeep so entities/, jobs/, etc.
    // show up in the diff even before the first real file lands in them.
    await writeFile(path.join(dir, ".gitkeep"), "");
  }

  await writeFile(
    path.join(moduleDir, "module.ts"),
    moduleTsTemplate({ moduleKey, folderKey, displayName, manifestConst }),
  );
  await writeFile(path.join(moduleDir, "index.ts"), indexTsTemplate({ displayName }));

  console.log(`\nScaffolded src/modules/${folderKey}/`);
  printChecklist({ folderKey, moduleKey, manifestConst });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

### 4.5 Sample run

```
$ pnpm run scaffold:module -- meal-planning

Scaffolded src/modules/meal-planning/

Next steps (none of these are automated — each is a deliberate, reviewed edit):

  1. Add any genuinely new Prisma models under a new banner section at the
     bottom of prisma/schema.prisma (check the reuse table in AGENTS.md §2
     Step 0 first — most new modules need zero new models). Then:
       pnpm db:migrate --name add_meal_planning

  2. Fill in src/modules/meal-planning/module.ts's eventTypes /
     permissionDeclarations / surfaceRegistrations
     (docs/module-architecture.md §4, §8, §9).

  3. Register it — the only shared file this touches:

       // src/lib/module-registry/registry.ts
       import { mealPlanningManifest } from "@/modules/meal-planning/module";

       export const moduleManifests = [
         // ...existing manifests...
         mealPlanningManifest,
       ];

  4. Upsert its catalog rows:
       pnpm db:seed

  5. If it owns genuinely new entities worth demoing, add
     prisma/seed/meal-planning.ts and wire it into prisma/seed.ts
     (docs/seeding.md §13) — skip this if it only reuses existing entities
     (Reminder, Document, ShoppingListItem, ...).

  6. Implement entities/, actions/, queries/, components/ with colocated
     tests, following docs/resources.md's worked Contact example end to end.

  7. Run the full checklist before calling it done:
       pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Running the same command again (`pnpm run scaffold:module -- meal-planning`)
without deleting `src/modules/meal-planning/` first exits with:

```
src/modules/meal-planning already exists — refusing to overwrite. Remove it first if you really want to re-scaffold.
```

---

## 5. What doesn't belong under `scripts/`

- **A second seeding mechanism.** Demo/fixture data for a new module is
  `prisma/seed/<key>.ts`, wired into the one `prisma/seed.ts` entrypoint
  (§3, `docs/seeding.md` §13) — never a standalone `scripts/seed-*.mjs` that
  bypasses the reset/idempotency rules `docs/seeding.md` §3 already solved
  once for everyone.
- **A Prisma-schema generator.** §4.3 explains why the scaffold script stops
  short of touching `prisma/schema.prisma` — the same reasoning rules out a
  hypothetical `scripts/add-model.mjs` too. Schema changes are always a
  hand-edit reviewed against `docs/orm-conventions.md`.
- **A shell wrapper around the lint/typecheck/test/build checklist.** That
  sequence is already four separate, individually useful `package.json`
  scripts (§2) plus whatever `docs/verify.md` adds on top for a given
  change; collapsing it into one opaque `scripts/verify.sh` would hide
  *which* step failed from CI output for no real benefit.
- **Anything that mutates a real (non-seed) household's data.** Every
  script in this doc either only touches platform-catalog rows (safe to
  upsert anywhere) or the one fixed, hardcoded `SEED_HOUSEHOLD_ID`
  (`docs/seeding.md` §3) — never a script parameterized to "pick any
  household and do X to it." That kind of one-off data fix is a `psql`/
  Prisma Studio session, not a committed script.

---

## 6. Quick reference

```bash
# seed a fresh local database (see §3 / docs/seeding.md)
pnpm db:migrate         # applies migrations, then auto-seeds
pnpm db:seed            # re-run the seed only (safe, idempotent)
pnpm db:reset           # drop + recreate + reseed — the "start over" button
pnpm db:studio          # browse what got seeded

# scaffold a new module's folder skeleton (see §4)
pnpm run scaffold:module -- <module-key>   # kebab-case, e.g. meal-planning

# before calling any change done (CLAUDE.md / docs/verify.md)
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
