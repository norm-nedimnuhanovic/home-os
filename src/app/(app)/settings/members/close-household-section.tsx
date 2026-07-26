"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { closeHousehold } from "./actions";
import { logout } from "@/app/(auth)/actions";

export function CloseHouseholdSection({ householdName }: { householdName: string }) {
  const [open, setOpen] = useState(false);

  // ConfirmDialog's contract expects onConfirm to throw on failure so it
  // can display the error inline — closeHousehold() returns an
  // ActionResult instead, same adaptation as every other row-action dialog
  // in the app. On success there's nothing left to show in this session
  // (requireMember() will reject every one of this household's members on
  // their next request) — end it immediately rather than leaving the owner
  // stranded on a page they can no longer use.
  async function handleConfirm() {
    const result = await closeHousehold();
    if (!result.success) throw new Error(result.error ?? "Something went wrong.");
    await logout();
  }

  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-destructive/50 p-4">
      <h2 className="text-sm font-medium text-destructive">Danger zone</h2>
      <p className="text-sm text-muted-foreground">
        Closing &ldquo;{householdName}&rdquo; immediately signs out and permanently blocks every member. This cannot
        be undone from within the app.
      </p>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Close household
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Close this household?"
        description={`"${householdName}" will be closed immediately. Every member, including you, will be signed out and permanently lose access. This cannot be undone from within the app.`}
        confirmLabel="Close household"
        onConfirm={handleConfirm}
      />
    </div>
  );
}
