"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SettlementFormDialog } from "./settlement-form-dialog";

type MemberOption = { id: string; displayName: string };

export function NewSettlementDialog({
  members,
  actingMemberId,
}: {
  members: MemberOption[];
  actingMemberId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        Record settlement
      </Button>
      <SettlementFormDialog
        members={members}
        actingMemberId={actingMemberId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
