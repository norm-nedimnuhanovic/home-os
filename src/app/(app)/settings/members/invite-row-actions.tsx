"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resendInvite } from "./actions";

export function InviteRowActions({ inviteId }: { inviteId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function resend() {
    setError(null);
    setSent(false);
    const result = await resendInvite(inviteId);
    if (!result.success) setError(result.error ?? "Something went wrong.");
    else setSent(true);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" disabled={isPending} onClick={() => startTransition(resend)}>
        {isPending ? "Sending…" : "Resend"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {sent && !error && <p className="text-xs text-muted-foreground">Sent</p>}
    </div>
  );
}
