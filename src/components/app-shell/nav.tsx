import { prisma } from "@/lib/db";
import { NavLinks } from "./nav-links";

// Cross-module composite (docs/project-structure.md §8): a module plugs
// into the nav purely by seeding a `navigation_item` ModuleSurfaceRegistration
// row (docs/module-architecture.md §9) — this file never hardcodes a
// per-module link (CLAUDE.md rule 3). Rendering (icons, active-route
// highlighting, the mobile fade-scroll affordance) lives in `NavLinks`, a
// Client Component — this file stays a plain async Server Component doing
// the same query it always has.
export async function Nav() {
  const items = await prisma.moduleSurfaceRegistration.findMany({
    where: { surface: "navigation_item", enabled: true, module: { status: "active" } },
    orderBy: { sortOrder: "asc" },
  });

  return <NavLinks items={items} />;
}
