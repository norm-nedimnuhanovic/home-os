"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { archiveShoppingList } from "../actions/archive-shopping-list";
import type { ShoppingList } from "@prisma/client";

export function ShoppingListSummaryList({ lists }: { lists: ShoppingList[] }) {
  const [isPending, startTransition] = useTransition();

  if (lists.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No shopping lists yet — create one to get started.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {lists.map((list) => (
        <li key={list.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
          <Link href={`/life-admin/shopping-lists/${list.id}`} className="min-w-0 flex-1">
            <p className="truncate font-medium">{list.name}</p>
            <Badge variant="outline" className="mt-1 text-xs">
              {list.type.replace(/_/g, " ")}
            </Badge>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => startTransition(async () => { await archiveShoppingList(list.id); })}
          >
            Archive
          </Button>
        </li>
      ))}
    </ul>
  );
}
