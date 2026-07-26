"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { SubscriptionForm } from "./subscription-form";
import { pauseSubscription } from "../actions/pause-subscription";
import { resumeSubscription } from "../actions/resume-subscription";
import { cancelSubscription } from "../actions/cancel-subscription";
import { markSubscriptionPaid } from "../actions/mark-subscription-paid";
import type { Subscription } from "@prisma/client";

type MemberOption = { id: string; displayName: string };
type CategoryOption = { id: string; name: string };

export function SubscriptionRowActions({
  subscription,
  members,
  categories,
  actingMemberId,
}: {
  subscription: Subscription;
  members: MemberOption[];
  categories: CategoryOption[];
  actingMemberId: string;
}) {
  const { isPending, run } = useActionFeedback();
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const cancelled = subscription.status === "cancelled";

  return (
    <div className="flex flex-wrap gap-2">
      {subscription.status === "active" && (
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => run(() => markSubscriptionPaid(subscription.id), "Subscription marked as paid")}
        >
          Mark paid
        </Button>
      )}
      {!cancelled && (
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() =>
            subscription.status === "paused"
              ? run(() => resumeSubscription(subscription.id), "Subscription resumed")
              : run(() => pauseSubscription(subscription.id), "Subscription paused")
          }
        >
          {subscription.status === "paused" ? "Resume" : "Pause"}
        </Button>
      )}
      <Button variant="outline" size="sm" disabled={cancelled} onClick={() => setEditOpen(true)}>
        Edit
      </Button>
      {!cancelled && (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setCancelOpen(true)}
        >
          Cancel
        </Button>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
          <DialogHeader>
            <DialogTitle>Edit subscription</DialogTitle>
          </DialogHeader>
          <SubscriptionForm
            subscription={subscription}
            members={members}
            categories={categories}
            actingMemberId={actingMemberId}
            onDone={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel subscription"
        description={`"${subscription.name}" will be cancelled and stop generating due-date reminders. This cannot be undone.`}
        confirmLabel="Cancel subscription"
        successMessage="Subscription cancelled"
        onConfirm={() => cancelSubscription(subscription.id)}
      />
    </div>
  );
}
