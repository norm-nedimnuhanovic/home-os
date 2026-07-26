"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { hasAtLeastRole } from "@/lib/access/roles";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET } from "@/lib/storage/policy";
import { getDocument } from "../queries/get-document";

export async function deleteDocument(documentId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const document = await getDocument(member, documentId); // tenant + visibility check

  // Not a plan.md-specified rule (plan.md is silent on who may delete a
  // Document) — harness-extrapolated the same way deleteContact() was:
  // uploader, or an admin/owner moderating, because this one is
  // irreversible (it destroys the underlying file, not just a DB row).
  if (document.uploadedById !== member.id && !hasAtLeastRole(member.role, "admin")) {
    throw new ForbiddenError("Only the uploader or a household admin/owner can delete this document.");
  }

  // Storage deletion first: if this fails, the DB row (and the file) both
  // still exist and the member can retry — better than an orphaned DB row
  // pointing at bytes that are already gone.
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([document.fileRef]);
  if (error) throw new Error(`Could not delete stored file: ${error.message}`);

  await prisma.objectShare.deleteMany({
    where: { householdId: member.householdId, moduleKey: "life_admin", objectType: "Document", objectId: documentId },
  });

  await prisma.document.delete({ where: { id: documentId, householdId: member.householdId } });

  revalidatePath("/life-admin/documents");
}
