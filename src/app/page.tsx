import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";

export default async function RootPage() {
  const member = await requireMember();
  redirect(member ? "/dashboard" : "/login");
}
