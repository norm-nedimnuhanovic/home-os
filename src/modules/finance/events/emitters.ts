import { emitEvent } from "@/lib/events/emit";

export async function emitTransactionRecorded(householdId: string, transactionId: string, byMemberId: string) {
  return emitEvent(householdId, "transaction.recorded", { transactionId }, byMemberId);
}

export async function emitBillDueSoon(householdId: string, subscriptionId: string, nextDueDate: Date) {
  return emitEvent(householdId, "bill.due_soon", { subscriptionId, nextDueDate }, null);
}

export async function emitBudgetThresholdExceeded(householdId: string, budgetId: string) {
  return emitEvent(householdId, "budget.threshold_exceeded", { budgetId }, null);
}

export async function emitSettlementRecorded(householdId: string, settlementId: string, byMemberId: string) {
  return emitEvent(householdId, "settlement.recorded", { settlementId }, byMemberId);
}
