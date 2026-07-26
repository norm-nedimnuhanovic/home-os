"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
// Imported directly from the action file, never through the module barrel:
// @/modules/dashboard's index.ts also re-exports searchEverything() (a
// plain function, not "use server"), which transitively imports
// life-admin's getVisibleContacts — and life-admin's own barrel, in the
// same file, also exports getDocumentDownloadUrl(), which needs
// @/lib/supabase/admin's "server-only" admin client. A client component
// importing ANYTHING from a barrel forces webpack to resolve every export
// statement in that barrel file, including sibling ones it never uses —
// so the "use server" boundary on search-action.ts only reliably protects
// the client bundle when imported straight from its own file, not via an
// aggregating barrel with heavier siblings. Confirmed by an actual `pnpm
// build` failure during Dashboard's own build — this isn't theoretical.
import { search } from "@/modules/dashboard/actions/search-action";
import type { DashboardItem } from "@/modules/dashboard/entities/dashboard-item";

const KIND_LABEL: Record<DashboardItem["kind"], string> = {
  task: "Task",
  event: "Event",
  bill: "Bill",
  reminder: "Reminder",
  note: "Note",
  contact: "Contact",
  transaction: "Transaction",
};

// Cross-entity search (plan.md §4.1), reachable from anywhere via Cmd/Ctrl+K
// or the button in the nav. Delegates to searchEverything() — see
// src/modules/dashboard/queries/search.ts for which modules are actually
// searchable and why.
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DashboardItem[]>([]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(() => {
      search(query).then(setResults);
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  function select(item: DashboardItem) {
    setOpen(false);
    setQuery("");
    router.push(item.href);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2 text-muted-foreground sm:w-auto"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" /> Search
        <kbd className="ml-auto hidden rounded border px-1 text-xs sm:inline">⌘K</kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Search tasks, notes, transactions, contacts…">
        <CommandInput placeholder="Search everything…" value={query} onValueChange={setQuery} />
        <CommandList>
          {query.trim().length >= 2 && <CommandEmpty>No results.</CommandEmpty>}
          {results.length > 0 && (
            <CommandGroup heading="Results">
              {results.map((item) => (
                <CommandItem
                  key={`${item.sourceModule}:${item.entityId}`}
                  // cmdk memoizes each item's filter value from its ref's
                  // textContent exactly once, before the DOM ref is even
                  // attached, whenever the value isn't given explicitly —
                  // with JSX children (two spans, not a plain string) that
                  // locks in an empty value forever, so the item can never
                  // match any query and never renders. A real, confirmed
                  // bug: search results always resolved server-side but
                  // never appeared in the list until this was added.
                  value={item.title}
                  onSelect={() => select(item)}
                >
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">{KIND_LABEL[item.kind]}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
