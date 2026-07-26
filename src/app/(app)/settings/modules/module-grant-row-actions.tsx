"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { reviewModuleGrant } from "./actions";
import type { ModuleGrant, ModulePermissionDeclaration, MemberRole } from "@prisma/client";

export function ModuleGrantRowActions({
  grant,
  actingMember,
}: {
  grant: ModuleGrant & { permissionDeclaration: ModulePermissionDeclaration };
  actingMember: { id: string; role: MemberRole };
}) {
  const [isPending, startTransition] = useTransition();
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirrors canManageModuleGrant() (src/lib/access/household-permissions.ts)
  // — kept as a plain boolean here (not the shared function itself) since
  // this is a Client Component and ActingMember carries fields no client
  // prop needs; role + the declaration's isRequired flag is all this check needs.
  const canManage = grant.permissionDeclaration.isRequired
    ? actingMember.role === "owner"
    : actingMember.role === "owner" || actingMember.role === "admin";

  if (!canManage) return null;

  async function review(decision: "granted" | "revoked") {
    setError(null);
    const result = await reviewModuleGrant(grant.permissionDeclarationId, decision);
    if (!result.success) setError(result.error ?? "Something went wrong.");
  }

  // ConfirmDialog's contract expects onConfirm to throw on failure so it can
  // display the error inline itself — reviewModuleGrant() returns an
  // ActionResult instead, same adaptation as MemberRowActions' callOrThrow.
  async function callOrThrow(fn: () => Promise<{ success: boolean; error?: string }>) {
    const result = await fn();
    if (!result.success) throw new Error(result.error ?? "Something went wrong.");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
      {grant.status === "pending_review" && (
        <>
          <Button size="sm" disabled={isPending} onClick={() => startTransition(() => review("granted"))}>
            Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => startTransition(() => review("revoked"))}
          >
            Deny
          </Button>
        </>
      )}
      {grant.status === "granted" && (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={isPending}
          onClick={() => setRevokeOpen(true)}
        >
          Revoke
        </Button>
      )}
      {grant.status === "revoked" && (
        <Button size="sm" disabled={isPending} onClick={() => startTransition(() => review("granted"))}>
          Re-grant
        </Button>
      )}

      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title="Revoke module permission"
        description={
          grant.permissionDeclaration.isRequired
            ? "This permission is required for a built-in module to function correctly. Revoking it may break that module."
            : "The module will lose this permission immediately and degrade gracefully without it."
        }
        confirmLabel="Revoke"
        onConfirm={() => callOrThrow(() => reviewModuleGrant(grant.permissionDeclarationId, "revoked"))}
      />
    </div>
  );
}
