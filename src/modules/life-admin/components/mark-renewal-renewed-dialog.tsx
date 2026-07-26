"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { DateField } from "@/components/date-field";
import { markRenewedInputSchema, type MarkRenewedFormInput } from "../entities/renewal";
import { markRenewalRenewed } from "../actions/mark-renewal-renewed";

// plan.md §9 Q29: always prompt for the new expiry date — never a one-click
// auto-advance, even for a recurring renewal.
export function MarkRenewalRenewedDialog({
  renewalId,
  open,
  onOpenChange,
}: {
  renewalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm<MarkRenewedFormInput>({
    resolver: zodResolver(markRenewedInputSchema),
    defaultValues: { newExpiryDate: new Date() },
  });

  async function onSubmit(values: MarkRenewedFormInput) {
    try {
      await markRenewalRenewed(renewalId, values);
      toast.success("Renewal marked as renewed");
      onOpenChange(false);
    } catch (err) {
      form.setError("root", {
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark as renewed</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="newExpiryDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>New expiry date</FormLabel>
                  <DateField value={field.value} onChange={field.onChange} />
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.errors.root && (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            )}
            <Button type="submit" disabled={form.formState.isSubmitting} className="w-full sm:w-auto">
              Confirm renewal
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
