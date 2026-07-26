"use client";

import { useMemo, useState } from "react";
import { MonthView } from "./month-view";
import { WeekView } from "./week-view";
import { DayView } from "./day-view";
import { EventDetailDialog } from "./event-detail-dialog";
import type { CalendarItem } from "../entities/calendar-item";
import type { CalendarViewType } from "../entities/calendar-view";
import type { Event } from "@prisma/client";

type MemberOption = { id: string; displayName: string };

export function CalendarShell({
  view,
  month,
  from,
  to,
  items,
  events,
  members,
  memberId,
  householdTimezone,
}: {
  view: CalendarViewType;
  month: Date;
  from: Date;
  to: Date;
  items: CalendarItem[];
  events: Event[];
  members: MemberOption[];
  memberId: string;
  householdTimezone: string;
}) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const selectedEvent = selectedEventId ? (eventsById.get(selectedEventId) ?? null) : null;

  function handleItemClick(item: CalendarItem) {
    if (item.kind === "event") setSelectedEventId(item.id);
  }

  return (
    <>
      {view === "month" && (
        <MonthView
          month={month}
          from={from}
          to={to}
          items={items}
          onItemClick={handleItemClick}
          householdTimezone={householdTimezone}
        />
      )}
      {view === "week" && (
        <WeekView from={from} to={to} items={items} onItemClick={handleItemClick} householdTimezone={householdTimezone} />
      )}
      {view === "day" && <DayView date={from} items={items} onItemClick={handleItemClick} />}

      {selectedEvent && (
        <EventDetailDialog
          event={selectedEvent}
          members={members}
          isOwner={selectedEvent.createdById === memberId}
          open
          onOpenChange={(open) => {
            if (!open) setSelectedEventId(null);
          }}
        />
      )}
    </>
  );
}
