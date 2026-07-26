import Link from "next/link";
import { ChevronLeft } from "lucide-react";

// A plain server-renderable Link (no state) — safe to drop into either a
// Server Component page or a "use client" detail component, unlike most of
// src/components/app-shell/*, which assume the app-shell layout specifically.
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}
