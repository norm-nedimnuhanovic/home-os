"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListChecks,
  Kanban,
  Calendar,
  Bell,
  NotepadText,
  Wallet,
  ClipboardList,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModuleSurfaceRegistration } from "@prisma/client";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  ListChecks,
  Kanban,
  Calendar,
  Bell,
  NotepadText,
  Wallet,
  ClipboardList,
  Settings,
};

// Top-level-segment match, not exact/prefix match: a nested route
// (/kanban/[boardId]) or a sub-page under a multi-segment target
// (/settings/notifications vs. the Settings item's own /settings/members)
// both need to highlight the same top-level nav item, without hardcoding a
// per-module exception here (this file never hardcodes a per-module link,
// same rule nav.tsx documents for itself).
export function isNavItemActive(pathname: string, target: string): boolean {
  const currentTop = pathname.split("/")[1] ?? "";
  const targetTop = target.split("/")[1] ?? "";
  return currentTop !== "" && currentTop === targetTop;
}

export function NavLinks({ items }: { items: ModuleSurfaceRegistration[] }) {
  const pathname = usePathname();

  return (
    // The right-edge mask-image fade (mobile only — this row becomes a
    // vertical, non-scrolling column at sm: and up) is a visual hint that
    // there's more to scroll — without it, items past the fold (e.g.
    // Settings, sorted last) are invisible with no affordance at all,
    // caught via actual mobile browser testing once a 10th item pushed the
    // row wider than typical phone viewports.
    <div className="flex flex-row gap-1 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] sm:flex-col sm:gap-1 sm:overflow-visible sm:[mask-image:none]">
      {items.map((item) => {
        const active = isNavItemActive(pathname, item.target);
        // Nullable column, and a future typo'd icon name shouldn't ever
        // throw — degrades to icon-less (today's plain-link appearance).
        const Icon = item.icon ? ICONS[item.icon] : undefined;

        return (
          <Link
            key={item.id}
            href={item.target}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "hover:bg-sidebar-accent/50",
            )}
          >
            {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
