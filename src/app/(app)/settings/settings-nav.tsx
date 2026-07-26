import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/members", label: "Members" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/modules", label: "Modules" },
];

export function SettingsNav({ active }: { active: "members" | "notifications" | "modules" }) {
  return (
    <div className="flex gap-2 border-b pb-2">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm hover:bg-muted",
            tab.href.endsWith(active) && "bg-muted font-medium",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
