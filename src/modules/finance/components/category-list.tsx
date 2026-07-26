"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CategoryForm } from "./category-form";
import { archiveCategory } from "../actions/archive-category";
import type { Category } from "@prisma/client";

export function CategoryList({ categories }: { categories: Category[] }) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Category | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Categories</p>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              New category
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New category</DialogTitle>
            </DialogHeader>
            <CategoryForm onDone={() => setNewOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <ul className="mt-3 flex flex-wrap gap-2">
        {categories.map((category) => (
          <li key={category.id} className="flex items-center gap-1">
            <button type="button" onClick={() => setEditing(category)}>
              <Badge variant="outline">{category.name}</Badge>
            </button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1 text-xs text-muted-foreground"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await archiveCategory(category.id);
                })
              }
            >
              Archive
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit category</DialogTitle>
          </DialogHeader>
          {editing && <CategoryForm category={editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
