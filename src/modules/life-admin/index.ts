// The public barrel: the ONLY import path other modules use
// (docs/project-structure.md §3.2, §7).
export { getVisibleContacts } from "./queries/get-visible-contacts";
export { getContact } from "./queries/get-contact";
export { getVisibleRenewals } from "./queries/get-visible-renewals";
export { getRenewal } from "./queries/get-renewal";
export { getVisibleDocuments } from "./queries/get-visible-documents";
export { getDocument } from "./queries/get-document";
export { getDocumentDownloadUrl } from "./queries/get-document-download-url";
export { getDocumentPreview } from "./actions/get-document-preview";
export { getVisibleShoppingLists } from "./queries/get-visible-shopping-lists";
export { getShoppingList } from "./queries/get-shopping-list";

export { createContact } from "./actions/create-contact";
export { updateContact } from "./actions/update-contact";
export { deleteContact } from "./actions/delete-contact";
export { toggleContactPin } from "./actions/toggle-contact-pin";

export { createRenewal } from "./actions/create-renewal";
export { updateRenewal } from "./actions/update-renewal";
export { markRenewalRenewed } from "./actions/mark-renewal-renewed";
export { cancelRenewal } from "./actions/cancel-renewal";

export { requestDocumentUpload } from "./actions/request-document-upload";
export { confirmDocumentUpload } from "./actions/confirm-document-upload";
export { requestDocumentReplace } from "./actions/request-document-replace";
export { confirmDocumentReplace } from "./actions/confirm-document-replace";
export { updateDocumentMetadata } from "./actions/update-document-metadata";
export { linkDocument } from "./actions/link-document";
export { unlinkDocument } from "./actions/unlink-document";
export { deleteDocument } from "./actions/delete-document";

export { createShoppingList } from "./actions/create-shopping-list";
export { updateShoppingList } from "./actions/update-shopping-list";
export { archiveShoppingList } from "./actions/archive-shopping-list";
export { unarchiveShoppingList } from "./actions/unarchive-shopping-list";
export { addShoppingListItem } from "./actions/add-shopping-list-item";
export { updateShoppingListItem } from "./actions/update-shopping-list-item";
export { toggleShoppingListItemChecked } from "./actions/toggle-shopping-list-item-checked";
export { removeShoppingListItem } from "./actions/remove-shopping-list-item";

export { contactCategorySchema, createContactInputSchema } from "./entities/contact";
export type { CreateContactInput, CreateContactFormInput } from "./entities/contact";
export { renewalTypeSchema, renewalRecurrenceSchema, createRenewalInputSchema, markRenewedInputSchema, getRenewalLifecycleStatus } from "./entities/renewal";
export type { CreateRenewalInput, CreateRenewalFormInput, MarkRenewedInput, MarkRenewedFormInput, RenewalLifecycleStatus } from "./entities/renewal";
export { documentCategorySchema, documentLinkedEntityTypeSchema } from "./entities/document";
export type { DocumentMetadataInput, DocumentMetadataFormInput } from "./entities/document";
export { shoppingListTypeSchema, createShoppingListInputSchema } from "./entities/shopping-list";
export type { CreateShoppingListInput, CreateShoppingListFormInput } from "./entities/shopping-list";
export { createShoppingListItemInputSchema } from "./entities/shopping-list-item";
export type { CreateShoppingListItemInput, CreateShoppingListItemFormInput } from "./entities/shopping-list-item";
// NOT exported: actions/*.test.ts, regenerate-renewal-reminders.ts (internal,
// only called by Renewal's own create/update/mark-renewed/cancel actions),
// anything else — internal to this module.
