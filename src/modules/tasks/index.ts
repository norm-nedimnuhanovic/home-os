// The public barrel: the ONLY import path other modules use
// (docs/project-structure.md §3.2, §7).
export { getVisibleTasks } from "./queries/get-visible-tasks";
export { getTask } from "./queries/get-task";
export { getHouseholdTags } from "./queries/get-household-tags";
export { getTasksDueInRange } from "./queries/get-tasks-due-in-range";
export { createTask } from "./actions/create-task";
export { updateTask } from "./actions/update-task";
export { completeTask } from "./actions/complete-task";
export { reopenTask } from "./actions/reopen-task";
export { getTaskStatus, taskPrioritySchema, createTaskInputSchema } from "./entities/task";
export type { CreateTaskInput, CreateTaskFormInput } from "./entities/task";
// NOT exported: entities/task.ts's schemas beyond the type, actions/*.test.ts,
// anything else — internal to this module.
