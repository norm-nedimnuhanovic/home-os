// The public barrel: the ONLY import path other modules use
// (docs/project-structure.md §3.2, §7).
export { getCalendarRange } from "./queries/get-calendar-range";
export { getEvent } from "./queries/get-event";
export { createEvent } from "./actions/create-event";
export { updateEvent } from "./actions/update-event";
export { deleteEvent } from "./actions/delete-event";
export { createEventInputSchema } from "./entities/event";
export type { CreateEventInput, CreateEventFormInput } from "./entities/event";
export { CALENDAR_VIEWS, isCalendarViewType } from "./entities/calendar-view";
export type { CalendarViewType } from "./entities/calendar-view";
// NOT exported: actions/*.test.ts, anything else — internal to this module.
