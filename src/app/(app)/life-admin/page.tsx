import { redirect } from "next/navigation";
import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { getMembers } from "@/lib/household";
import { getVisibleShoppingLists } from "@/modules/life-admin";
import { NewShoppingListDialog } from "@/modules/life-admin/components/new-shopping-list-dialog";
import { ShoppingListSummaryList } from "@/modules/life-admin/components/shopping-list-summary-list";
import { Button } from "@/components/ui/button";

// The hub: Documents/Renewals/Contacts each get their own top-level route
// (docs/project-structure.md's route tree), but ShoppingList only has a
// [listId] detail route — so the list-of-lists (+ create) lives here,
// alongside links out to the other three sections.
export default async function LifeAdminPage() {
  const member = await requireMember();
  if (!member) redirect("/login");

  const [members, lists] = await Promise.all([
    getMembers(member.householdId),
    getVisibleShoppingLists(member),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Life Admin</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/life-admin/documents">Documents</Link>
          </Button>
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/life-admin/renewals">Renewals</Link>
          </Button>
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/life-admin/contacts">Contacts</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-medium">Shopping & household lists</h2>
          <NewShoppingListDialog members={members} />
        </div>
        <ShoppingListSummaryList lists={lists} />
      </div>
    </div>
  );
}
