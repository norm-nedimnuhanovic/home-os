import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { getMembers } from "@/lib/household";
import { getVisibleDocuments } from "@/modules/life-admin";
import { DocumentUploadDialog } from "@/modules/life-admin/components/document-upload-dialog";
import { DocumentList } from "@/modules/life-admin/components/document-list";

export default async function DocumentsPage() {
  const member = await requireMember();
  if (!member) redirect("/login");

  const [members, documents] = await Promise.all([getMembers(member.householdId), getVisibleDocuments(member)]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Documents</h1>
        <DocumentUploadDialog members={members} />
      </div>
      <DocumentList documents={documents} members={members} />
    </div>
  );
}
