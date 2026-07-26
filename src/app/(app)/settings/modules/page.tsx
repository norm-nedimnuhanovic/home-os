import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { SettingsNav } from "../settings-nav";
import { ModuleGrantList } from "./module-grant-list";

export default async function ModulesSettingsPage() {
  const member = await requireMember();
  if (!member) redirect("/login");

  const grants = await prisma.moduleGrant.findMany({
    where: { householdId: member.householdId },
    include: { module: true, permissionDeclaration: true },
    orderBy: [{ module: { name: "asc" } }, { permissionDeclaration: { resourceDomain: "asc" } }],
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SettingsNav active="modules" />
      <ModuleGrantList grants={grants} actingMember={{ id: member.id, role: member.role }} />
    </div>
  );
}
