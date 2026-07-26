// The public barrel: the ONLY import path other modules use
// (docs/project-structure.md §3.2, §7).
export { getBoards } from "./queries/get-boards";
export { getBoard } from "./queries/get-board";
export { getBoardWithColumns } from "./queries/get-board-with-columns";
export { createBoard } from "./actions/create-board";
export { updateBoard } from "./actions/update-board";
export { archiveBoard } from "./actions/archive-board";
export { createColumn } from "./actions/create-column";
export { createCard } from "./actions/create-card";
export { updateColumn } from "./actions/update-column";
export { deleteColumn } from "./actions/delete-column";
export { moveCard } from "./actions/move-card";
export { createBoardInputSchema } from "./entities/board";
export type { CreateBoardInput, CreateBoardFormInput } from "./entities/board";
export { columnTypeSchema, createColumnInputSchema } from "./entities/column";
export type { CreateColumnInput, CreateColumnFormInput, MoveCardInput } from "./entities/column";
// NOT exported: actions/*.test.ts, events/subscribers.ts (wired directly
// into src/lib/events/handlers.ts, never called by another module), anything
// else — internal to this module.
