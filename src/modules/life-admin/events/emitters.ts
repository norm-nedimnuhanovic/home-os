import { emitEvent } from "@/lib/events/emit";

export async function emitContactCreated(householdId: string, contactId: string, name: string, byMemberId: string) {
  return emitEvent(householdId, "contact.created", { contactId, name }, byMemberId);
}

export async function emitContactUpdated(householdId: string, contactId: string, byMemberId: string) {
  return emitEvent(householdId, "contact.updated", { contactId }, byMemberId);
}

export async function emitRenewalCreated(householdId: string, renewalId: string, title: string, byMemberId: string) {
  return emitEvent(householdId, "renewal.created", { renewalId, title }, byMemberId);
}

// System-triggered (null actor) — audit-trail events raised by
// sweep-renewal-lifecycle.ts, not by a member action (docs/email.md §9.4).
export async function emitRenewalExpiringSoon(householdId: string, renewalId: string, expiryDate: Date) {
  return emitEvent(householdId, "renewal.expiring_soon", { renewalId, expiryDate }, null);
}

export async function emitRenewalExpired(householdId: string, renewalId: string) {
  return emitEvent(householdId, "renewal.expired", { renewalId }, null);
}

export async function emitRenewalRenewed(householdId: string, renewalId: string, byMemberId: string) {
  return emitEvent(householdId, "renewal.renewed", { renewalId }, byMemberId);
}

export async function emitRenewalCancelled(householdId: string, renewalId: string, byMemberId: string) {
  return emitEvent(householdId, "renewal.cancelled", { renewalId }, byMemberId);
}

export async function emitDocumentUploaded(householdId: string, documentId: string, title: string, byMemberId: string) {
  return emitEvent(householdId, "document.uploaded", { documentId, title }, byMemberId);
}

export async function emitDocumentLinked(
  householdId: string,
  documentId: string,
  linkedEntityType: string,
  linkedEntityId: string,
  byMemberId: string,
) {
  return emitEvent(householdId, "document.linked", { documentId, linkedEntityType, linkedEntityId }, byMemberId);
}

export async function emitShoppingListItemAdded(
  householdId: string,
  listId: string,
  itemId: string,
  name: string,
  byMemberId: string,
) {
  return emitEvent(householdId, "shoppingList.item_added", { listId, itemId, name }, byMemberId);
}

export async function emitShoppingListItemChecked(
  householdId: string,
  listId: string,
  itemId: string,
  byMemberId: string,
) {
  return emitEvent(householdId, "shoppingList.item_checked", { listId, itemId }, byMemberId);
}

export async function emitShoppingListItemUnchecked(
  householdId: string,
  listId: string,
  itemId: string,
  byMemberId: string,
) {
  return emitEvent(householdId, "shoppingList.item_unchecked", { listId, itemId }, byMemberId);
}
