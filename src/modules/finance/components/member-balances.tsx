"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SettlementFormDialog } from "./settlement-form-dialog";
import type { MemberBalance } from "../queries/get-member-balances";

type MemberOption = { id: string; displayName: string };

export function MemberBalances({
  balances,
  members,
}: {
  balances: MemberBalance[];
  members: MemberOption[];
}) {
  const [settling, setSettling] = useState<{ debtorId: string; creditorId: string; amount: number } | null>(null);
  const nameFor = (id: string) => members.find((m) => m.id === id)?.displayName ?? "Unknown";

  if (balances.length === 0) {
    return <p className="text-sm text-muted-foreground">Everyone is settled up.</p>;
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {balances.map((balance) => {
          // netAmount > 0 means memberA owes memberB (get-member-balances.ts)
          const [debtorId, creditorId] =
            balance.netAmount > 0 ? [balance.memberAId, balance.memberBId] : [balance.memberBId, balance.memberAId];
          const amount = Math.abs(balance.netAmount);
          return (
            <li
              key={`${balance.memberAId}:${balance.memberBId}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
            >
              <span>
                {nameFor(debtorId)} owes {nameFor(creditorId)}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{amount.toFixed(2)}</span>
                <Button variant="outline" size="sm" onClick={() => setSettling({ debtorId, creditorId, amount })}>
                  Settle up
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <SettlementFormDialog
        members={members}
        defaultFromMemberId={settling?.debtorId}
        defaultToMemberId={settling?.creditorId}
        defaultAmount={settling?.amount}
        open={!!settling}
        onOpenChange={(open) => !open && setSettling(null)}
      />
    </>
  );
}
