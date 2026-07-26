import { prisma } from "../../src/lib/db";
import type { Household, Member } from "@prisma/client";

type Members = { owner: Member; admin: Member; member: Member };

// Note: a "recurring task" (Task.recurrenceRuleId -> TaskRecurrenceRule) is
// deliberately NOT seeded here — grepping the real src/modules/tasks/
// action files confirms TaskRecurrenceRule is never actually written or
// read anywhere in the shipped app (the schema column exists; the feature
// behind it was never built, tracked as a known harness gap in
// ROADMAP.md). Seeding one would fabricate a data shape nothing in the app
// can create, display, or manage — the same reasoning docs/seeding.md §9.5
// already applies to EventOccurrence/NotificationPreference.
export async function seedTasksKanbanCalendar(household: Household, members: Members) {
  const { owner, admin, member } = members;

  const [tagHome, tagUrgent] = await Promise.all([
    prisma.tag.create({ data: { householdId: household.id, name: "Home", color: "#0ea5e9" } }),
    prisma.tag.create({ data: { householdId: household.id, name: "Urgent", color: "#dc2626" } }),
  ]);

  // Same shape real create-board.ts uses for a brand-new board — every
  // board gets these three columns so the Kanban<->Tasks completion sync
  // (kanban's task.completed EventSubscription) always has a done-typed
  // column to land a card in.
  const board = await prisma.kanbanBoard.create({
    data: {
      householdId: household.id,
      name: "Household Chores",
      description: "Weekly recurring chores and one-off household projects.",
      position: 1,
      visibility: "household",
      createdById: owner.id,
      columns: {
        create: [
          { householdId: household.id, name: "To do", columnType: "todo", position: 1 },
          { householdId: household.id, name: "In Progress", columnType: "in_progress", position: 2 },
          { householdId: household.id, name: "Done", columnType: "done", position: 3 },
        ],
      },
    },
    include: { columns: { orderBy: { position: "asc" } } },
  });
  const [todoColumn, , doneColumn] = board.columns;

  const boardTask = await prisma.task.create({
    data: {
      householdId: household.id,
      title: "Take bins to the curb",
      description: "Collection day is Tuesday morning.",
      dueDate: nextTuesday(),
      dueDateAllDay: true,
      priority: "medium",
      assigneeId: member.id,
      createdById: owner.id,
      visibility: "household",
      boardId: board.id,
      columnId: todoColumn.id,
      boardPosition: 0,
      tags: { create: [{ householdId: household.id, tagId: tagHome.id }] },
    },
  });

  // Sub-task — one level of nesting only (plan.md).
  await prisma.task.create({
    data: {
      householdId: household.id,
      title: "Buy bin liners",
      parentTaskId: boardTask.id,
      priority: "low",
      assigneeId: member.id,
      createdById: member.id,
      visibility: "household",
    },
  });

  // Already completed, and already sitting in the board's Done column —
  // demonstrates the Task -> Card placement without needing a running app
  // to trigger it.
  await prisma.task.create({
    data: {
      householdId: household.id,
      title: "Set up smoke detector battery reminder",
      priority: "high",
      assigneeId: owner.id,
      createdById: owner.id,
      completedAt: new Date(),
      completedById: owner.id,
      visibility: "household",
      boardId: board.id,
      columnId: doneColumn.id,
      boardPosition: 0,
      tags: { create: [{ householdId: household.id, tagId: tagUrgent.id }] },
    },
  });

  // Task with NO board placement at all — plan.md: a task can exist with
  // boardId/columnId/boardPosition all null.
  const unplacedTask = await prisma.task.create({
    data: {
      householdId: household.id,
      title: "Renew library card",
      priority: "low",
      assigneeId: admin.id,
      createdById: admin.id,
      dueDate: inDays(10),
      dueDateAllDay: true,
      visibility: "household",
    },
  });

  await prisma.task.create({
    data: {
      householdId: household.id,
      title: "Water the plants",
      priority: "low",
      assigneeId: admin.id,
      createdById: admin.id,
      dueDate: today(),
      dueDateAllDay: true,
      visibility: "household",
    },
  });

  const dinnerEvent = await prisma.event.create({
    data: {
      householdId: household.id,
      title: "Family dinner",
      location: "Home",
      startAt: todayAt(18, 30),
      endAt: todayAt(20, 0),
      allDay: false,
      visibility: "household",
      color: "#7c3aed",
      createdById: owner.id,
    },
  });

  return { tasks: { boardTask, unplacedTask }, board, events: { dinnerEvent } };
}

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function todayAt(h: number, m: number) {
  const d = today();
  d.setHours(h, m, 0, 0);
  return d;
}
function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}
function nextTuesday() {
  const d = new Date();
  d.setDate(d.getDate() + (((2 + 7 - d.getDay()) % 7) || 7));
  return d;
}
