import Link from "next/link";
import { prisma } from "@/lib/db";

// Cross-module composite (docs/project-structure.md §8): a module plugs
// into the nav purely by seeding a `navigation_item` ModuleSurfaceRegistration
// row (docs/module-architecture.md §9) — this file never hardcodes a
// per-module link (CLAUDE.md rule 3).
export async function Nav() {
  const items = await prisma.moduleSurfaceRegistration.findMany({
    where: { surface: "navigation_item", enabled: true, module: { status: "active" } },
    orderBy: { sortOrder: "asc" },
  });

  return (
    // The right-edge mask-image fade (mobile only — this row becomes a
    // vertical, non-scrolling column at sm: and up) is a visual hint that
    // there's more to scroll — without it, items past the fold (e.g.
    // Settings, sorted last) are invisible with no affordance at all,
    // caught via actual mobile browser testing once a 10th item pushed the
    // row wider than typical phone viewports.
    <div className="flex flex-row gap-1 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] sm:flex-col sm:gap-1 sm:overflow-visible sm:[mask-image:none]">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.target}
          className="whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-muted"
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
