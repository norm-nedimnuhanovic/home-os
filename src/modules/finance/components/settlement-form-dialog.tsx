"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SettlementForm } from "./settlement-form";

type MemberOption = { id: string; displayName: string };

export function SettlementFormDialog({
  members,
  actingMemberId,
  defaultFromMemberId,
  defaultToMemberId,
  defaultAmount,
  open,
  onOpenChange,
}: {
  members: MemberOption[];
  actingMemberId?: string;
  defaultFromMemberId?: string;
  defaultToMemberId?: string;
  defaultAmount?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>Record a settlement</DialogTitle>
        </DialogHeader>
        <SettlementForm
          members={members}
          actingMemberId={actingMemberId}
          defaultFromMemberId={defaultFromMemberId}
          defaultToMemberId={defaultToMemberId}
          defaultAmount={defaultAmount}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
