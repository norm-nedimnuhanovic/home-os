# Home OS

A personal "home operating system" — one app that brings the whole household's
life admin together in a single place, shared between home members, with
email notifications to keep everyone in the loop.

Everything is connected: a bill can create a task, a task can show up on the
calendar, a reminder can come from anywhere — so it feels like one app, not a
folder full of separate ones.

## Features

### Dashboard
- "Today" home screen: tasks due, today's events, upcoming bills, active reminders
- Quick capture — add a task, note, or reminder from anywhere
- Search across everything in one place

### Tasks
- Create and manage tasks with due dates, priorities, and assignees
- Sub-tasks, tags, and recurring tasks
- Mark complete, see what's overdue

### Kanban
- Board view of tasks (e.g. To do / Doing / Done)
- Drag cards between columns
- Multiple boards for different areas of the household

### Calendar
- Month, week, and day views
- Tasks with due dates appear automatically
- Whole household's shared events in one view

### Reminders
- One-off and recurring reminders aimed at specific members
- Can be triggered from anywhere in the app (a bill, a renewal date, a task)
- Notify in-app and by email

### Notes
- Simple notes with tags
- Daily notes / journal space
- Link a note to a related task, bill, or event

### Finance
- Track expenses and income by category, with budgets
- Manage subscriptions and recurring bills with due dates
- Alerts before a bill is due
- Monthly summary + view of who paid / who owes

### Life Admin
- Household records: documents, warranties, renewals, contacts
- Renewal/expiry dates trigger reminders automatically
- Shared shopping and household lists

## Sharing & Household

- Everyone in the home can be added as a member
- Choose what's private, shared with the whole home, or shared with specific people
- Assign tasks and reminders to members
- Changes made by one member show up for everyone

## Email Notifications

- Emails for what matters: reminder firing, task assigned, bill due, something shared
- Each member controls which categories they get by email
- Optional daily/weekly digest
- Easy to toggle any category on or off

## Extensibility — Building New Apps

The whole system is a platform. The built-in apps above are just the first
ones installed on it — anyone (or any agent) should be able to build a new
app that plugs in and immediately works alongside the rest.

Guiding principles:

1. **New apps are first-class citizens** — installed the same way as built-in
   apps, appear everywhere (dashboard, search, command palette, navigation),
   and can be cleanly installed/removed.
2. **Build on what exists, don't duplicate it** — reuse existing data and
   shared capabilities (reminders, notifications, email, sharing, members)
   instead of rebuilding them.
3. **Apps cooperate without knowing about each other** — apps announce
   events and react to what happens elsewhere, keeping the system
   open-ended and automatable.
4. **Existing apps must be good platform citizens** — every built-in app
   exposes its data/actions/events to others, and keeps that contract stable.
5. **The household stays in control** — access is granted deliberately,
   reviewable and revocable; new apps respect the same privacy/sharing rules.

## Guiding Principles

- Everything connects — modules talk to each other, not separate silos
- Fast to add things — low friction so it actually gets used
- Household comes first — shared by default where it makes sense, private
  when it should be

## Documentation

This repo is a **harness**: at this stage it has no product-specific
feature code, only the conventions an AI coding agent (or a human) follows
to build Home OS feature-by-feature. Start here:

- **[plan.md](./plan.md)** — the approved product plan: every entity,
  field, module, and V1/V2 scope decision referenced throughout this README.
- **[ROADMAP.md](./ROADMAP.md)** — the order modules get built in, and
  what's already shipped.
- **[CLAUDE.md](./CLAUDE.md)** — orientation and non-negotiable rules for
  Claude Code (or any coding agent) working in this repo.
- **[AGENTS.md](./AGENTS.md)** — the project structure map ("where does X
  go") and the step-by-step checklist for building a new (9th+) module on
  the platform described above.
- **[docs/](./docs)** — one file per convention (data model, auth, forms,
  sharing/visibility, module architecture, testing, verification, etc.) —
  see the index in `CLAUDE.md`.

## Tech Stack

Home OS is a single full-stack TypeScript app — one Next.js project, one
deployable service, no separate backend.

| Layer | Choice |
|---|---|
| Language | TypeScript |
| Framework | Next.js 15 (App Router — React Server Components + Server Actions) |
| UI | React, Tailwind CSS, shadcn/ui (Radix primitives, copied into `src/components/ui` and customized) |
| Database | PostgreSQL |
| ORM | Prisma (single `prisma/schema.prisma` file — every module's models live in it, see `docs/orm-conventions.md`) |
| Infra | Supabase — one provider bundling Postgres, Auth, and file Storage |
| Email | Resend — real transactional email from V1 (not simulated/logged) |
| Hosting | Vercel |
| Background jobs | Vercel Cron hitting `src/app/api/cron/*` routes (no long-running server process in V1) |
| Real-time sync | None — refresh/refetch and polling only, no websockets (locked decision) |
| Component docs | No Storybook in V1 — shadcn/ui ships consistent, self-documenting components; revisit only if a large bespoke component library emerges |

See [AGENTS.md](./AGENTS.md) for how this stack maps onto folders, and
`docs/` for the conventions layered on top of it (auth, forms, data access,
testing, etc.).

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+ (`corepack enable` gives you this)
- A [Supabase](https://supabase.com/dashboard) project (the free tier is enough for local dev)
- A [Resend](https://resend.com) account and API key

### 1. Clone and install

```bash
git clone https://github.com/<your-username>/home-os.git
cd home-os
pnpm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

| Variable | Where it comes from | Used for |
|---|---|---|
| `DATABASE_URL` | Supabase → Project Settings → Database → connection string (pooled, port 6543, `?pgbouncer=true`) | Prisma Client at runtime |
| `DIRECT_URL` | Supabase → Project Settings → Database → connection string (direct, port 5432) | Prisma Migrate (`migrate dev` / `migrate deploy`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Supabase client (browser + server) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API | Supabase client (browser + server, RLS-scoped) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API | Server-only privileged calls (e.g. Storage cleanup) — never expose to the client |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally; your deployed URL elsewhere | Supabase Auth email redirect links, and the deep links inside outgoing emails |
| `RESEND_API_KEY` | Resend → API Keys | Sending transactional email |
| `EMAIL_FROM` | Your verified Resend sending domain | The `from` address on every email Home OS sends |
| `EMAIL_DEV_REDIRECT_TO` | Your own inbox (optional, non-production only) | Redirects every outgoing email's envelope recipient to this address outside production — emails are still genuinely sent via Resend, never simulated/logged (see `docs/email.md` §7) |
| `CRON_SECRET` | Any random string you generate | Shared secret checked by `src/app/api/cron/*` routes so only Vercel Cron (or you, locally) can trigger them |

### 3. Set up the database

```bash
pnpm prisma migrate dev   # applies migrations, generates the Prisma client
pnpm prisma db seed       # seeds starter Categories and registers the 8
                          # built-in Modules + their registry rows
```

### 4. Provision Storage

```bash
pnpm run storage:setup   # creates the private "documents" bucket (Life Admin's
                          # Document uploads, Finance's Transaction receipts) with
                          # its file-size/MIME-type limits — see docs/upload.md §3
```

Idempotent — safe to re-run. Skip this and every `Document` upload fails
(the bucket won't exist yet).

### 5. Run it

```bash
pnpm dev
# → http://localhost:3000
```

### 6. Before you consider a change done

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

See `docs/verify.md` for the full verification checklist — this is also
enforced for any AI-agent-authored change, per [CLAUDE.md](./CLAUDE.md).

## License

MIT — see [LICENSE](./LICENSE). Home OS is a personal/household project
template; MIT keeps it simple to fork, self-host, and adapt.
