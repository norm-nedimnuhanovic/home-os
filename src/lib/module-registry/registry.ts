// The one file a 9th module's author touches beyond their own
// src/modules/<key>/ folder — everything else in prisma/seed/platform.ts is
// generic over this array. Once a real installer exists (out of scope for
// V1 — plan.md §7), this becomes a DB-driven list instead of a static
// import array; nothing else about seedPlatformCatalog() changes.
import * as household from "@/lib/household/module";
import * as tasks from "@/modules/tasks/module";
import * as kanban from "@/modules/kanban/module";
import * as calendar from "@/modules/calendar/module";
import * as reminders from "@/modules/reminders/module";
import * as notes from "@/modules/notes/module";
import * as finance from "@/modules/finance/module";
import * as lifeAdmin from "@/modules/life-admin/module";
import * as dashboard from "@/modules/dashboard/module";

// household first — platform substrate (src/lib/household/module.ts), not a
// user-facing module; nothing depends on it and it depends on nothing, but
// it owns household.invite_received/share.received (docs/email.md §2.1).
// tasks/reminders next — every module that depends on them (kanban,
// calendar, finance, notes, life_admin) or references their ModuleEventType
// rows (kanban's task.completed subscription) must run after them in this
// loop (docs/seeding.md §5.1).
export const ALL_MODULES = [household, tasks, reminders, kanban, calendar, notes, finance, lifeAdmin, dashboard];
