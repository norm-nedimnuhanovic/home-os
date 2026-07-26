# Registering a New Resource (Entity)

This doc is the step-by-step convention for taking one entity from
`plan.md` — a Prisma model plus its reads, writes, UI, and tests — from
zero to a working, tested feature. It is the doc to open when a task says
"build Contacts" or "implement `Renewal`," not when a task says "add a 9th
module": for that, use `AGENTS.md` §2 / `docs/project-structure.md` §9
instead, which cover scaffolding a whole new `Module` row, manifest, and
registry entry. Adding one entity to a module that already exists is this
doc's job.

**Worked example:** `Contact`, from Life Admin (`plan.md` §3.5). Chosen
because it carries the full `visibility`/`ObjectShare` contract and has one
genuinely interesting wrinkle — plan.md §9 Q30 says *anyone with access can
edit it*, not just its creator — that a copy-pasted Task-shaped action would
get wrong. Every code sample below is the **real, shipped file** for this
entity (`src/modules/life-admin/`, PR "Life Admin module vertical slice");
when you build the next entity, copy the shape and swap the names.

---

## 0. Naming this doc uses, and why

An earlier draft of this doc used illustrative names that turned out not to
match what actually got built (`withVisibility()`, a `{ member, household }`
destructure off `requireMember()`, a `requireRole()` helper). None of those
exist. Per `CLAUDE.md` rule 5, this doc is corrected to the real, shipped
names — the ones every module (Tasks, Kanban, Calendar, Reminders, Notes,
Finance, Life Admin) actually uses:

| Concept | Real name | File |
|---|---|---|
| Acting-member resolver | `requireMember()` — returns `ActingMember \| null`, **does not** redirect or destructure into `{ member, household }` | `@/lib/auth/session` |
| Role check | `hasAtLeastRole(role, minimumRole): boolean` — a plain predicate, thrown manually as `ForbiddenError` where needed | `@/lib/access/roles` |
| Visibility query-scoping helper | `visibilityWhere(actingMember, scope)` — takes the whole acting member (or a `Pick<..., "id" \| "householdId">`), not separate `householdId`/`memberId` args | `@/lib/access/visibility` |
| Prisma client | `prisma` | `@/lib/db` |
| Sharing/visibility/role doc | `docs/access-control.md` | — |
| Generic `ObjectShare` sync helper | `syncObjectShares(params)` — one platform-level function every module imports, never copy-pasted per entity | `@/lib/household/actions/sync-object-shares` |

Every page/action in Home OS resolves the acting member the same way:

```ts
const member = await requireMember();
if (!member) redirect("/login"); // Server Component page
// or, in a Server Action:
if (!member) throw new Error("Not authenticated");
```

`member` itself carries `householdId` directly (`member.householdId`) —
there is no separate `household` object to destructure.

**One-file Prisma schema, not multi-file.** `docs/project-structure.md` §5
is explicit and deliberate: *"This repo does not use Prisma's multi-file
schema (`prismaSchemaFolder`) — a single file keeps every relation trivially
visible in one place."* `Contact` is a block in the single
`prisma/schema.prisma`, not a new `prisma/schema/life-admin.prisma` file. In
practice every entity's Prisma model across all 8 built-in modules was
already scaffolded into `prisma/schema.prisma` in Phase 0 — adding a new
entity to an *existing* module is usually writing code against a model
that's already there, not adding schema.

---

## 1. The layers, and what "service/data-access layer" means here

Home OS doesn't have a separate repository/service-class tier — Prisma
queries are called directly from two thin layers, split by read vs. write:

| Generic term | This repo's folder | What lives there |
|---|---|---|
| Prisma model | `prisma/schema.prisma` | The table, its enums, its relations — one banner section per module |
| Service / data-access layer | `src/modules/<key>/queries/` | Read-only functions Server Components (and other modules' barrels) call. Always take the acting member (or `householdId`) explicitly, never infer it. |
| Mutations | `src/modules/<key>/actions/` | Server Actions (`"use server"`) — the only way UI triggers a write. One file per action. |
| Input schemas / pure logic | `src/modules/<key>/entities/` | `zod` schemas and small pure functions derived from the model (e.g. `getTaskStatus()`); **not** the Prisma model itself |
| Cross-module signals | `src/modules/<key>/events/emitters.ts` | Wraps `emitEvent()` for this module's `ModuleEventType` keys |
| UI — list | `src/app/(app)/<route>/page.tsx` | Thin: resolve the member, call one query, render one component |
| UI — presentation | `src/modules/<key>/components/` | The actual list/card/form components, composed from `src/components/ui/` (shadcn/ui) |
| Tests | Colocated `*.test.ts(x)` next to the file under test | Per `CLAUDE.md` rule 4: every Server Action ships with a happy-path test and a rejected-path test, in the same commit |

Read that table top-to-bottom and you have the exact order this doc builds
`Contact` in below.

---

## 2. Worked example: `Contact` in Life Admin

### 2.0 What we're building

From `plan.md` §3.5, `Contact` is:

> An important household contact kept for quick reference and linkable from
> other Life Admin records.

Fields: `household`, `name`, `category` (enum, default `other`),
`phone`/`email`/`address`/`website` (at least one required), `notes`,
`isPinned` (default `false`), `visibility` (default `household`),
`createdBy`, `createdAt`/`updatedAt`.

Two decisions from `plan.md` §9 shape the authorization code below:

- **Q30**: *"Within a shared ShoppingList or Contact, can every member with
  access also edit/check off items? → Decision: anyone with access can
  edit/check off. No separate view-only tier in V1."* — editing a `Contact`
  is a **visibility** check, not an **ownership** check. This is the
  opposite of `Task` (`docs/access-control.md` §4.3: only the creator or the
  assignee may edit). Don't copy Task's action shape onto Contact.
- Deletion isn't addressed by Q30 at all (Q30 says "edit/check off," not
  "delete"). This doc treats delete as the more destructive action and
  requires creator-or-admin/owner — that's a **harness extrapolation**, not
  a plan.md rule; it's flagged as such at the call site (§2.4) so it's easy
  to revisit if the product plan is ever amended to say otherwise.

`moduleKey`/`objectType`/`ownerField` for the visibility helper (per
`docs/access-control.md`'s table):

| | value |
|---|---|
| `moduleKey` | `life_admin` (snake_case — this is the `Module.key`/`resourceDomain` value, not the `life-admin` kebab-case folder name) |
| `objectType` | `Contact` |
| `ownerField` | `createdById` — the scalar FK column. `docs/orm-conventions.md`'s naming rule appends `Id` to the scalar even though the plan's own prose just says "createdBy" for the relation; `visibilityWhere()`'s `ownerField` always names the scalar column, since that's what a Prisma `where` filters on. |

### 2.1 Prisma model (already scaffolded)

`Contact` already exists in the `// 3.5 Life Admin` banner section of
`prisma/schema.prisma` — Phase 0 scaffolded every entity's Prisma model up
front, across all 8 built-in modules, before any module's vertical slice was
built. Building a new entity in an existing module is therefore usually
**not** a schema change:

```prisma
// prisma/schema.prisma — inside "3.5 Life Admin"
model Contact {
  id          String          @id @default(cuid())
  householdId String
  household   Household       @relation(fields: [householdId], references: [id], onDelete: Cascade)
  name        String
  category    ContactCategory @default(other)
  phone       String?
  email       String?
  address     String?
  website     String?
  // App-layer rule (enforced in entities/contact.ts, §2.2): at least one of
  // the four above must be non-null. No DB-level CHECK constraint — the
  // zod refine is the only enforcement that matters, since every write goes
  // through the Server Actions in §2.4.
  notes       String?
  isPinned    Boolean         @default(false)
  visibility  Visibility      @default(household)
  createdById String
  createdBy   Member          @relation("ContactCreatedBy", fields: [createdById], references: [id])
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  renewalsAsProvider Renewal[] // Renewal.providerContactId's inverse — a real,
                                // typed relation with an implicit onDelete: SetNull
                                // (Prisma's default for an optional relation scalar)

  @@index([householdId])
}
```

If your task genuinely does add a new entity with no existing schema block,
append one following this shape — `pnpm prisma format && pnpm prisma
validate && pnpm prisma migrate dev --name add_<entity>` — and skip
back-relations into models that don't exist yet in the same PR (leave a
comment saying why).

### 2.2 `entities/contact.ts` — schemas & pure helpers

```ts
// src/modules/life-admin/entities/contact.ts
import { z } from "zod";
import { visibilitySchemaFields, refineVisibility } from "@/lib/household/visibility";

export const contactCategorySchema = z.enum([
  "medical", "emergency_services", "home_service_provider", "insurance_agent",
  "landlord_property_manager", "school_childcare", "financial_legal",
  "utility_provider", "family_friend", "other",
]);

function hasAtLeastOneChannel(data: { phone?: string; email?: string; address?: string; website?: string }) {
  return Boolean(data.phone || data.email || data.address || data.website);
}

export const createContactInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    category: contactCategorySchema.default("other"),
    phone: z.string().max(40).optional(),
    email: z.string().email().optional(),
    address: z.string().max(240).optional(),
    website: z.string().url().optional(),
    notes: z.string().max(2000).optional(),
    isPinned: z.boolean().default(false),
    ...visibilitySchemaFields, // visibility + sharedWithMemberIds — the one
                                 // platform-wide fragment every shareable
                                 // entity's schema spreads in
  })
  .superRefine((data, ctx) => {
    refineVisibility(data, ctx); // the shared "specific_members needs ≥1 pick" check
    if (!hasAtLeastOneChannel(data)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: "Provide at least one of phone, email, address, or website.",
      });
    }
  });
export type CreateContactInput = z.infer<typeof createContactInputSchema>;
export type CreateContactFormInput = z.input<typeof createContactInputSchema>;

// Reused by every query/action below so the moduleKey/objectType/ownerField
// triple is defined exactly once.
export const CONTACT_VISIBILITY_SCOPE = {
  moduleKey: "life_admin",
  objectType: "Contact",
  ownerField: "createdById",
} as const;
```

### 2.3 `queries/` — the read layer

```ts
// src/modules/life-admin/queries/get-visible-contacts.ts
import { prisma } from "@/lib/db";
import { visibilityWhere } from "@/lib/access/visibility";
import type { ActingMember } from "@/lib/auth/session";
import { CONTACT_VISIBILITY_SCOPE } from "../entities/contact";
import type { ContactCategory } from "@prisma/client";

export async function getVisibleContacts(
  actingMember: ActingMember,
  filters: { category?: ContactCategory; pinnedOnly?: boolean } = {},
) {
  return prisma.contact.findMany({
    where: {
      AND: [
        await visibilityWhere(actingMember, CONTACT_VISIBILITY_SCOPE),
        filters.category ? { category: filters.category } : {},
        filters.pinnedOnly ? { isPinned: true } : {},
      ],
    },
    orderBy: [{ isPinned: "desc" }, { name: "asc" }],
  });
}
```

```ts
// src/modules/life-admin/queries/get-contact.ts
import { prisma } from "@/lib/db";
import { visibilityWhere } from "@/lib/access/visibility";
import { NotFoundError } from "@/lib/access/errors";
import type { ActingMember } from "@/lib/auth/session";
import { CONTACT_VISIBILITY_SCOPE } from "../entities/contact";

// Detail reads need the visibility check exactly as much as list reads do —
// a guessed/linked Contact id from another household or a private record
// must 404, not leak.
export async function getContact(actingMember: ActingMember, contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: {
      AND: [{ id: contactId }, await visibilityWhere(actingMember, CONTACT_VISIBILITY_SCOPE)],
    },
  });
  if (!contact) throw new NotFoundError("Contact not found.");
  return contact;
}
```

`visibilityWhere()` itself (`src/lib/access/visibility.ts`) is platform
substrate, not something this doc defines from scratch — it's the same
helper every module's `queries/` calls. Restated here for completeness,
since it's the one function this whole doc leans on hardest:

```ts
// src/lib/access/visibility.ts
import { prisma } from "@/lib/db";
import type { ActingMember } from "@/lib/auth/session";

export type VisibilityScope = {
  moduleKey: string;  // Module.key / resourceDomain, e.g. "life_admin"
  objectType: string; // ObjectShare.objectType, e.g. "Contact"
  ownerField: string;  // the scalar field on this Prisma model holding the creator Member id
};

export async function visibilityWhere(
  actingMember: Pick<ActingMember, "id" | "householdId">,
  scope: VisibilityScope,
) {
  const shares = await prisma.objectShare.findMany({
    where: {
      householdId: actingMember.householdId,
      moduleKey: scope.moduleKey,
      objectType: scope.objectType,
      sharedWithMemberId: actingMember.id,
    },
    select: { objectId: true },
  });
  const sharedObjectIds = shares.map((s) => s.objectId);

  return {
    householdId: actingMember.householdId, // satisfies the tenant-guard extension's requirement too
    OR: [
      { visibility: "household" as const },
      { visibility: "private" as const, [scope.ownerField]: actingMember.id },
      { visibility: "specific_members" as const, OR: [{ [scope.ownerField]: actingMember.id }, { id: { in: sharedObjectIds } }] },
    ],
  };
}
```

Always combine this with other filters via `AND: [...]`, never a spread —
`{ ...(await visibilityWhere(...)), ...filters }` silently drops one `OR` if
`filters` has its own (`docs/access-control.md` §5.4). Both query functions
above already do it right; copy their shape, not the anti-pattern.

### 2.4 `actions/` — the mutations

**Create** — no role gate beyond "is an active member of this household,"
which `requireMember()` already guarantees. Don't invent a capability check
that isn't in `plan.md`:

```ts
// src/modules/life-admin/actions/create-contact.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { syncObjectShares } from "@/lib/household/actions/sync-object-shares";
import { createContactInputSchema, type CreateContactFormInput, CONTACT_VISIBILITY_SCOPE } from "../entities/contact";
import { emitContactCreated } from "../events/emitters";

export async function createContact(input: CreateContactFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const data = createContactInputSchema.parse(input);

  const contact = await prisma.contact.create({
    data: {
      householdId: member.householdId,
      name: data.name,
      category: data.category,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      website: data.website ?? null,
      notes: data.notes ?? null,
      isPinned: data.isPinned,
      visibility: data.visibility,
      createdById: member.id,
    },
  });

  if (data.visibility === "specific_members") {
    await syncObjectShares({
      householdId: member.householdId,
      moduleKey: CONTACT_VISIBILITY_SCOPE.moduleKey,
      objectType: CONTACT_VISIBILITY_SCOPE.objectType,
      objectId: contact.id,
      sharedByMemberId: member.id,
      sharedWithMemberIds: data.sharedWithMemberIds ?? [],
    });
  }

  await emitContactCreated(member.householdId, contact.id, contact.name, member.id);

  revalidatePath("/life-admin/contacts");
  return contact;
}
```

`syncObjectShares()` is a **platform-level** helper
(`@/lib/household/actions/sync-object-shares`), not a per-entity file —
every module that writes a `visibility`-carrying entity imports this same
function rather than hand-rolling its own `sync-<entity>-shares.ts`.

**Update** — the Q30 entity. Loading the record through `getContact()`
already runs it through `visibilityWhere()`; per plan.md §9 Q30, being able
to load it at all *is* the authorization check. Resist adding an
`isOwner` check the way Task's `updateTask()` does — that's a different,
stricter rule that doesn't apply here:

```ts
// src/modules/life-admin/actions/update-contact.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { syncObjectShares } from "@/lib/household/actions/sync-object-shares";
import { createContactInputSchema, type CreateContactFormInput, CONTACT_VISIBILITY_SCOPE } from "../entities/contact";
import { getContact } from "../queries/get-contact";
import { emitContactUpdated } from "../events/emitters";

export async function updateContact(contactId: string, input: CreateContactFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  await getContact(member, contactId); // tenant + visibility check — the whole gate for Q30

  const data = createContactInputSchema.parse(input);

  const contact = await prisma.contact.update({
    where: { id: contactId, householdId: member.householdId }, // both, always — never id alone
    data: {
      name: data.name,
      category: data.category,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      website: data.website ?? null,
      notes: data.notes ?? null,
      isPinned: data.isPinned,
      visibility: data.visibility,
    },
  });

  await syncObjectShares({
    householdId: member.householdId,
    moduleKey: CONTACT_VISIBILITY_SCOPE.moduleKey,
    objectType: CONTACT_VISIBILITY_SCOPE.objectType,
    objectId: contact.id,
    sharedByMemberId: member.id,
    sharedWithMemberIds: data.visibility === "specific_members" ? data.sharedWithMemberIds ?? [] : [],
  });

  await emitContactUpdated(member.householdId, contact.id, member.id);

  revalidatePath("/life-admin/contacts");
  return contact;
}
```

**Delete** — the harness-extrapolated rule from §2.0. Also cleans up the
generic `Document.linkedEntityId` pointer manually, since Prisma can't
cascade a polymorphic reference the way it can a typed relation:

```ts
// src/modules/life-admin/actions/delete-contact.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { hasAtLeastRole } from "@/lib/access/roles";
import { getContact } from "../queries/get-contact";

export async function deleteContact(contactId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const contact = await getContact(member, contactId); // tenant + visibility check

  // NOT a plan.md rule — §9 Q30 resolves *editing* only. This harness
  // treats delete as more destructive and requires creator-or-admin/owner,
  // mirroring the "role-based moderation" precedent in plan.md §5.
  if (contact.createdById !== member.id && !hasAtLeastRole(member.role, "admin")) {
    throw new ForbiddenError("Only the creator or a household admin/owner can delete this contact.");
  }

  // Document.linkedEntityId is a generic, untyped pointer (docs/orm-
  // conventions.md §4) — Prisma can't cascade it. Renewal.providerContactId
  // is a real, typed relation with an implicit onDelete: SetNull default
  // (Prisma's default for an optional relation scalar), so it needs no
  // manual cleanup here.
  await prisma.document.updateMany({
    where: { householdId: member.householdId, linkedEntityType: "contact", linkedEntityId: contactId },
    data: { linkedEntityType: null, linkedEntityId: null },
  });

  await prisma.objectShare.deleteMany({
    where: { householdId: member.householdId, moduleKey: "life_admin", objectType: "Contact", objectId: contactId },
  });

  await prisma.contact.delete({ where: { id: contactId, householdId: member.householdId } });

  revalidatePath("/life-admin/contacts");
}
```

**Toggle pin** — small enough to be its own action rather than routing the
list's pin button through the full update form:

```ts
// src/modules/life-admin/actions/toggle-contact-pin.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { getContact } from "../queries/get-contact";

export async function toggleContactPin(contactId: string, isPinned: boolean) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  await getContact(member, contactId); // visibility check — same Q30 reasoning as updateContact

  const contact = await prisma.contact.update({
    where: { id: contactId, householdId: member.householdId },
    data: { isPinned },
  });

  revalidatePath("/life-admin/contacts");
  return contact;
}
```

### 2.5 `events/emitters.ts` + `module.ts`

```ts
// src/modules/life-admin/events/emitters.ts (excerpt)
import { emitEvent } from "@/lib/events/emit";

export async function emitContactCreated(householdId: string, contactId: string, name: string, byMemberId: string) {
  return emitEvent(householdId, "contact.created", { contactId, name }, byMemberId);
}

export async function emitContactUpdated(householdId: string, contactId: string, byMemberId: string) {
  return emitEvent(householdId, "contact.updated", { contactId }, byMemberId);
}
```

Add the two event types to `life-admin/module.ts`'s `eventTypes` array —
an *addition*, not a new file, since Life Admin is already one of the 8
registered built-ins from Phase 0. `plan.md` §4.8's `Emits:` line for Life
Admin is the checklist for exactly which event keys this module is allowed
to register — don't add one it doesn't name (no `contact.deleted`, no
`email_notification_category`/`quick_capture_target` surface for Contact
either, since plan.md §4.1/§6 don't name it as either).

### 2.6 `index.ts` — the public barrel

```ts
// src/modules/life-admin/index.ts (excerpt)
export { getVisibleContacts } from "./queries/get-visible-contacts";
export { getContact } from "./queries/get-contact";
export { createContact } from "./actions/create-contact";
export { updateContact } from "./actions/update-contact";
export { deleteContact } from "./actions/delete-contact";
export { toggleContactPin } from "./actions/toggle-contact-pin";
export { contactCategorySchema, createContactInputSchema } from "./entities/contact";
export type { CreateContactInput, CreateContactFormInput } from "./entities/contact";
```

Every import from outside `src/modules/life-admin/` — a page, another
module — goes through this file (ESLint-enforced, `docs/project-structure.md`
§7). Files *inside* `life-admin` use relative imports freely.

### 2.7 UI — one list, no detail route

`docs/project-structure.md`'s actual route tree gives Contact a single flat
route — `src/app/(app)/life-admin/contacts/page.tsx` — **no**
`[contactId]/page.tsx`. (An earlier draft of this doc built a separate
detail page; that's not what the route tree specifies, and it's not what
shipped.) So Contact follows the same "list + inline dialog" shape as every
other simple entity in this app (Category, Budget) rather than Notes'
own list-plus-detail-page pattern — edit happens in a `Dialog` opened
directly from the list, never a navigation.

```tsx
// src/app/(app)/life-admin/contacts/page.tsx
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { getMembers } from "@/lib/household";
import { getVisibleContacts } from "@/modules/life-admin";
import { NewContactDialog } from "@/modules/life-admin/components/new-contact-dialog";
import { ContactList } from "@/modules/life-admin/components/contact-list";

export default async function ContactsPage() {
  const member = await requireMember();
  if (!member) redirect("/login");

  const [members, contacts] = await Promise.all([getMembers(member.householdId), getVisibleContacts(member)]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Contacts</h1>
        <NewContactDialog members={members} />
      </div>
      <ContactList contacts={contacts} members={members} />
    </div>
  );
}
```

(A page reaching into a module's `components/` directly is the one
exception to the barrel-only rule: it's an `app/ → module` import, not a
`module → module` one. The queries/actions/entities/events layers still go
through the barrel, per §2.6 above.)

`ContactList` (`src/modules/life-admin/components/contact-list.tsx`) is a
`"use client"` component: pinned contacts render in their own section
first, each card has a pin-toggle star button, an inline "Edit" button that
opens a shadcn `Dialog` wrapping `ContactForm`, and a "Delete" button behind
the shared `src/components/confirm-dialog.tsx` (destructive/terminal
actions always go through that one component — `docs/tables.md` §3). The
`ContactForm` itself (`src/modules/life-admin/components/contact-form.tsx`)
is `react-hook-form` + `zodResolver(createContactInputSchema)`, reused for
both "new contact" (via `NewContactDialog`, an uncontrolled trigger with its
own `open` state) and editing an existing one (a controlled dialog the list
opens itself) — the exact form/dialog split every module in this app uses.

### 2.8 Tests

Per `CLAUDE.md` rule 4, colocated, one happy path + one rejected path per
Server Action at minimum:

```ts
// src/modules/life-admin/actions/create-contact.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { createContact } from "./create-contact";

vi.mock("@/lib/db", () => ({
  prisma: { contact: { create: vi.fn() }, objectShare: { deleteMany: vi.fn(), createMany: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("@/lib/household/actions/sync-object-shares", () => ({ syncObjectShares: vi.fn() }));
vi.mock("../events/emitters", () => ({ emitContactCreated: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = { id: "cmember0000000000001", householdId: "household_1", role: "member" as const };

describe("createContact", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a Contact scoped to the acting member's household (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: "contact_1", name: "Dr. Hasić" } as never);

    await createContact({ name: "Dr. Hasić", category: "medical", phone: "+387 61 000 000" });

    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ householdId: "household_1", createdById: "cmember0000000000001" }),
      }),
    );
  });

  it("rejects a contact with no phone, email, address, or website (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);

    await expect(createContact({ name: "No Channel", category: "other" })).rejects.toThrow();
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });
});
```

```ts
// src/modules/life-admin/actions/update-contact.test.ts (excerpt)
// "lets a household member who did NOT create the contact edit it" — asserts
// plan.md §9 Q30 directly: mock getContact's underlying prisma.contact.findFirst
// to return a row created by a DIFFERENT member, and confirm the update still
// succeeds. A second test mocks prisma.contact.findFirst to return null
// (visibilityWhere() excluded it) and asserts the action rejects with
// NotFoundError.
```

```ts
// src/modules/life-admin/actions/delete-contact.test.ts (excerpt)
// Three cases: the creator can delete their own contact; a plain member who
// neither created it nor is an admin/owner is rejected with ForbiddenError;
// an admin CAN delete a contact they didn't create.
```

```ts
// src/modules/life-admin/queries/get-visible-contacts.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { getVisibleContacts } from "./get-visible-contacts";

vi.mock("@/lib/db", () => ({
  prisma: { contact: { findMany: vi.fn() }, objectShare: { findMany: vi.fn() } },
}));

const actingMember = { id: "cmember0000000000001", householdId: "household_1" };

describe("getVisibleContacts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes by householdId and includes the visibility clause", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([{ id: "contact_1" }] as never);

    const result = await getVisibleContacts(actingMember as never);

    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([expect.objectContaining({ householdId: "household_1" })]),
        }),
      }),
    );
    expect(result).toHaveLength(1);
  });
});
```

A cross-module Playwright spec (`e2e/`) is **not** required for `Contact` on
its own — it's a single-module CRUD flow, and `CLAUDE.md` rule 4 reserves
`e2e/` for cross-module flows.

### 2.9 Closing the loop — `ROADMAP.md`

Check off `Contact`'s entity line and its behavior lines in `ROADMAP.md`'s
Life Admin section, with a PR pointer, per that file's own rule 2. Reconcile
any "Events emitted" gap against `plan.md`'s `Emits:` line for the module in
the same change — don't leave a mismatch to drift further.

---

## 3. Copy-paste checklist for the next entity

Swap `<Entity>`/`<entity>`/`<module-key>` and go. Skip any row that
plan.md's field list for your entity doesn't need (e.g. no `visibility`
column → no `visibilityWhere()` call at all, per `docs/access-control.md`'s
list of which entities carry it).

1. **Read the plan.** `plan.md`'s entity section — note which fields are
   required/optional/defaulted, and skim `plan.md` §9 for any Decision that
   specifically names this entity.
2. **Prisma model.** Check whether it's already scaffolded in
   `prisma/schema.prisma` (likely, for an existing module — Phase 0
   scaffolded every entity across all 8 built-ins). If not, append a block
   to the right banner section; add the enum(s) it needs; skip
   back-relations into models that don't exist yet. `pnpm prisma migrate dev
   --name add_<entity>` only if you actually changed the schema.
3. **`entities/<entity>.ts`.** `zod` input schema (with any `.refine()`
   plan.md's field list implies), plus a `..._VISIBILITY_SCOPE` constant if
   the entity carries `visibility` — `ownerField` is always the scalar FK
   column name (`createdById`, not `createdBy`).
4. **`queries/get-visible-<entities>.ts` + `queries/get-<entity>.ts`.**
   Both take the acting member (`ActingMember`, from `@/lib/auth/session`)
   as their first parameter, not separate `householdId`/`memberId` args.
   Both go through `visibilityWhere()` (`@/lib/access/visibility`),
   combined via `AND`, never a spread.
5. **`actions/create-<entity>.ts` / `update-<entity>.ts` /
   `delete-<entity>.ts`.** `requireMember()` returns `ActingMember | null` —
   always `if (!member) throw new Error("Not authenticated")` (actions) or
   `redirect("/login")` (pages), never destructure `{ member, household }`.
   Decide the authorization shape deliberately — don't default to "only the
   creator can edit" without checking whether plan.md actually says that
   for this entity. A role check is `hasAtLeastRole(member.role,
   "admin")` from `@/lib/access/roles`, thrown manually as `ForbiddenError`
   — there is no `requireRole()` helper. Reuse the platform's
   `syncObjectShares()` (`@/lib/household/actions/sync-object-shares`) for
   `ObjectShare` reconciliation — never write a per-entity
   `sync-<entity>-shares.ts` file.
6. **`events/emitters.ts` + `module.ts`.** Only if plan.md's `Emits:` line
   for this module lists something new.
7. **`index.ts`.** Export the new query/action functions and input type;
   nothing else.
8. **UI.** Check `docs/project-structure.md`'s actual route tree before
   assuming a detail page exists — several entities (Contact included) get
   only a flat list route, with edit happening in an inline `Dialog`, not a
   separate `[id]/page.tsx`. Components live in `<module>/components/`,
   composed from `@/components/ui/`.
9. **Tests.** Colocated. One happy + one rejected path per action, minimum,
   per `CLAUDE.md` rule 4. A visibility test for the list query if the
   entity carries `visibility`.
10. **`ROADMAP.md`.** Check off the entity line and every behavior bullet
    it satisfies; reconcile any "Events emitted" gap against plan.md's
    `Emits:` line while you're in that section.

---

## 4. Definition of done

Before calling an entity finished, the full checklist from `CLAUDE.md` /
`docs/verify.md` applies:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Schema touched → also:

```bash
pnpm prisma validate
pnpm prisma migrate dev --name add_<entity>
```

Don't report the task done if any of these fail, and don't skip the
`ROADMAP.md` reconciliation in §2.9/§3 step 10 — an entity that works but
isn't checked off is, per `ROADMAP.md`'s own rules, indistinguishable from
one that was never built.
