"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { markNotificationRead } from "@/lib/notifications/actions/mark-read";
import { markAllNotificationsRead } from "@/lib/notifications/actions/mark-all-read";
import { cn } from "@/lib/utils";
import type { Notification } from "@prisma/client";

export function NotificationBellButton({ items }: { items: Notification[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { run } = useActionFeedback();
  const unreadCount = items.filter((item) => !item.readAt).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-start gap-2 sm:w-auto">
          <Bell className="h-4 w-4" />
          Notifications
          {unreadCount > 0 && (
            <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-xs text-white sm:ml-1">
              {unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-0 p-0">
        <PopoverHeader className="flex-row items-center justify-between border-b p-3">
          <PopoverTitle>Notifications</PopoverTitle>
          {unreadCount > 0 && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => run(async () => { await markAllNotificationsRead(); router.refresh(); })}
            >
              Mark all read
            </button>
          )}
        </PopoverHeader>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  !item.readAt && run(async () => { await markNotificationRead(item.id); router.refresh(); })
                }
                className={cn(
                  "flex w-full flex-col gap-0.5 border-b p-3 text-left text-sm last:border-b-0 hover:bg-muted",
                  !item.readAt && "bg-accent/40",
                )}
              >
                <span className="flex items-center gap-2">
                  {!item.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  <span className={cn("truncate", !item.readAt && "font-medium")}>{item.title}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
