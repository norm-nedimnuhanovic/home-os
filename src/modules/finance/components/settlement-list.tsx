"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cancelSettlement } from "../actions/cancel-settlement";
import type { Settlement } from "@prisma/client";

type SettlementRow = Settlement & {
  fromMember: { displayName: string };
  toMember: { displayName: string };
};

export function SettlementList({
  settlements,
  actingMemberId,
}: {
  settlements: SettlementRow[];
  actingMemberId: string;
}) {
  const [cancelling, setCancelling] = useState<SettlementRow | null>(null);

  if (settlements.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No settlements recorded yet.
      </p>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {settlements.map((settlement) => {
          const isParty = settlement.fromMemberId === actingMemberId || settlement.toMemberId === actingMemberId;
          const cancelled = settlement.status === "cancelled";
          return (
            <li
              key={settlement.id}
              className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {settlement.fromMember.displayName} → {settlement.toMember.displayName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(settlement.date).toLocaleDateString()}
                  {settlement.method && ` · ${settlement.method}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                <Badge variant="outline">{Number(settlement.amount).toFixed(2)}</Badge>
                {cancelled && <Badge variant="secondary">Cancelled</Badge>}
                {!cancelled && isParty && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setCancelling(settlement)}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(open) => !open && setCancelling(null)}
        title="Cancel settlement"
        description={
          cancelling
            ? `This settlement between ${cancelling.fromMember.displayName} and ${cancelling.toMember.displayName} will be cancelled, and any splits it cleared will revert to unsettled.`
            : ""
        }
        confirmLabel="Cancel settlement"
        successMessage="Settlement cancelled"
        onConfirm={() => cancelSettlement(cancelling!.id)}
      />
    </>
  );
}
