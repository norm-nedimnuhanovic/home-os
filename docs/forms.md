# Forms

How every mutation-facing form in Home OS is built: `zod` owns validation and
the wire contract, `react-hook-form` + shadcn/ui's `Form` primitives own the
client-side UX, and a Server Action is always the thing that actually writes
to Postgres — never a form's `onSubmit` calling `prisma` directly, never a
Route Handler standing in for what a Server Action should do (see
`docs/project-structure.md` §7 on when a Route Handler is actually
warranted — form submissions are never one of those cases).

**Companion docs, not duplicated here:** `docs/access-control.md` owns *why*
a Server Action must re-validate its own input and re-check
`householdId`/visibility even though the client already ran the same `zod`
schema (its §1 non-goals: *"assume every Server Action can be called
directly with crafted arguments"*) — this doc just shows the resulting code
shape. `docs/orm-conventions.md` owns the Prisma model these schemas are
derived from. `docs/ui-components.md` owns Tailwind/shadcn styling
conventions generally (spacing scale, when to reach for a `Dialog` vs a
route, dark-mode handling); this doc assumes the shadcn primitives it uses
below (`form`, `input`, `select`, `textarea`, `switch`, `calendar`,
`popover`, `badge`, `button`, `dialog`) are already added via
`pnpm dlx shadcn@latest add <component>` and only covers how they wire into
`react-hook-form` + a Server Action. `docs/testing.md` owns the test
runner/fixture setup; §8 below only shows the shape a form's own test takes.

**Scope boundary with `docs/auth.md`:** login, signup, and invite-acceptance
screens are plain native `<form action={...}>` elements posting straight to
a Server Action via FormData — they have no client-side interactivity to
manage (no dependent fields, no dynamic arrays, no multi-step flow), so
`react-hook-form` would be pure overhead. This doc's convention governs
every *entity* form across the 8 product modules (Task, Note, Renewal,
Contact, Budget, …) — anywhere a member is creating or editing a record with
real field-level validation, conditional fields, or more than a couple of
inputs. If a screen looks like `docs/auth.md`'s login form (one or two
fields, no client state), a plain native form is fine and this doc doesn't
apply to it.

---

## 1. The stack, and where each piece lives

| Concern | Tool | Lives in |
|---|---|---|
| Wire contract / validation rules | `zod` | `src/modules/<key>/entities/<entity>.ts` — same file that already holds `create<Entity>InputSchema` per `docs/project-structure.md` §3 |
| Client-side form state, field-level errors, submission lifecycle | `react-hook-form` (`useForm`, `zodResolver`) | `src/modules/<key>/components/<entity>-form.tsx` — a Client Component (`"use client"`) |
| Rendering, labels, error text | shadcn/ui's `Form`/`FormField`/`FormItem`/`FormLabel`/`FormControl`/`FormMessage` (thin wrappers around `react-hook-form`'s `Controller`, copied into `src/components/ui/form.tsx` by `shadcn init`) | same `<entity>-form.tsx` |
| The actual write | A Server Action | `src/modules/<key>/actions/create-<entity>.ts` / `update-<entity>.ts` |
| Supporting reads (dropdown options, defaults) | Plain query functions | `src/modules/<key>/queries/*.ts`, called from the **page** (a Server Component) and passed down as props — never fetched client-side inside the form component itself |

One `zod` schema per entity is the single source of truth for what a
create-or-update Server Action accepts. `react-hook-form` validates against
that exact schema via `zodResolver` so the UI never encodes a second,
subtly-different copy of the same rules — and the Server Action **parses
the same schema again** on the way in, because a Server Action is a public
network endpoint the client-side validation doesn't protect
(`docs/access-control.md` §1). The same schema is reused for both create
and update (matching the shape already established for `Contact` — see
`docs/resources.md`-style entities elsewhere in this repo): there is no
separate `updateTaskInputSchema` that makes every field optional.

---

## 2. The standard recipe

Every entity form in Home OS follows these six steps, in order. The worked
example in §4 walks through all six for `Task`; §6 shows what changes when
you add a field to a form that already exists.

1. **Schema** — `create<Entity>InputSchema` in `entities/<entity>.ts`,
   covering every field the form can set. If the entity has a `visibility`
   column, spread in the shared fragment from §3 rather than hand-rolling
   the `private | household | specific_members` field again.
2. **Supporting queries** — anything the form needs to populate a dropdown
   or default value (household members for an assignee picker, existing
   tags, a household-level default) is a plain query function, called by the
   **page**, not the form component.
3. **Server Action(s)** — `create<Entity>` / `update<Entity>` in `actions/`.
   Resolve `requireMember()` first, `.parse()` the schema again, write
   through `prisma`, sync `ObjectShare` rows if `visibility ===
   "specific_members"`, emit any `ModuleEventType` the plan calls for, then
   `revalidatePath(...)`.
4. **Form component** — `<Entity>Form` in `components/`, a Client Component
   wiring `useForm({ resolver: zodResolver(...) })` to shadcn's `Form`
   primitives. `onSubmit` calls the Server Action **directly with the
   validated object** `react-hook-form` hands it — never re-serialize into
   `FormData`; `react-hook-form` has already coerced strings into numbers,
   booleans, and `Date`s, and a Server Action can accept any serializable
   argument, not only `FormData`.
5. **A trigger** — usually a shadcn `Dialog` ("New task," "Add a contact")
   per the plan's "fast to add things, low friction" principle rather than a
   dedicated `/new` route; an edit form reuses the same component with
   `defaultValues` pre-filled from the loaded record.
6. **Tests** — one happy-path and one rejected-path test per Server Action
   (`docs/testing.md`, `CLAUDE.md` rule 4), plus, where the form has
   interesting client-side logic (a `.refine()`, a conditional field), a
   component test. See §8.

---

## 3. The reusable Visibility field

`Task`, `Note`, `Event`, `KanbanBoard`, `Document`, `Renewal`, `Contact`, and
`ShoppingList` all carry the exact same `visibility` contract
(`private | household | specific_members`, plus `ObjectShare` rows when
`specific_members` — `plan.md` §3.1, `docs/access-control.md` §5). Every one
of those entities' forms needs the same two things: a way to pick the
visibility level, and — only when `specific_members` is picked — a way to
pick which members. This is built **once**, as platform substrate under
`src/lib/household/` (the same home as `withVisibility()` per
`docs/project-structure.md` §4.1), and imported by every module's form. Do
not re-derive this per module.

### 3.1 The shared schema fragment

```ts
// src/lib/household/visibility.ts (addition alongside withVisibility(), §4.1
// of docs/project-structure.md — same file, not a new one)
import { z } from "zod";

/**
 * Spread into any entity's zod object schema that has a `visibility`
 * column. Keeps the field names and the enum values identical everywhere
 * (plan.md §3: "one enum, imported everywhere, never redefined per module").
 */
export const visibilitySchemaFields = {
  visibility: z.enum(["private", "household", "specific_members"]).default("household"),
  // Only read/required when visibility === "specific_members" — see the
  // refinement below. Optional here so "household"/"private" submissions
  // don't need to send an empty array.
  sharedWithMemberIds: z.array(z.string().cuid()).optional(),
};

/**
 * Pass to `.superRefine()` on any schema that spreads visibilitySchemaFields
 * in, so "specific_members with zero people picked" is rejected the same
 * way everywhere, instead of each module writing its own version of this
 * check (or forgetting it).
 */
export function refineVisibility(
  data: { visibility: string; sharedWithMemberIds?: string[] },
  ctx: z.RefinementCtx,
) {
  if (data.visibility === "specific_members" && (data.sharedWithMemberIds?.length ?? 0) === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sharedWithMemberIds"],
      message: "Pick at least one household member to share with.",
    });
  }
}
```

Used in an entity schema:

```ts
// src/modules/<key>/entities/<entity>.ts (excerpt)
import { visibilitySchemaFields, refineVisibility } from "@/lib/household/visibility";

export const createContactInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    // ...this entity's own fields...
    ...visibilitySchemaFields,
  })
  .superRefine(refineVisibility);
```

### 3.2 The shared `ObjectShare` sync helper

Every Server Action that writes an entity with `visibility` needs to
reconcile that entity's `ObjectShare` rows after the write. This is
identical for every entity — only the `moduleKey`/`objectType`/`objectId`
differ — so it's one platform-level helper, not copy-pasted per module:

```ts
// src/lib/household/actions/sync-object-shares.ts
import "server-only";
import { prisma } from "@/lib/db";

export async function syncObjectShares(params: {
  householdId: string;
  moduleKey: string;   // e.g. "tasks", "life_admin" — the Module.key this entity belongs to
  objectType: string;  // e.g. "Task", "Contact" — matches ObjectShare.objectType
  objectId: string;
  sharedByMemberId: string; // must be the object's owner, or an admin/owner moderating (docs/access-control.md)
  sharedWithMemberIds: string[];
}) {
  const { householdId, moduleKey, objectType, objectId, sharedByMemberId, sharedWithMemberIds } = params;

  // Full delete-and-recreate rather than a diff — ObjectShare rows carry no
  // other state worth preserving, and this keeps the Server Action's logic
  // trivial to reason about (idempotent no matter what the previous set was).
  await prisma.objectShare.deleteMany({ where: { householdId, moduleKey, objectType, objectId } });
  if (sharedWithMemberIds.length === 0) return;

  await prisma.objectShare.createMany({
    data: sharedWithMemberIds.map((sharedWithMemberId) => ({
      householdId,
      moduleKey,
      objectType,
      objectId,
      sharedWithMemberId, // scalar FK column — see CLAUDE.md's canonical ObjectShare naming
      sharedByMemberId,
    })),
  });
}
```

A create/update action calls it only when relevant:

```ts
if (data.visibility === "specific_members") {
  await syncObjectShares({
    householdId: household.id,
    moduleKey: "tasks",
    objectType: "Task",
    objectId: task.id,
    sharedByMemberId: member.id,
    sharedWithMemberIds: data.sharedWithMemberIds ?? [],
  });
}
```

### 3.3 The `<VisibilityField>` component

```tsx
// src/lib/household/components/visibility-field.tsx
"use client";

import { useFormContext } from "react-hook-form";
import {
  FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const VISIBILITY_OPTIONS = [
  { value: "private", label: "Only me" },
  { value: "household", label: "Whole household" },
  { value: "specific_members", label: "Specific people" },
] as const;

type MemberOption = { id: string; displayName: string };

/**
 * Drop into any <Form> whose schema spread `visibilitySchemaFields` in
 * (§3.1). Uses useFormContext() rather than taking `form` as a prop, so a
 * module's form component doesn't have to thread it through — the same
 * reason shadcn's own <FormField> works this way.
 */
export function VisibilityField({ members }: { members: MemberOption[] }) {
  const form = useFormContext();
  const visibility = form.watch("visibility");

  return (
    <div className="space-y-3">
      <FormField
        control={form.control}
        name="visibility"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Who can see this</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
              <SelectContent>
                {VISIBILITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      {visibility === "specific_members" && (
        <FormField
          control={form.control}
          name="sharedWithMemberIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Shared with</FormLabel>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => {
                  const selected = (field.value ?? []).includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        field.onChange(
                          selected
                            ? field.value.filter((id: string) => id !== m.id)
                            : [...(field.value ?? []), m.id],
                        )
                      }
                    >
                      <Badge variant={selected ? "default" : "outline"}>{m.displayName}</Badge>
                    </button>
                  );
                })}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );
}
```

Every module's form imports this instead of building its own visibility
select:

```tsx
import { VisibilityField } from "@/lib/household/components/visibility-field";
// ...inside the <Form>...
<VisibilityField members={members} />
```

`members` is fetched by the **page** (`getMembers(householdId)` from
`@/lib/household`, per `docs/project-structure.md`'s household barrel) and
passed down as a prop — the form component itself never queries.

---

## 4. Worked example: the Task creation form

Building on `Task`'s schema as already established in
`docs/project-structure.md` §3.2, extended here with the `tags` and
`visibility`/sharing fields the create form actually needs.

### 4.1 `entities/task.ts` — the schema

```ts
// src/modules/tasks/entities/task.ts
import { z } from "zod";
import { visibilitySchemaFields, refineVisibility } from "@/lib/household/visibility";

export const taskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

export const createTaskInputSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    dueDate: z.date().optional(),
    dueDateAllDay: z.boolean().default(true),
    priority: taskPrioritySchema.default("medium"),
    assigneeId: z.string().cuid().optional(),
    parentTaskId: z.string().cuid().optional(),
    tagIds: z.array(z.string().cuid()).default([]),
    ...visibilitySchemaFields, // visibility + sharedWithMemberIds, §3.1 — replaces a hand-rolled enum field
  })
  .superRefine(refineVisibility);

export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

// completedAt is the single source of truth for completion — no separate
// boolean (plan.md §4). Unrelated to the create form, kept here because
// it's a small pure function derived from the same model (docs/project-
// structure.md §3: entities/ holds "zod schemas and small pure functions").
export function getTaskStatus(task: { completedAt: Date | null; dueDate: Date | null }): "open" | "overdue" | "completed" {
  if (task.completedAt) return "completed";
  if (task.dueDate && task.dueDate < new Date()) return "overdue";
  return "open";
}
```

### 4.2 A small reusable date field

`dueDate` (and, in §7.2's `Renewal` example, `expiryDate`/
`purchaseOrIssueDate`) all need the same shadcn "pick a date" recipe. Build
it once as a generic, cross-module composite
(`pnpm dlx shadcn@latest add calendar popover` first):

```tsx
// src/components/date-field.tsx
"use client";

import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function DateField({
  value,
  onChange,
  placeholder = "Pick a date",
}: {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "PPP") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar mode="single" selected={value} onSelect={onChange} initialFocus />
      </PopoverContent>
    </Popover>
  );
}
```

This lives in `src/components/` (no `/ui`) per `docs/project-structure.md`
§8 — it's a composite with no domain meaning of its own, same tier as
`page-header.tsx`/`confirm-dialog.tsx`. When `dueDateAllDay` is unchecked, a
timed task additionally needs a time-of-day input (`<Input type="time">`)
merged onto the same `Date` via `date-fns`' `set()` before it reaches the
form's `dueDate` field — omitted here for brevity; wire it the same way
`Renewal`'s reminders step in §7.2 wires its own array field, i.e. convert
at the field's `onChange`, not inside the schema.

### 4.3 Supporting queries

```ts
// src/modules/tasks/queries/get-household-tags.ts
import { prisma } from "@/lib/db";

export async function getHouseholdTags(householdId: string) {
  return prisma.tag.findMany({ where: { householdId }, orderBy: { name: "asc" } });
}
```

Exported from `src/modules/tasks/index.ts` alongside the rest of the tasks
barrel, so Notes — which reuses the same `Tag` taxonomy (`plan.md` §3.3) —
can call `getHouseholdTags()` too instead of querying `prisma.tag` itself.
Household members come from the platform layer, not from `tasks`:

```ts
// called from the page — src/lib/household's own barrel
import { getMembers } from "@/lib/household";
```

### 4.4 `actions/create-task.ts`

```ts
// src/modules/tasks/actions/create-task.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { syncObjectShares } from "@/lib/household/actions/sync-object-shares";
import { createTaskInputSchema, type CreateTaskInput } from "../entities/task";
import { emitTaskAssigned } from "../events/emitters";

export async function createTask(input: CreateTaskInput) {
  const { member, household } = await requireMember();

  // Re-parse even though react-hook-form already validated this schema
  // client-side — a Server Action is callable directly with crafted
  // arguments (docs/access-control.md §1); never skip this.
  const data = createTaskInputSchema.parse(input);

  const task = await prisma.task.create({
    data: {
      householdId: household.id,
      title: data.title,
      description: data.description ?? null,
      dueDate: data.dueDate ?? null,
      dueDateAllDay: data.dueDateAllDay,
      priority: data.priority,
      assigneeId: data.assigneeId ?? null,
      parentTaskId: data.parentTaskId ?? null,
      visibility: data.visibility,
      createdById: member.id,
      tags: {
        // TaskTag carries householdId denormalized even though it's
        // derivable from Task — docs/orm-conventions.md §3.1
        create: data.tagIds.map((tagId) => ({ tagId, householdId: household.id })),
      },
    },
  });

  if (data.visibility === "specific_members") {
    await syncObjectShares({
      householdId: household.id,
      moduleKey: "tasks",
      objectType: "Task",
      objectId: task.id,
      sharedByMemberId: member.id,
      sharedWithMemberIds: data.sharedWithMemberIds ?? [],
    });
  }

  if (task.assigneeId) {
    await emitTaskAssigned(household.id, task.id, task.assigneeId, member.id);
  }

  revalidatePath("/tasks");
  return task;
}
```

`update-task.ts` follows the identical shape (load through
`getTask(household.id, taskId)` first, re-parse, update, re-sync shares) —
omitted here since it adds nothing new over `create-task.ts` for the
purposes of this doc; see §6 for what changes in it when a new field is
added.

### 4.5 `components/task-form.tsx`

```tsx
// src/modules/tasks/components/task-form.tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { DateField } from "@/components/date-field";
import { VisibilityField } from "@/lib/household/components/visibility-field";
import { createTaskInputSchema, taskPrioritySchema, type CreateTaskInput } from "../entities/task";
import { createTask } from "../actions/create-task";
import { updateTask } from "../actions/update-task";
import type { Task } from "@prisma/client";

type MemberOption = { id: string; displayName: string };
type TagOption = { id: string; name: string };

export function TaskForm({
  task,
  members,
  tags,
  onDone,
}: {
  task?: Task & { tagIds?: string[] };
  members: MemberOption[];
  tags: TagOption[];
  onDone: () => void;
}) {
  const form = useForm<CreateTaskInput>({
    resolver: zodResolver(createTaskInputSchema),
    defaultValues: task ?? {
      priority: "medium",
      dueDateAllDay: true,
      tagIds: [],
      visibility: "household",
    },
  });

  async function onSubmit(values: CreateTaskInput) {
    try {
      if (task) {
        await updateTask(task.id, values);
      } else {
        await createTask(values);
      }
      onDone();
    } catch (err) {
      // Standard error-surfacing convention for every form in this doc:
      // a rejected Server Action (a thrown ForbiddenError/NotFoundError, or
      // a zod re-validation failure the client somehow missed) sets a
      // root-level react-hook-form error rather than an unhandled
      // exception reaching the user.
      form.setError("root", { message: err instanceof Error ? err.message : "Something went wrong." });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="title" render={({ field }) => (
          <FormItem>
            <FormLabel>Title</FormLabel>
            <FormControl><Input {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="description" render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl><Textarea {...field} /></FormControl>
          </FormItem>
        )} />

        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="dueDate" render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Due date</FormLabel>
              <DateField value={field.value} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="priority" render={({ field }) => (
            <FormItem>
              <FormLabel>Priority</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {taskPrioritySchema.options.map((p) => (
                    <SelectItem key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <FormField control={form.control} name="dueDateAllDay" render={({ field }) => (
          <FormItem className="flex items-center justify-between">
            <FormLabel>All day</FormLabel>
            <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
          </FormItem>
        )} />

        <FormField control={form.control} name="assigneeId" render={({ field }) => (
          <FormItem>
            <FormLabel>Assignee</FormLabel>
            {/* Radix Select can't take an empty-string item value, so
                "unassigned" is a sentinel mapped back to `undefined` —
                assigneeId stays optional/null in the schema and on Task. */}
            <Select
              onValueChange={(value) => field.onChange(value === "unassigned" ? undefined : value)}
              defaultValue={field.value ?? "unassigned"}
            >
              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormItem>
        )} />

        <FormField control={form.control} name="tagIds" render={({ field }) => (
          <FormItem>
            <FormLabel>Tags</FormLabel>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const selected = field.value.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() =>
                      field.onChange(
                        selected ? field.value.filter((id) => id !== tag.id) : [...field.value, tag.id],
                      )
                    }
                  >
                    <Badge variant={selected ? "default" : "outline"}>{tag.name}</Badge>
                  </button>
                );
              })}
            </div>
          </FormItem>
        )} />

        <VisibilityField members={members} />

        {form.formState.errors.root && (
          <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
        )}

        <Button type="submit" disabled={form.formState.isSubmitting}>
          {task ? "Save changes" : "Add task"}
        </Button>
      </form>
    </Form>
  );
}
```

Notice `TaskForm` never imports `prisma`, never imports `requireMember`, and
never knows what household it's in — every household/tenant concern is
resolved server-side, inside `createTask`/`updateTask`, exactly as
`docs/access-control.md` §1 requires ("no client-supplied identity for an
authorization decision").

### 4.6 Wiring it up

```tsx
// src/modules/tasks/components/new-task-dialog.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TaskForm } from "./task-form";

export function NewTaskDialog({ members, tags }: { members: { id: string; displayName: string }[]; tags: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>New task</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a task</DialogTitle></DialogHeader>
        <TaskForm members={members} tags={tags} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
```

```tsx
// src/app/(app)/tasks/page.tsx
import { getVisibleTasks } from "@/modules/tasks";
import { getHouseholdTags } from "@/modules/tasks";
import { getMembers } from "@/lib/household";
import { requireMember } from "@/lib/auth/session";
import { TaskList } from "@/modules/tasks/components/task-list";
import { NewTaskDialog } from "@/modules/tasks/components/new-task-dialog";

export default async function TasksPage() {
  const { household, member } = await requireMember();
  const [tasks, tags, members] = await Promise.all([
    getVisibleTasks(household.id, member.id),
    getHouseholdTags(household.id),
    getMembers(household.id),
  ]);

  return (
    <>
      <NewTaskDialog members={members} tags={tags} />
      <TaskList tasks={tasks} />
    </>
  );
}
```

The page (a Server Component) does every read; the form and its dialog are
the only Client Components, and they receive everything they need as props
— per §1's rule, the form component itself never fetches.

### 4.7 Tests

```ts
// src/modules/tasks/actions/create-task.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { createTask } from "./create-task";

vi.mock("@/lib/db", () => ({
  prisma: {
    task: { create: vi.fn() },
    objectShare: { deleteMany: vi.fn(), createMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("@/lib/events/emit", () => ({ emitEvent: vi.fn() }));

const actingMember = { member: { id: "mem_1" }, household: { id: "hh_1" } };

describe("createTask", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a Task scoped to the acting member's household", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as any);
    vi.mocked(prisma.task.create).mockResolvedValue({ id: "t1", assigneeId: null } as any);

    await createTask({ title: "Take out the bins", priority: "medium", dueDateAllDay: true, tagIds: [], visibility: "household" } as any);

    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ householdId: "hh_1", createdById: "mem_1", title: "Take out the bins" }),
      }),
    );
  });

  it("rejects a task with no title", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as any);

    await expect(createTask({ title: "", priority: "medium", dueDateAllDay: true, tagIds: [], visibility: "household" } as any))
      .rejects.toThrow();
    expect(prisma.task.create).not.toHaveBeenCalled();
  });
});
```

```tsx
// src/modules/tasks/components/task-form.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskForm } from "./task-form";
import { createTask } from "../actions/create-task";

vi.mock("../actions/create-task", () => ({ createTask: vi.fn().mockResolvedValue({ id: "t1" }) }));
vi.mock("../actions/update-task", () => ({ updateTask: vi.fn() }));

describe("TaskForm", () => {
  it("calls createTask with the entered title on submit", async () => {
    const onDone = vi.fn();
    render(<TaskForm members={[]} tags={[]} onDone={onDone} />);

    await userEvent.type(screen.getByLabelText("Title"), "Water the plants");
    await userEvent.click(screen.getByRole("button", { name: /add task/i }));

    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ title: "Water the plants" }));
    expect(onDone).toHaveBeenCalled();
  });
});
```

---

## 5. Adding a field to an existing form

Worked example: `Task.parentTaskId` (the sub-task picker) is already in
`createTaskInputSchema` (§4.1) but isn't yet exposed in `TaskForm` — a
common shape for "add a field" tasks, since the Prisma column and the
`zod` schema are often already correct and only the UI/action wiring
needs to catch up. If the column genuinely doesn't exist yet, do
`docs/orm-conventions.md` §9's "adding a new model[/field]" checklist
first, then come back here.

1. **Confirm the schema already covers it.** `parentTaskId` is already
   `z.string().cuid().optional()` in `createTaskInputSchema` — nothing to
   change in `entities/task.ts` this time. (If it weren't, this is where
   you'd add it — same file, same schema, no new file.)
2. **Check the Server Action actually persists it.** This is the step
   that's easiest to silently get wrong: `create-task.ts`'s `prisma.task.create`
   call lists fields explicitly (§4.4) rather than spreading `...data`, so a
   field present in the schema but missing from that `data: {}` object is
   silently dropped with no error from either `zod` or Prisma. Since
   `parentTaskId` is already listed in §4.4's example, this step is a
   no-op here — but always re-check it explicitly for whichever field
   you're adding, in both `create-task.ts` and `update-task.ts`.
3. **Add the query the field's picker needs.** A sub-task picker must only
   offer top-level tasks (plan.md: "one level of nesting only" — a task
   that already has a `parentTaskId` can't itself become a parent):
   ```ts
   // src/modules/tasks/queries/get-top-level-tasks.ts
   import { prisma } from "@/lib/db";

   export async function getTopLevelTasks(householdId: string, excludeTaskId?: string) {
     return prisma.task.findMany({
       where: { householdId, parentTaskId: null, id: excludeTaskId ? { not: excludeTaskId } : undefined },
       orderBy: { title: "asc" },
     });
   }
   ```
   Export it from `src/modules/tasks/index.ts`.
4. **Add the `FormField` to `task-form.tsx`:**
   ```tsx
   <FormField control={form.control} name="parentTaskId" render={({ field }) => (
     <FormItem>
       <FormLabel>Parent task</FormLabel>
       <Select onValueChange={(value) => field.onChange(value === "none" ? undefined : value)} defaultValue={field.value ?? "none"}>
         <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
         <SelectContent>
           <SelectItem value="none">No parent (top-level task)</SelectItem>
           {topLevelTasks.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
         </SelectContent>
       </Select>
     </FormItem>
   )} />
   ```
   `topLevelTasks` is a new prop, fed by `getTopLevelTasks()` from the page,
   same pattern as `members`/`tags` in §4.6.
5. **Extend tests.** Add one `create-task.test.ts` case asserting
   `parentTaskId` reaches `prisma.task.create`'s `data`, and, if the picker
   has UI logic worth covering (e.g. the current task never appears in its
   own picker on the edit form), a `task-form.test.tsx` case for that.
6. **Run the checklist.** `pnpm lint && pnpm typecheck && pnpm test` — no
   `prisma migrate` needed this time since the column already existed.

The same six steps apply to any other "add a field to an existing form"
task — schema (usually already done), action's explicit field list (the
easy-to-forget one), supporting query if the field needs one, the
`FormField`, tests, verify.

---

## 6. When a form doesn't fit the standard pattern

The recipe in §2 is the default, not a universal law. Three real
deviations show up across the 8 modules — know which one you're in before
reaching for `react-hook-form`.

### 6.1 Simpler than the pattern: skip `react-hook-form` entirely

A single boolean or single-value toggle with no other fields and no
validation beyond "is this member allowed to do this" doesn't need a form
at all — call the Server Action straight from an event handler:

```tsx
// src/modules/life-admin/components/contact-pin-button.tsx
"use client";
import { Button } from "@/components/ui/button";
import { toggleContactPin } from "../actions/toggle-contact-pin";

export function ContactPinButton({ contactId, isPinned }: { contactId: string; isPinned: boolean }) {
  return (
    <Button variant="ghost" size="icon" onClick={() => toggleContactPin(contactId, !isPinned)}>
      {isPinned ? "Unpin" : "Pin"}
    </Button>
  );
}
```

Same reasoning applies to `ShoppingListItem.isChecked` (check-off is a
single click, stamping `checkedBy`/`checkedAt` server-side), a Kanban card's
drag-and-drop column move, and marking a `ReminderOccurrence` dismissed —
none of these are "forms" in the sense this doc means, and wrapping one
boolean in a `useForm()` instance just to get a submit button is needless
overhead. If a second field ever gets added to one of these (e.g. "pin,
with a reason"), it has crossed into needing the standard recipe.

### 6.2 More complex than the pattern: multi-step wizards

Worked example: creating a `Renewal`. Per `plan.md` §3.5/§9 Q26, a Renewal
needs a title/type/dates/who's-responsible group of fields, **and** an
independently-interesting `reminderOffsetsDays` — a dynamic, add/remove-able
array of "days before expiry" (defaulting to the household's own configured
default, overridable per record) plus a `recurrence` setting. Cramming both
groups into one flat form reads poorly and buries the one field
(`reminderOffsetsDays`) that's actually novel here. This is what a
multi-step form is for — **the deviation is presentation-only**: there is
still exactly one `zod` schema owning the wire contract and exactly one
Server Action doing the write; only the component layer gains wizard state.

**The schema** (unchanged in shape from every other entity in this doc):

```ts
// src/modules/life-admin/entities/renewal.ts
import { z } from "zod";
import { visibilitySchemaFields, refineVisibility } from "@/lib/household/visibility";

export const renewalTypeSchema = z.enum([
  "warranty", "insurance", "registration_license", "membership_subscription",
  "certificate_id", "lease_contract", "domain_hosting", "other",
]);
export const renewalRecurrenceSchema = z.enum(["none", "monthly", "quarterly", "annual", "custom_interval"]);

export const renewalInputSchema = z
  .object({
    title: z.string().min(1).max(200),
    type: renewalTypeSchema,
    provider: z.string().max(120).optional(),
    purchaseOrIssueDate: z.date().optional(),
    expiryDate: z.date(),
    reminderOffsetsDays: z.array(z.number().int().min(0)).min(1, "Add at least one reminder."),
    recurrence: renewalRecurrenceSchema.default("none"),
    responsibleMemberId: z.string().cuid().optional(),
    providerContactId: z.string().cuid().optional(),
    ...visibilitySchemaFields,
  })
  .superRefine(refineVisibility);

export type RenewalInput = z.infer<typeof renewalInputSchema>;

// Which fields belong to which wizard step — used by form.trigger() below
// so "Next" only validates what's actually on screen.
export const RENEWAL_STEP_FIELDS = {
  details: ["title", "type", "provider", "purchaseOrIssueDate", "expiryDate", "responsibleMemberId", "providerContactId", "visibility", "sharedWithMemberIds"],
  reminders: ["reminderOffsetsDays", "recurrence"],
} as const;
```

`createRenewal(input: RenewalInput)` (in `actions/create-renewal.ts`) is an
ordinary Server Action following §4.4's exact shape — `requireMember()`,
`renewalInputSchema.parse(input)`, `prisma.renewal.create(...)`, then a loop
creating one `Reminder` per `reminderOffsetsDays` entry via
`createReminder()` from the `reminders` module's barrel (the direct,
permission-checked cross-module call this repo uses for every
built-in-to-built-in dependency — see `docs/project-structure.md` §3.3),
exactly as already shown in that doc's Renewal excerpt. Nothing about the
wizard changes what that action looks like.

**The client-only field-array shape.** `react-hook-form`'s `useFieldArray`
needs an array of objects, not bare numbers, so the wizard's own form state
uses a small, form-only cousin of `renewalInputSchema` — **not** a
loosened version of the entity schema, a genuinely separate client-side
type that gets converted back to `RenewalInput`'s shape at the submit
boundary:

```ts
// src/modules/life-admin/components/renewal-form/renewal-wizard-schema.ts
import { z } from "zod";
import { renewalTypeSchema, renewalRecurrenceSchema } from "../../entities/renewal";
import { visibilitySchemaFields, refineVisibility } from "@/lib/household/visibility";

export const renewalWizardFormSchema = z
  .object({
    title: z.string().min(1).max(200),
    type: renewalTypeSchema,
    provider: z.string().max(120).optional(),
    purchaseOrIssueDate: z.date().optional(),
    expiryDate: z.date(),
    // { days } objects, not bare numbers — react-hook-form's useFieldArray
    // requirement, see the note on create-renewal-wizard.tsx below.
    reminderOffsetsDays: z.array(z.object({ days: z.number().int().min(0) })).min(1, "Add at least one reminder."),
    recurrence: renewalRecurrenceSchema,
    responsibleMemberId: z.string().cuid().optional(),
    providerContactId: z.string().cuid().optional(),
    ...visibilitySchemaFields,
  })
  .superRefine(refineVisibility);

export type RenewalWizardValues = z.infer<typeof renewalWizardFormSchema>;
```

**The wizard component** — one shared `useForm()` instance, a local
`stepIndex`, and `form.trigger()` scoped to the current step's fields:

```tsx
// src/modules/life-admin/components/renewal-form/create-renewal-wizard.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { RENEWAL_STEP_FIELDS } from "../../entities/renewal";
import { renewalWizardFormSchema, type RenewalWizardValues } from "./renewal-wizard-schema";
import { createRenewal } from "../../actions/create-renewal";
import { RenewalDetailsStep } from "./renewal-details-step";
import { RenewalRemindersStep } from "./renewal-reminders-step";

const STEPS = ["details", "reminders"] as const;

export function CreateRenewalWizard({
  members, contacts, defaultReminderOffsetsDays, onDone,
}: {
  members: { id: string; displayName: string }[];
  contacts: { id: string; name: string }[];
  defaultReminderOffsetsDays: number[]; // household-level default, plan.md §9 Q26
  onDone: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];

  const form = useForm<RenewalWizardValues>({
    resolver: zodResolver(renewalWizardFormSchema),
    defaultValues: {
      type: "other",
      recurrence: "none",
      visibility: "household",
      reminderOffsetsDays: defaultReminderOffsetsDays.map((days) => ({ days })),
    },
  });

  async function goNext() {
    // One form instance, one schema — trigger() just narrows which fields
    // get checked before advancing. This is the entire "multi-step" trick;
    // nothing about validation or submission is duplicated per step.
    const valid = await form.trigger(RENEWAL_STEP_FIELDS[step] as any);
    if (valid) setStepIndex((i) => i + 1);
  }

  async function onSubmit(values: RenewalWizardValues) {
    try {
      // Convert the form-only { days } shape back to RenewalInput's plain
      // number[] — this call is where the real, canonical renewalInputSchema
      // (entities/renewal.ts) validates the request, same as every other
      // form in this doc. The wizard's own schema is a UI convenience, not
      // the wire contract.
      await createRenewal({ ...values, reminderOffsetsDays: values.reminderOffsetsDays.map((r) => r.days) });
      onDone();
    } catch (err) {
      form.setError("root", { message: err instanceof Error ? err.message : "Something went wrong." });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <ol className="flex gap-4 text-sm text-muted-foreground">
          <li className={step === "details" ? "font-medium text-foreground" : ""}>1. Details</li>
          <li className={step === "reminders" ? "font-medium text-foreground" : ""}>2. Reminders</li>
        </ol>

        {step === "details" && <RenewalDetailsStep members={members} contacts={contacts} />}
        {step === "reminders" && <RenewalRemindersStep />}

        {form.formState.errors.root && (
          <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
        )}

        <div className="flex justify-between">
          {stepIndex > 0
            ? <Button type="button" variant="outline" onClick={() => setStepIndex((i) => i - 1)}>Back</Button>
            : <span />}
          {step !== STEPS[STEPS.length - 1]
            ? <Button type="button" onClick={goNext}>Next</Button>
            : <Button type="submit" disabled={form.formState.isSubmitting}>Save renewal</Button>}
        </div>
      </form>
    </Form>
  );
}
```

**The reminders step**, showing the array-field UI (`useFieldArray`) and
the recurrence `Select`:

```tsx
// src/modules/life-admin/components/renewal-form/renewal-reminders-step.tsx
"use client";

import { useFieldArray, useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormItem, FormControl, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { renewalRecurrenceSchema } from "../../entities/renewal";
import type { RenewalWizardValues } from "./renewal-wizard-schema";

export function RenewalRemindersStep() {
  const form = useFormContext<RenewalWizardValues>();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "reminderOffsetsDays" });

  return (
    <div className="space-y-4">
      <FormLabel>Remind this many days before expiry</FormLabel>
      {fields.map((field, index) => (
        <div key={field.id} className="flex items-center gap-2">
          <FormField
            control={form.control}
            name={`reminderOffsetsDays.${index}.days`}
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input type="number" min={0} {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="button" variant="ghost" onClick={() => remove(index)} disabled={fields.length === 1}>
            Remove
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => append({ days: 30 })}>
        Add another reminder
      </Button>

      <FormField control={form.control} name="recurrence" render={({ field }) => (
        <FormItem>
          <FormLabel>Recurs</FormLabel>
          <Select onValueChange={field.onChange} defaultValue={field.value}>
            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
            <SelectContent>
              {renewalRecurrenceSchema.options.map((v) => (
                <SelectItem key={v} value={v}>{v.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormItem>
      )} />
    </div>
  );
}
```

`RenewalDetailsStep` (step 1) is omitted in full here since every field in
it — `title`, `type` (`Select`), `provider` (`Input`), `purchaseOrIssueDate`/
`expiryDate` (`DateField`, §4.2), `responsibleMemberId` (a member `Select`,
same "unassigned sentinel" trick as §4.5), `providerContactId` (a `Select`
over `getVisibleContacts()`'s results), and `<VisibilityField members={members} />`
— reuses exactly the field shapes already fully worked out in §4.5 and §3.3.
Copy those, don't re-derive them.

**When to reach for this pattern:** a form needs a wizard when it has a
field group that's independently complex enough to want its own screen
real estate (a dynamic array, a sub-form, an upload step) *and* splitting
it doesn't lose anything — the underlying contract is still one schema, one
action. Don't reach for a wizard just because a form has "a lot of fields"
in the aggregate; `Task`'s form in §4 already has seven fields plus sharing
and stays single-step because none of them individually warrant more room.

### 6.3 Not a form at all

Drag-and-drop reordering (Kanban's `boardPosition`, `ShoppingListItem.sortOrder`),
inline table-cell edits, and bulk actions on a selected set of rows aren't
covered by this doc — they call a Server Action directly from a drag-end
handler or a row's own control, the same way §6.1's toggle does, just with
richer client state around *when* to call it. If a task description says
"add drag-and-drop reordering," this doc isn't the one to follow; there is
no `zod` schema or `react-hook-form` instance involved.

---

## 7. Testing forms

Per `CLAUDE.md` rule 4 and `docs/testing.md`, every Server Action behind a
form ships with a happy-path and a rejected-path test in the same commit
(§4.7's `create-task.test.ts` is the template). On top of that, a form
component earns its own test when it has logic beyond "renders fields, calls
an action" — a conditional field (`VisibilityField`'s member picker only
appearing for `specific_members`), a `.refine()`/`.superRefine()` whose
error needs to surface on the right field, or step-gating in a wizard
(assert `goNext()` doesn't advance past an invalid step, and does past a
valid one). Don't write a component test that just re-asserts `zod`'s own
behavior (e.g. "rejects an empty title") — that belongs in the schema's own
test or the Server Action's rejected-path test; a form component test earns
its keep by covering something only the component itself does.

---

## 8. Checklist

**New form for an entity that already has a Prisma model + `zod` schema:**
1. Extend `entities/<entity>.ts`'s schema if any field is missing; spread
   `visibilitySchemaFields` + `.superRefine(refineVisibility)` if the entity
   has a `visibility` column (§3.1).
2. Write/confirm `create-<entity>.ts` (and `update-<entity>.ts`):
   `requireMember()` → `.parse()` → `prisma.<entity>.create/update` (every
   field explicit in `data: {}` — §5 step 2's warning) →
   `syncObjectShares()` if `specific_members` → emit events per `plan.md` →
   `revalidatePath()`.
3. Write the query functions the form's dropdowns need; call them from the
   **page**, pass results down as props.
4. Build `<Entity>Form` — `useForm({ resolver: zodResolver(...) })`,
   shadcn `Form` primitives, `<VisibilityField>` if applicable, a root-error
   `<p>` per §4.5's convention.
5. Wire a `Dialog` trigger (or reuse the form for both create and edit via
   an optional `<entity>` prop, same as `TaskForm`/`ContactForm`).
6. Tests: Server Action happy + rejected path; component test only if the
   form has logic beyond field-rendering (§7).
7. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — add
   `pnpm prisma migrate dev --name <change>` first if step 1 needed a new
   column.

**Before reaching for the full recipe, check:**
- Is this really one field with no validation beyond a role check? → §6.1,
  skip `react-hook-form` entirely.
- Does one field group need its own screen (a dynamic array, an upload
  step) while everything else stays a single schema/single action? → §6.2,
  a wizard over one `useForm()` instance.
- Is this a drag/reorder/inline-edit interaction rather than a
  create-or-update-a-record flow? → §6.3, not this doc.
