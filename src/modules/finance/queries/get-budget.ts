import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/access/errors";

export async function getBudget(householdId: string, budgetId: string) {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, householdId }, // both, always — not just id
  });
  if (!budget) throw new NotFoundError("Budget not found.");
  return budget;
}
