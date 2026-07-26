"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { removeMember, changeMemberRole, transferOwnership } from "./actions";
import type { Member, MemberRole } from "@prisma/client";

export function MemberRowActions({
  member,
  actingMember,
}: {
  member: Member;
  actingMember: { id: string; role: MemberRole };
}) {
  const [isPending, startTransition] = useTransition();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSelf = member.id === actingMember.id;
  const canChangeRole =
    actingMember.role === "owner" || (actingMember.role === "admin" && member.role === "member");
  const canRemove =
    !isSelf && (actingMember.role === "owner" || (actingMember.role === "admin" && member.role === "member"));

  // These actions return an ActionResult ({success, error}), never throw —
  // but ConfirmDialog's contract (like every other row-action dialog in
  // the app) expects onConfirm to throw on failure, so it can catch and
  // display the error inline itself. Adapt here rather than changing
  // ConfirmDialog's contract for this one caller.
  async function callOrThrow(fn: () => Promise<{ success: boolean; error?: string }>) {
    const result = await fn();
    if (!result.success) throw new Error(result.error ?? "Something went wrong.");
  }

  async function changeRole(nextRole: MemberRole) {
    setError(null);
    const result = await changeMemberRole(member.id, nextRole);
    // changeMemberRole() returns an ActionResult, never throws — a plain
    // useActionFeedback()/try-catch wrapper would swallow a {success:false}
    // return and wrongly report success, so this stays a manual check.
    if (!result.success) setError(result.error ?? "Something went wrong.");
    else toast.success("Role updated");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
      {canChangeRole && !isSelf && member.role !== "owner" && (
        <Select
          disabled={isPending}
          defaultValue={member.role}
          onValueChange={(nextRole) => startTransition(() => changeRole(nextRole as MemberRole))}
        >
          <SelectTrigger className="h-8 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      )}
      {actingMember.role === "owner" && !isSelf && member.status === "active" && (
        <Button variant="outline" size="sm" disabled={isPending} onClick={() => setTransferOpen(true)}>
          Make owner
        </Button>
      )}
      {canRemove && (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={isPending}
          onClick={() => setRemoveOpen(true)}
        >
          Remove
        </Button>
      )}

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove member"
        description={`${member.displayName} will lose access to this household. Their existing tasks/notes/etc. stay attributed to them.`}
        confirmLabel="Remove"
        successMessage="Member removed"
        onConfirm={() => callOrThrow(() => removeMember(member.id))}
      />
      <ConfirmDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        title="Transfer ownership"
        description={`${member.displayName} becomes the owner; you become an admin. This cannot be undone by anyone but the new owner.`}
        confirmLabel="Transfer ownership"
        successMessage="Ownership transferred"
        onConfirm={() => callOrThrow(() => transferOwnership(member.id))}
      />
    </div>
  );
}
