import { prisma } from "../src/lib/db";
import { seedModuleGrantsForHousehold } from "../src/lib/access/module-grants";
import { seedPlatformCatalog } from "./seed/platform";
import { resetSeedHousehold } from "./seed/reset";
import { seedHouseholdAndMembers } from "./seed/household";
import { seedTasksKanbanCalendar } from "./seed/tasks-kanban-calendar";
import { seedRemindersAndNotes } from "./seed/reminders-notes";
import { seedFinance } from "./seed/finance";
import { seedLifeAdmin } from "./seed/life-admin";
import { SEED_DEV_PASSWORD } from "./seed/constants";

// Ordering below is load-bearing, not stylistic (docs/seeding.md §10):
// 1. Platform catalog first — ModuleGrant seeding reads
//    ModulePermissionDeclaration rows that must already exist.
// 2. Reset, then Household + Members — everything else FKs to
//    household.id/owner.id/admin.id/member.id.
// 3. ModuleGrants before any domain data — matches the real app's
//    invariant that a household's grants exist from the moment it does.
// 4. Tasks/Kanban/Calendar before Reminders/Notes — seedRemindersAndNotes
//    takes tasks.boardTask to create a real NoteLink.
// 5. Finance and Life Admin last — independent of each other, but each
//    creates its own Reminder rows referencing entities that must already
//    exist.
async function main() {
  console.log("→ Platform catalog (Module / EventType / PermissionDeclaration / SurfaceRegistration)…");
  await seedPlatformCatalog();

  console.log("→ Resetting the seed household from any prior run…");
  await resetSeedHousehold();

  console.log("→ Household + 3 Members (owner/admin/member)…");
  const { household, owner, admin, member } = await seedHouseholdAndMembers();

  console.log("→ Pre-granting built-in modules' required ModuleGrant rows…");
  await seedModuleGrantsForHousehold(prisma, household.id);

  console.log("→ Tasks, Kanban, Calendar…");
  const { tasks } = await seedTasksKanbanCalendar(household, { owner, admin, member });

  console.log("→ Reminders + Notes…");
  await seedRemindersAndNotes(household, { owner, admin, member }, tasks);

  console.log("→ Finance…");
  await seedFinance(household, { owner, admin, member });

  console.log("→ Life Admin…");
  await seedLifeAdmin(household, { owner, admin, member });

  console.log(`
Seed complete — "The Rivera Household".
${
  process.env.ALLOW_DEV_SEED_AUTH_USERS === "true"
    ? `Log in locally as:
  owner  → sam@seed.local    / ${SEED_DEV_PASSWORD}
  admin  → priya@seed.local  / ${SEED_DEV_PASSWORD}
  member → jordan@seed.local / ${SEED_DEV_PASSWORD}`
    : 'ALLOW_DEV_SEED_AUTH_USERS is not "true" — Member rows exist but can\'t sign in. See docs/seeding.md §7.2.'
}
`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
