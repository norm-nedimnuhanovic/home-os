import { onTaskCompleted } from "@/modules/kanban/events/subscribers";

// Next.js can't `import()` a component or function from a runtime database
// string in a serverless deployment (docs/project-structure.md §4.3
// establishes this for surfaces.ts; docs/module-architecture.md §6.1 is the
// identical fix for EventSubscription). Keyed by
// `${subscriberModule.key}:${eventType.key}`. Every EventSubscription row
// gets exactly one line here, none of them behind an `if`.
type EventHandler = (payload: unknown, householdId: string) => Promise<void>;

export const eventHandlers: Record<string, EventHandler> = {
  "kanban:task.completed": onTaskCompleted as EventHandler,
};
