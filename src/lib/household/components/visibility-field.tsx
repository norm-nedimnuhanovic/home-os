"use client";

import { useFormContext } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const VISIBILITY_OPTIONS = [
  { value: "private", label: "Only me" },
  { value: "household", label: "Whole household" },
  { value: "specific_members", label: "Specific people" },
] as const;

type MemberOption = { id: string; displayName: string };

/**
 * Drop into any <Form> whose schema spread visibilitySchemaFields in
 * (docs/forms.md §3.1). Uses useFormContext() rather than taking `form` as
 * a prop, so a module's form component doesn't have to thread it through.
 */
export function VisibilityField({ members }: { members: MemberOption[] }) {
  const form = useFormContext();
  const visibility = form.watch("visibility");

  return (
    <div className="space-y-3">
      <FormField
        control={form.control}
        name="visibility"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Who can see this</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {VISIBILITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      {visibility === "specific_members" && (
        <FormField
          control={form.control}
          name="sharedWithMemberIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Shared with</FormLabel>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => {
                  const selected = (field.value ?? []).includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className="cursor-pointer"
                      onClick={() =>
                        field.onChange(
                          selected
                            ? field.value.filter((id: string) => id !== m.id)
                            : [...(field.value ?? []), m.id],
                        )
                      }
                    >
                      <Badge variant={selected ? "default" : "outline"}>{m.displayName}</Badge>
                    </button>
                  );
                })}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );
}
