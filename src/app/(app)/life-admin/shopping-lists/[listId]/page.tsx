import { notFound, redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { getMembers } from "@/lib/household";
import { getShoppingList } from "@/modules/life-admin";
import { NotFoundError } from "@/lib/access/errors";
import { ShoppingListDetail } from "@/modules/life-admin/components/shopping-list-detail";

export default async function ShoppingListPage({ params }: { params: Promise<{ listId: string }> }) {
  const member = await requireMember();
  if (!member) redirect("/login");

  const { listId } = await params;

  const [members, list] = await Promise.all([
    getMembers(member.householdId),
    getShoppingList(member, listId).catch((error) => {
      if (error instanceof NotFoundError) return null;
      throw error;
    }),
  ]);
  if (!list) notFound();

  return <ShoppingListDetail list={list} members={members} />;
}
