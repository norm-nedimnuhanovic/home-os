"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RenewalForm } from "./renewal-form";
import { MarkRenewalRenewedDialog } from "./mark-renewal-renewed-dialog";
import { cancelRenewal } from "../actions/cancel-renewal";
import { getRenewalLifecycleStatus } from "../entities/renewal";
import type { Renewal } from "@prisma/client";

type MemberOption = { id: string; displayName: string };
type ContactOption = { id: string; name: string };
type RenewalRow = Renewal & { responsibleMember: { displayName: string } | null; providerContact: { name: string } | null };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "secondary",
  expiring_soon: "default",
  expired: "destructive",
  renewed: "outline",
  cancelled: "outline",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  renewed: "Renewed",
  cancelled: "Cancelled",
};

export function RenewalList({
  renewals,
  actingMemberId,
  members,
  contacts,
}: {
  renewals: RenewalRow[];
  actingMemberId: string;
  members: MemberOption[];
  contacts: ContactOption[];
}) {
  const [editing, setEditing] = useState<RenewalRow | null>(null);
  const [renewing, setRenewing] = useState<RenewalRow | null>(null);
  const [cancelling, setCancelling] = useState<RenewalRow | null>(null);

  if (renewals.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No renewals tracked yet — add one to get reminded before it expires.
      </p>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {renewals.map((renewal) => {
          const status = getRenewalLifecycleStatus(renewal);
          const canManage = renewal.createdById === actingMemberId || renewal.responsibleMemberId === actingMemberId;
          const terminal = status === "renewed" || status === "cancelled";
          return (
            <li
              key={renewal.id}
              className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{renewal.title}</p>
                <p className="text-xs text-muted-foreground">
                  {renewal.type.replace(/_/g, " ")} · Expires {new Date(renewal.expiryDate).toLocaleDateString()}
                  {renewal.responsibleMember && ` · ${renewal.responsibleMember.displayName}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{STATUS_LABEL[status]}</Badge>
                {canManage && !terminal && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setEditing(renewal)}>
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setRenewing(renewal)}>
                      Mark renewed
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setCancelling(renewal)}
                    >
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
          <DialogHeader>
            <DialogTitle>Edit renewal</DialogTitle>
          </DialogHeader>
          {editing && (
            <RenewalForm renewal={editing} members={members} contacts={contacts} onDone={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>

      {renewing && (
        <MarkRenewalRenewedDialog
          renewalId={renewing.id}
          open={!!renewing}
          onOpenChange={(open) => !open && setRenewing(null)}
        />
      )}

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(open) => !open && setCancelling(null)}
        title="Cancel renewal"
        description={
          cancelling
            ? `"${cancelling.title}" will be cancelled and stop generating reminders. This cannot be undone.`
            : ""
        }
        confirmLabel="Cancel renewal"
        onConfirm={() => cancelRenewal(cancelling!.id)}
      />
    </>
  );
}
