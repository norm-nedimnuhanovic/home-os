import { Badge } from "@/components/ui/badge";
import { ModuleGrantRowActions } from "./module-grant-row-actions";
import type { Module, ModuleGrant, ModuleGrantStatus, ModulePermissionDeclaration, MemberRole } from "@prisma/client";

type GrantWithRelations = ModuleGrant & {
  module: Module;
  permissionDeclaration: ModulePermissionDeclaration;
};

const STATUS_VARIANT: Record<ModuleGrantStatus, "default" | "secondary" | "outline"> = {
  granted: "default",
  pending_review: "secondary",
  revoked: "outline",
};

const STATUS_LABEL: Record<ModuleGrantStatus, string> = {
  granted: "Granted",
  pending_review: "Pending review",
  revoked: "Revoked",
};

export function ModuleGrantList({
  grants,
  actingMember,
}: {
  grants: GrantWithRelations[];
  actingMember: { id: string; role: MemberRole };
}) {
  const byModule = new Map<string, { module: Module; grants: GrantWithRelations[] }>();
  for (const grant of grants) {
    const entry = byModule.get(grant.module.id) ?? { module: grant.module, grants: [] };
    entry.grants.push(grant);
    byModule.set(grant.module.id, entry);
  }

  return (
    <div className="flex flex-col gap-6">
      {[...byModule.values()].map(({ module, grants: moduleGrants }) => (
        <div key={module.id} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-medium">{module.name}</h2>
            <Badge variant="outline" className="text-xs">
              {module.kind === "built_in" ? "Built-in" : "Custom"}
            </Badge>
          </div>
          <ul className="flex flex-col gap-2">
            {moduleGrants.map((grant) => (
              <li
                key={grant.id}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{grant.permissionDeclaration.resourceDomain}</span>
                    {" · "}
                    <span className="text-muted-foreground">{grant.permissionDeclaration.accessLevel}</span>
                    {grant.permissionDeclaration.isRequired && (
                      <span className="text-muted-foreground"> · required</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{grant.permissionDeclaration.purpose}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge variant={STATUS_VARIANT[grant.status]}>{STATUS_LABEL[grant.status]}</Badge>
                  <ModuleGrantRowActions grant={grant} actingMember={actingMember} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
