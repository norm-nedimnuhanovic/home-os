import { redirect } from "next/navigation";
import { getVisibleTasks, getHouseholdTags } from "@/modules/tasks";
import { getMembers } from "@/lib/household";
import { requireMember } from "@/lib/auth/session";
import { TaskList } from "@/modules/tasks/components/task-list";
import { NewTaskDialog } from "@/modules/tasks/components/new-task-dialog";

export default async function TasksPage() {
  const member = await requireMember();
  if (!member) redirect("/login");

  const [rawTasks, tags, members] = await Promise.all([
    getVisibleTasks(member),
    getHouseholdTags(member.householdId),
    getMembers(member.householdId),
  ]);

  // getVisibleTasks() returns the raw join shape (tags: {tagId}[],
  // reminders: [{leadTimeValue, leadTimeUnit}] — at most one) — flatten to
  // what TaskList/TaskForm actually consume.
  const tasks = rawTasks.map((task) => ({
    ...task,
    tagIds: task.tags.map((t) => t.tagId),
    dueReminder: task.reminders[0] ?? null,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <NewTaskDialog members={members} tags={tags} />
      </div>
      <TaskList tasks={tasks} householdTimezone={member.household.timezone} members={members} tags={tags} />
    </div>
  );
}
