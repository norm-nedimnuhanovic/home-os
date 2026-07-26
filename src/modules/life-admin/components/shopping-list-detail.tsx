"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShoppingListForm } from "./shopping-list-form";
import {
  createShoppingListItemInputSchema,
  type CreateShoppingListItemFormInput,
} from "../entities/shopping-list-item";
import { addShoppingListItem } from "../actions/add-shopping-list-item";
import { toggleShoppingListItemChecked } from "../actions/toggle-shopping-list-item-checked";
import { removeShoppingListItem } from "../actions/remove-shopping-list-item";
import type { ShoppingList, ShoppingListItem } from "@prisma/client";

type MemberOption = { id: string; displayName: string };
type ItemRow = ShoppingListItem & {
  addedBy: { displayName: string };
  checkedBy: { displayName: string } | null;
};

export function ShoppingListDetail({
  list,
  members,
}: {
  list: ShoppingList & { items: ItemRow[] };
  members: MemberOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [editingList, setEditingList] = useState(false);

  const form = useForm<CreateShoppingListItemFormInput>({
    resolver: zodResolver(createShoppingListItemInputSchema),
    defaultValues: { name: "" },
  });

  async function onAddItem(values: CreateShoppingListItemFormInput) {
    await addShoppingListItem(list.id, values);
    form.reset({ name: "" });
  }

  const unchecked = list.items.filter((item) => !item.isChecked);
  const checked = list.items.filter((item) => item.isChecked);

  function renderItem(item: ItemRow) {
    return (
      <li key={item.id} className="flex items-center gap-3 rounded-lg border p-3">
        <Checkbox
          checked={item.isChecked}
          disabled={isPending}
          onCheckedChange={(value) =>
            startTransition(async () => {
              await toggleShoppingListItemChecked(list.id, item.id, value === true);
            })
          }
          aria-label={`Mark "${item.name}" ${item.isChecked ? "unchecked" : "checked"}`}
        />
        <div className="min-w-0 flex-1">
          <p className={item.isChecked ? "truncate line-through text-muted-foreground" : "truncate"}>
            {item.name}
            {item.quantity && <span className="text-muted-foreground"> · {item.quantity}</span>}
          </p>
          {item.category && <p className="text-xs text-muted-foreground">{item.category}</p>}
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          className="shrink-0 text-destructive hover:text-destructive"
          onClick={() => startTransition(async () => { await removeShoppingListItem(list.id, item.id); })}
        >
          Remove
        </Button>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">{list.name}</h1>
        <Button variant="outline" onClick={() => setEditingList(true)} className="w-full sm:w-auto">
          Edit list
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onAddItem)} className="flex flex-col gap-2 sm:flex-row">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input placeholder="Add an item…" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={form.formState.isSubmitting} className="sm:w-auto">
            Add
          </Button>
        </form>
      </Form>

      {list.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No items yet — add the first one above.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2">{unchecked.map(renderItem)}</ul>
          {checked.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Checked off</p>
              <ul className="flex flex-col gap-2">{checked.map(renderItem)}</ul>
            </div>
          )}
        </div>
      )}

      <Dialog open={editingList} onOpenChange={setEditingList}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
          <DialogHeader>
            <DialogTitle>Edit list</DialogTitle>
          </DialogHeader>
          <ShoppingListForm list={list} members={members} onDone={() => setEditingList(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
