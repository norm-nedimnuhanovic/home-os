"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

// Renders after mount only — next-themes can't know the resolved theme
// during SSR (it reads localStorage/matchMedia client-side), so rendering
// the icon before mount would show the wrong one for a flash and risk a
// hydration mismatch.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button variant="outline" size="sm" className="w-full justify-start gap-2 sm:w-auto" disabled>
        <Sun className="h-4 w-4" />
        Theme
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full justify-start gap-2 sm:w-auto"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      {isDark ? "Dark" : "Light"}
    </Button>
  );
}
