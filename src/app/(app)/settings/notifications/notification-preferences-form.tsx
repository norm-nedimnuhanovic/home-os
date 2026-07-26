"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { updateNotificationPreference } from "@/lib/notifications/actions/update-preferences";

type Category = {
  categoryKey: string;
  label: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  digestEnabled: boolean;
};

type Field = "emailEnabled" | "inAppEnabled" | "digestEnabled";

export function NotificationPreferencesForm({ categories }: { categories: Category[] }) {
  const [rows, setRows] = useState(categories);
  const { run } = useActionFeedback();

  function toggle(categoryKey: string, field: Field, value: boolean) {
    const next = rows.map((row) => (row.categoryKey === categoryKey ? { ...row, [field]: value } : row));
    setRows(next);

    const updated = next.find((row) => row.categoryKey === categoryKey);
    if (!updated) return;
    // Silent on success — this is a grid of switches, a toast on every
    // single flip would be noise. Wrapped in run() purely so a failure
    // (previously swallowed entirely, no try/catch at all) now surfaces.
    run(() =>
      updateNotificationPreference({
        categoryKey: updated.categoryKey,
        emailEnabled: updated.emailEnabled,
        inAppEnabled: updated.inAppEnabled,
        digestEnabled: updated.digestEnabled,
      }),
    );
  }

  if (rows.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-medium">Notification preferences</h2>
        <p className="text-sm text-muted-foreground">No notification categories registered yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-medium">Notification preferences</h2>
      {/* Right-edge fade (viewports below the table's own min-width only)
          hints there's more to scroll — without it, the Digest column is
          clipped off-screen on a phone with no visual affordance at all,
          caught via actual mobile browser testing. */}
      <div className="overflow-x-auto rounded-lg border [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] sm:[mask-image:none]">
        <div className="grid min-w-[420px] grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b p-3 text-xs font-medium text-muted-foreground">
          <span>Category</span>
          <span>Email</span>
          <span>In-app</span>
          <span>Digest</span>
        </div>
        {rows.map((row) => (
          <div
            key={row.categoryKey}
            className="grid min-w-[420px] grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b p-3 last:border-b-0"
          >
            <span className="text-sm">{row.label}</span>
            <Switch checked={row.emailEnabled} onCheckedChange={(value) => toggle(row.categoryKey, "emailEnabled", value)} />
            <Switch checked={row.inAppEnabled} onCheckedChange={(value) => toggle(row.categoryKey, "inAppEnabled", value)} />
            <Switch checked={row.digestEnabled} onCheckedChange={(value) => toggle(row.categoryKey, "digestEnabled", value)} />
          </div>
        ))}
      </div>
    </div>
  );
}
