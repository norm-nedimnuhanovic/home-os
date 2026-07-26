import { prisma } from "@/lib/db";
import type { ActingMember } from "@/lib/auth/session";
import { getVisibleTasks } from "@/modules/tasks";
import { getVisibleNotes } from "@/modules/notes";
import { getVisibleTransactions } from "@/modules/finance";
import { getVisibleContacts } from "@/modules/life-admin";
import type { DashboardItem } from "../entities/dashboard-item";

// Cross-entity search (plan.md §4.1): reads which modules actually
// registered a `global_search_provider` ModuleSurfaceRegistration row, so
// disabling one (or a 9th module simply never registering it) removes it
// from search with no code change here — dispatch below is still a small,
// explicit per-module branch, since each module's own searchable fields
// differ; adding a genuinely new searchable module means adding both its
// registration row (module.ts) and a branch here. Household-scale data — a
// plain in-memory `contains` filter over each module's already-visibility-
// scoped rows, no dedicated search index.
export async function searchEverything(actingMember: ActingMember, query: string): Promise<DashboardItem[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const registrations = await prisma.moduleSurfaceRegistration.findMany({
    where: { surface: "global_search_provider", enabled: true, module: { status: "active" } },
    include: { module: { select: { key: true } } },
  });
  const registeredKeys = new Set(registrations.map((r) => r.module.key));

  const [tasks, notes, transactions, contacts] = await Promise.all([
    registeredKeys.has("tasks") ? getVisibleTasks(actingMember) : Promise.resolve([]),
    registeredKeys.has("notes") ? getVisibleNotes(actingMember) : Promise.resolve([]),
    registeredKeys.has("finance") ? getVisibleTransactions(actingMember) : Promise.resolve([]),
    registeredKeys.has("life_admin") ? getVisibleContacts(actingMember) : Promise.resolve([]),
  ]);

  const results: DashboardItem[] = [
    ...tasks
      .filter((task) => task.title.toLowerCase().includes(q))
      .map((task): DashboardItem => ({
        kind: "task",
        sourceModule: "tasks",
        entityType: "Task",
        entityId: task.id,
        title: task.title,
        href: "/tasks",
      })),
    ...notes
      .filter((note) => note.title?.toLowerCase().includes(q) || note.body.toLowerCase().includes(q))
      .map((note): DashboardItem => ({
        kind: "note",
        sourceModule: "notes",
        entityType: "Note",
        entityId: note.id,
        title: note.title || note.body.split("\n")[0]?.trim() || "Untitled note",
        href: `/notes/${note.id}`,
      })),
    ...transactions
      .filter((transaction) => transaction.title.toLowerCase().includes(q))
      .map((transaction): DashboardItem => ({
        kind: "transaction",
        sourceModule: "finance",
        entityType: "Transaction",
        entityId: transaction.id,
        title: transaction.title,
        href: "/finance",
      })),
    ...contacts
      .filter((contact) => contact.name.toLowerCase().includes(q))
      .map((contact): DashboardItem => ({
        kind: "contact",
        sourceModule: "life_admin",
        entityType: "Contact",
        entityId: contact.id,
        title: contact.name,
        href: "/life-admin/contacts",
      })),
  ];

  return results.slice(0, 20); // a simple cap — no pagination for a household-scale quick-search
}
