"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "destructive",
  successMessage,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "destructive" | "default";
  // Omit for a caller whose onConfirm already navigates/ends the session
  // (e.g. closeHousehold() + logout()) — a toast would either never render
  // or land on an unrelated page.
  successMessage?: string;
  onConfirm: () => Promise<unknown>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        await onConfirm();
        if (successMessage) toast.success(successMessage);
        onOpenChange(false);
      } catch (err) {
        // Keep the dialog open so the member can see why the guard rejected
        // it (e.g. voidTransaction's "settled splits" check) — a plain
        // thrown error with no try/catch here would just surface as an
        // unhandled rejection with nowhere in the UI to land.
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          {/* A plain Button, not <AlertDialogAction> — that auto-closes on
              click, which would hide the error message the moment a guard
              rejects the action. */}
          <Button variant={variant} onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Working…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
