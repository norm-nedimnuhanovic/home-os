# Auth

How Home OS authenticates people, links a Supabase Auth identity to a
domain-level `Member` row, and hands every Server Component/Server Action a
`{ member, household }` pair to build authorization on top of.

**Scope of this document:** login, session, signup, invite acceptance,
password reset, and "who is making this request." It stops at producing the
current `Member` (with its `role` and `household`). What a given `role` or
`visibility` value is allowed to do is
[`docs/access-control.md`](./access-control.md)'s job, built directly on the
`requireMember()` primitive defined here. Do not duplicate role-check logic
in this layer.

**Provider:** Supabase Auth. Not NextAuth, not Clerk, not a hand-rolled
session table — Supabase is already the Postgres + Storage provider (see
`docs/orm-conventions.md` and the root stack decision), so Auth comes from the
same project. There is no reason to introduce a second identity provider.

---

## 1. Two identities, one link field

Every person has two records that must stay in lockstep:

| Where | What it owns |
|---|---|
| Supabase `auth.users` | Credentials: hashed password, email confirmation state, recovery tokens, MFA (if ever enabled), session/refresh tokens. Opaque to our code — we never read or write `auth.users` directly except through the Supabase client SDKs. |
| Prisma `Member` (Postgres, our schema) | Everything domain-shaped: `householdId`, `displayName`, `email`, `role`, `status`, `avatarUrl`, `colorTag`, `emailVerifiedAt`, `joinedAt`, `lastLoginAt`. This is the row every other module's `assigneeId` / `createdById` / `authorMemberId` / etc. points at.

The plan's domain model (`plan.md` §3.1) deliberately leaves credential
mechanics out of scope ("a platform Auth capability … assumed to exist
alongside these"). This doc is that capability, and the one thing it adds on
top of the plan's `Member` fields is the link column:

```prisma
model Member {
  id              String       @id @default(cuid())
  householdId     String
  household       Household    @relation(fields: [householdId], references: [id])
  supabaseUserId  String       @unique // 1:1 with auth.users.id — the ONLY auth linkage
  displayName     String
  email           String
  role            MemberRole   @default(member)   // owner | admin | member
  status          MemberStatus @default(active)   // active | suspended | removed
  avatarUrl       String?
  colorTag        String?
  emailVerifiedAt DateTime?
  joinedAt        DateTime     @default(now())
  lastLoginAt     DateTime?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  @@unique([householdId, email]) // "unique within a household" per plan §2.4
  @@index([householdId])
}

enum MemberRole   { owner admin member }
enum MemberStatus { active suspended removed }
```

**Never store `displayName`, `avatarUrl`, `role`, etc. in Supabase
`user_metadata`.** `Member` is the single source of truth for anything a
Server Component renders or an authorization check reads. `user_metadata` is
not queryable from Prisma and would create a second place these fields could
drift out of sync.

A useful side effect worth knowing about: Supabase Auth enforces a **globally
unique email per project** in `auth.users`. That happens to be exactly the
constraint Home OS wants — the plan explicitly puts "no multi-household
login" out of scope for V1 — so a real person can never end up as a `Member`
of two households under the same email; Supabase rejects the second signup
before our code has to. The `@@unique([householdId, email])` constraint above
is a separate, narrower guarantee (used by Invite creation to reject inviting
an email that's already an active member of *this* household); it is not what
prevents the multi-household case.

---

## 2. Setup

### 2.1 Packages

```bash
pnpm add @supabase/supabase-js @supabase/ssr
```

### 2.2 Environment variables

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>       # server-only, never NEXT_PUBLIC_*
NEXT_PUBLIC_SITE_URL=http://localhost:3000          # https://home-os.vercel.app in prod

# Prisma, via Supabase's connection pooler
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

```prisma
// prisma/schema.prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL") // pooled (6543) — used at runtime
  directUrl = env("DIRECT_URL")   // direct (5432) — used by `prisma migrate`
}
```

`SUPABASE_SERVICE_ROLE_KEY` bypasses every Supabase permission check and can
create/ban/delete `auth.users` rows directly. It is read only from
`lib/supabase/admin.ts` (§3.4) and must never be imported by anything that
could end up in a Client Component bundle.

### 2.3 Supabase Dashboard configuration

1. **Authentication → Providers → Email**: enabled, "Confirm email" **ON**.
   This applies to the self-serve household-creation signup (§4). Invited
   members bypass it entirely (§5) because the Invite link itself already
   proved they own that inbox.
2. **Authentication → SMTP Settings**: enable custom SMTP and point it at
   Resend, so Supabase's own auth emails (confirmation, password recovery)
   are delivered by the same provider as every other Home OS email:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: your `RESEND_API_KEY`
   - Sender: `Home OS <noreply@yourdomain.com>` (a domain verified in Resend)
3. **Authentication → URL Configuration**:
   - Site URL: `NEXT_PUBLIC_SITE_URL` value for that environment.
   - Redirect URLs: `http://localhost:3000/api/auth/callback`,
     `https://home-os.vercel.app/api/auth/callback`, plus your Vercel preview
     wildcard if previews need to test auth.
4. **Authentication → Email Templates**: point "Confirm signup" and "Reset
   password" at our own callback route instead of Supabase's hosted
   confirmation page, so we control the redirect and can update `Member`
   ourselves:
   ```html
   <!-- Confirm signup template -->
   <a href="{{ .SiteURL }}/api/auth/callback?token_hash={{ .TokenHash }}&type=signup&next=/dashboard">
     Confirm your email
   </a>

   <!-- Reset password template -->
   <a href="{{ .SiteURL }}/api/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password/update">
     Reset your password
   </a>
   ```

---

## 3. Supabase client helpers

Three clients, three files, three distinct trust levels. Don't merge them.

### 3.1 Browser client — `lib/supabase/client.ts`

Used only from Client Components (e.g. the "sign in with the password you
just set" step after invite acceptance, §5).

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### 3.2 Server client — `lib/supabase/server.ts`

Used from Server Components, Server Actions, and Route Handlers — anywhere
`next/headers` cookies are available.

```ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies(); // Next.js 15: cookies() is async

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component render, which can't set
            // cookies. Safe to ignore — middleware.ts (§3.5) refreshes the
            // session cookie on every navigation anyway.
          }
        },
      },
    }
  );
}
```

### 3.3 Admin client — `lib/supabase/admin.ts`

Service-role, server-only. The **only** legitimate uses in this codebase are:
creating a pre-confirmed `auth.users` row on invite acceptance (§5), and
banning/unbanning a user when `Member.status` changes (§7).

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

export function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

### 3.4 Middleware — `middleware.ts` (project root)

Server Components can't write cookies, so the access token would never get
refreshed without this. Every request passes through it first.

```ts
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes the session if the access token is expired. Required — do not
  // remove even though the return value looks unused.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

---

## 4. Signup: creating a new household (first owner)

This is the *only* self-serve entry point in Home OS — there is no public
join link for existing households (plan §2.3). It maps to plan §2.1: "A
household is created directly by its first user … that single action creates
one Household record and one Member record with `role = owner`."

Route: `app/(auth)/signup/page.tsx` → posts to a Server Action.

```ts
// app/(auth)/actions.ts
"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(80),
  householdName: z.string().min(2).max(80),
  timezone: z.string().min(1), // IANA id, e.g. from Intl.DateTimeFormat().resolvedOptions().timeZone on the client
  baseCurrency: z.string().length(3), // ISO 4217, e.g. "USD"
});

export async function signUpAndCreateHousehold(formData: FormData) {
  const parsed = signUpSchema.parse(Object.fromEntries(formData));
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.email,
    password: parsed.password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/callback?next=/dashboard`,
    },
  });

  if (error || !data.user) {
    return { error: error?.message ?? "Could not create account." };
  }

  // Household + owner Member are created immediately — signUp() already
  // returns a stable auth.users id even though the email isn't confirmed
  // yet. We do NOT wait for confirmation to create these rows; we only wait
  // for confirmation to set emailVerifiedAt and allow sign-in (Supabase
  // itself blocks signInWithPassword until the email is confirmed, since
  // "Confirm email" is ON — see §2.3).
  await prisma.$transaction(async (tx) => {
    const household = await tx.household.create({
      data: {
        name: parsed.householdName,
        timezone: parsed.timezone,
        baseCurrency: parsed.baseCurrency,
      },
    });

    await tx.member.create({
      data: {
        householdId: household.id,
        supabaseUserId: data.user!.id,
        displayName: parsed.displayName,
        email: parsed.email,
        role: "owner",
        status: "active",
      },
    });
  });

  return { success: true, message: "Check your email to confirm your account." };
}
```

**Known edge case — orphaned auth user.** If the Prisma transaction throws
after `supabase.auth.signUp()` already succeeded (e.g. a DB blip), the
`auth.users` row exists with no matching `Member`. `requireMember()` (§6)
treats "authenticated but no `Member` row" as a hard error state, not as "go
create a household" — it must never silently spin up a second household for
an already-existing auth user. Surface a "something went wrong finishing
your signup, contact support" screen; don't retry automatically.

### 4.1 Confirmation callback — `app/api/auth/callback/route.ts`

Handles both the signup-confirmation link and the password-recovery link
(§8), since both use the `token_hash` + `type` pattern configured in §2.3.

```ts
import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { prismaAuthBootstrap } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  if (token_hash && type) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (!error) {
      if (type === "signup") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          // prismaAuthBootstrap — see §6's note; householdId isn't known here.
          await prismaAuthBootstrap.member.updateMany({
            where: { supabaseUserId: user.id },
            data: { emailVerifiedAt: new Date() },
          });
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-error`);
}
```

---

## 5. Invite acceptance: joining an existing household

Maps to plan §2.3 and the `Invite` entity (`plan.md` §3.1). By the time this
flow runs, the `Invite` row already exists (created by an owner/admin from
the household members screen via `inviteMember()`,
`src/app/(app)/settings/members/actions.ts`) and its email has already been
sent — directly via `sendHouseholdInviteEmail()`
(`src/lib/email/send-category-email.tsx`), not through the standard
`NotificationPreference`-gated pipeline docs/email.md §2 describes for every
other category, since the invitee has no `Member` row yet to gate against.
**Auth's job starts at the click.**

Route: `app/(auth)/invite/[token]/page.tsx` — server-renders the invite
(reject up front if `status !== "pending"` or `expiresAt < now`, via
`getInviteByToken()` below), then a Client Component form
(`accept-invite-form.tsx`) posts to a Server Action.

Both `getInviteByToken()` and `acceptInvite()`'s initial lookup use
`prismaAuthBootstrap` (`@/lib/db`), not the tenant-guarded `prisma` — the
whole point of resolving a token is to discover which household it belongs
to, so `householdId` can't be in the `where` yet. Safe because `Invite.token`
is globally `@unique`, the same justification `prismaAuthBootstrap`'s own
doc comment already gives for `Member.supabaseUserId` at login. Once the
invite is resolved, `invite.householdId` is known, so the transaction's
`invite.update` scopes normally, like every other query in the codebase:

```ts
// app/(auth)/actions.ts
"use server";

export async function getInviteByToken(token: string) {
  const invite = await prismaAuthBootstrap.invite.findUnique({
    where: { token },
    include: { household: true, invitedByMember: true },
  });
  if (!invite || invite.status !== "pending" || invite.expiresAt < new Date()) return null;
  return invite;
}

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  displayName: z.string().min(1).max(80),
  password: z.string().min(8),
});

export async function acceptInvite(formData: FormData) {
  const parsed = acceptInviteSchema.parse(Object.fromEntries(formData));

  const invite = await prismaAuthBootstrap.invite.findUnique({ where: { token: parsed.token } });

  if (!invite || invite.status !== "pending" || invite.expiresAt < new Date()) {
    return { error: "This invite is no longer valid. Ask an admin to resend it." };
  }

  const admin = createAdminSupabaseClient();

  // email_confirm: true — the Invite link, delivered to invite.email
  // directly (not through NotificationPreference — see above), is itself
  // the proof of inbox ownership. We deliberately do NOT send a second
  // Supabase confirmation email on top of it.
  const { data, error } = await admin.auth.admin.createUser({
    email: invite.email,
    password: parsed.password,
    email_confirm: true,
  });

  if (error || !data.user) {
    if (error?.message.includes("already been registered")) {
      return {
        error:
          "An account already exists for this email address. Multi-household accounts aren't supported yet.",
      };
    }
    return { error: error?.message ?? "Could not create account." };
  }

  await prisma.$transaction(async (tx) => {
    const member = await tx.member.create({
      data: {
        householdId: invite.householdId,
        supabaseUserId: data.user!.id,
        displayName: parsed.displayName,
        email: invite.email,
        role: invite.role, // "admin" | "member" — never "owner" (plan §2.3)
        status: "active",
        emailVerifiedAt: new Date(),
        joinedAt: new Date(),
      },
    });

    // householdId is known by this point (from the invite fetched above),
    // so this update goes through the regular tenant-guarded `prisma` — no
    // bypass needed here, unlike the initial token lookup.
    await tx.invite.update({
      where: { id: invite.id, householdId: invite.householdId },
      data: { status: "accepted", acceptedAt: new Date(), acceptedByMemberId: member.id },
    });
  });

  return { success: true };
}
```

`admin.auth.admin.createUser()` does **not** establish a session — it's a
privileged, session-less call. After the Server Action returns success, the
invite-acceptance page (a Client Component at this point) signs the user in
itself with the password they just typed, which is what actually sets the
session cookie:

```ts
"use client";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

async function onAcceptSuccess(email: string, password: string) {
  const supabase = createBrowserSupabaseClient();
  await supabase.auth.signInWithPassword({ email, password });
  router.push("/dashboard");
}
```

---

## 6. Reading the current Member — the one function everything else builds on

`lib/auth/session.ts`:

```ts
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { prismaAuthBootstrap } from "@/lib/db";

export const requireMember = cache(async () => {
  const supabase = await createServerSupabaseClient();

  // ALWAYS getUser(), NEVER getSession(), on the server. getSession() reads
  // the JWT out of the cookie without contacting Supabase Auth — it can be
  // spoofed by anything that can write cookies. getUser() revalidates
  // against Supabase's server on every call. This is the one rule in this
  // document with zero exceptions.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // prismaAuthBootstrap, not the guarded prisma singleton — this is the
  // query that resolves householdId in the first place, so it can't supply
  // one itself. Safe only because supabaseUserId is globally @unique; see
  // docs/orm-conventions.md §3.2. Never copy this pattern elsewhere.
  const member = await prismaAuthBootstrap.member.findUnique({
    where: { supabaseUserId: user.id },
    include: { household: true },
  });

  // status !== "active" (suspended/removed) is treated as logged out here,
  // as defense in depth on top of the Supabase-level ban in §7 — don't rely
  // on the ban alone.
  if (!member || member.status !== "active") return null;

  return member; // { id, householdId, role, displayName, ..., household: Household }
});
```

`cache()` from `react` memoizes this per request, so calling it from ten
different Server Components on the same page tree costs one `auth.getUser()`
round trip and one Prisma query, not ten.

Usage in a Server Component:

```tsx
// app/(app)/dashboard/page.tsx
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export default async function DashboardPage() {
  const member = await requireMember();
  if (!member) redirect("/login");

  const tasks = await prisma.task.findMany({
    where: { householdId: member.householdId, completedAt: null },
    orderBy: { dueDate: "asc" },
  });

  return <TodayView member={member} tasks={tasks} />;
}
```

Usage in a Server Action that needs to know *who* is acting (e.g. creating a
Task):

```ts
"use server";
export async function createTask(formData: FormData) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  await prisma.task.create({
    data: {
      householdId: member.householdId,
      createdById: member.id,
      title: String(formData.get("title")),
      // ...
    },
  });
}
```

**This is the handoff point to `docs/access-control.md`.** That doc defines
things like `requireRole(member, ["owner", "admin"])` and the `visibility`
resolution helpers (`private | household | specific_members`) — both take
the `member` object returned here (specifically `.id`, `.role`,
`.householdId`) as their only input. Nothing in this file should ever encode
"can this role do X" — that's a layering violation; put it in
access-control.md instead.

> **Note on tenant isolation:** Home OS does not rely on Postgres Row Level
> Security for household isolation. Prisma connects to Supabase's Postgres
> with a single database role (via `DATABASE_URL`/`DIRECT_URL`), not through
> PostgREST with the end user's JWT, so `auth.uid()`-based RLS policies do
> not apply to Prisma queries. Every query must explicitly scope by
> `householdId: member.householdId` in application code — see
> `docs/access-control.md` and `docs/orm-conventions.md` for the enforced pattern.

---

## 7. Login, logout, and member lifecycle

### 7.1 Login

```ts
// app/(auth)/actions.ts
"use server";
import { redirect } from "next/navigation";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function login(formData: FormData) {
  const { email, password } = loginSchema.parse(Object.fromEntries(formData));
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { error: "Invalid email or password." };
  }

  // prismaAuthBootstrap — see §6's note; householdId isn't known here.
  await prismaAuthBootstrap.member.updateMany({
    where: { supabaseUserId: data.user.id },
    data: { lastLoginAt: new Date() },
  });

  redirect("/dashboard");
}
```

If `error.message` is Supabase's `"Email not confirmed"`, surface that
distinctly from "invalid credentials" so the person knows to check their
inbox rather than retype their password.

### 7.2 Logout

```ts
"use server";
export async function logout() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

### 7.3 Suspending or removing a Member

Setting `Member.status` to `suspended` or `removed` is a members-management
feature action (owner/admin only — enforced per `docs/access-control.md`),
but it has an auth-layer consequence that belongs here: ban the underlying
Supabase user too, as defense in depth on top of the `requireMember()`
status check in §6 (in case an already-issued access token is still valid
for its remaining lifetime).

```ts
const admin = createAdminSupabaseClient();

// suspend or remove:
await admin.auth.admin.updateUserById(member.supabaseUserId, { ban_duration: "876000h" }); // ~100 years

// reinstating a suspended member back to active:
await admin.auth.admin.updateUserById(member.supabaseUserId, { ban_duration: "none" });
```

Per plan §2.4, a `removed` member's `Member` row is never deleted — past
`assigneeId`/`authorMemberId`/`paidBy` references must keep resolving to
them. Only the Supabase Auth side is banned; the Prisma row stays untouched
besides its `status`.

---

## 8. Password reset

Two-step flow: request the email, then set a new password once the recovery
link has established a session.

```ts
// app/(auth)/actions.ts
"use server";

export async function requestPasswordReset(formData: FormData) {
  const email = z.string().email().parse(formData.get("email"));
  const supabase = await createServerSupabaseClient();

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/callback?type=recovery&next=/reset-password/update`,
  });

  // Always return the same message whether or not the email exists —
  // never let this endpoint be used to enumerate registered emails.
  return { success: true, message: "If that email has an account, a reset link is on its way." };
}

const updatePasswordSchema = z.object({ password: z.string().min(8) });

export async function updatePassword(formData: FormData) {
  const { password } = updatePasswordSchema.parse(Object.fromEntries(formData));
  const supabase = await createServerSupabaseClient();

  // Relies on the session already established by /api/auth/callback's
  // verifyOtp({ type: "recovery", ... }) call — no separate token handling
  // needed here.
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/dashboard");
}
```

`app/(auth)/reset-password/request/page.tsx` posts to
`requestPasswordReset`. `app/(auth)/reset-password/update/page.tsx` (the
`next` target from §2.3's recovery template, reached only after
`/api/auth/callback` has verified the recovery token and established a
session) posts to `updatePassword`.

---

## 9. Testing auth-dependent code

Don't hit real Supabase Auth from unit/integration tests. Fake the one seam
that matters — `requireMember()` — and let everything downstream (Server
Components, Server Actions, `docs/access-control.md` helpers) run against a
real Prisma `Member` row seeded directly:

```ts
// test/helpers/seed-member.ts
import { prisma } from "@/lib/db";

export async function seedMemberWithHousehold(overrides?: Partial<{ role: "owner" | "admin" | "member" }>) {
  const household = await prisma.household.create({
    data: { name: "Test Household", timezone: "Europe/Sarajevo", baseCurrency: "EUR" },
  });

  const member = await prisma.member.create({
    data: {
      householdId: household.id,
      supabaseUserId: `test-${crypto.randomUUID()}`, // never a real auth.users id
      displayName: "Test Owner",
      email: "owner@test.home-os.local",
      role: overrides?.role ?? "owner",
      status: "active",
      emailVerifiedAt: new Date(),
    },
  });

  return { household, member };
}
```

```ts
// wherever a test needs to act as a given member:
vi.mock("@/lib/auth/session", () => ({
  requireMember: vi.fn().mockResolvedValue(seededMember),
}));
```

This keeps auth entirely out of the loop for feature tests (Task creation,
visibility filtering, etc.) — those tests should be exercising Home OS logic,
not Supabase's.

---

## 10. Do / Don't

| Do | Don't |
|---|---|
| Call `supabase.auth.getUser()` server-side for any authorization decision | Trust `supabase.auth.getSession()` server-side — it's unverified |
| Treat `Member` as the only source of truth for `role`, `displayName`, `avatarUrl` | Read profile fields out of `auth.users.user_metadata` anywhere |
| Create the `Household` + owner `Member` row synchronously, in the same Server Action that calls `supabase.auth.signUp()` | Defer household creation to "on first login after confirmation" — that's how orphaned auth users happen |
| Create invited members with `email_confirm: true` via the admin client | Let Supabase send its own "confirm your email" to an already-invited address — the Invite email (via Resend) is the proof |
| Scope every Prisma query by `householdId` from `requireMember()` | Assume Postgres RLS is enforcing tenant isolation — Prisma doesn't go through PostgREST |
| Keep `lib/supabase/admin.ts` import-reachable only from Server Actions/Route Handlers | Import the admin client from anything a Client Component could pull in |
| Ban (`ban_duration`) the Supabase user when `Member.status` leaves `active` | Rely solely on app-level status checks to keep a suspended member logged out |
| Put "can this role do X" logic in `docs/access-control.md` | Encode authorization rules inside `requireMember()` or the Supabase client helpers |
