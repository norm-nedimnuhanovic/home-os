import { prisma } from "../../src/lib/db";
import { ALL_MODULES } from "../../src/lib/module-registry/registry";

// Registers the platform catalog: the 8 built-in Modules plus the
// `household` platform-substrate pseudo-module (src/lib/household/module.ts
// — see its own file comment for why it exists), their ModuleEventType/
// ModulePermissionDeclaration/ModuleSurfaceRegistration rows, generic over
// docs/module-architecture.md's registration shape — a 9th module needs
// zero changes here, only an entry in src/lib/module-registry/registry.ts's
// ALL_MODULES array.
export async function seedPlatformCatalog() {
  // Pass 1: create/update every Module's own scalar fields. `dependsOn` is a
  // self many-to-many relation, not a scalar array column, so it can't be
  // spread from moduleRegistration directly (Prisma expects a connect/create
  // structure) — and a module's dependency might not exist yet on its own
  // turn through this loop anyway. Resolved in pass 2, once every Module
  // row exists.
  const catalogModules = new Map<string, { id: string }>();

  for (const mod of ALL_MODULES) {
    const { key, name, description, version, kind, status } = mod.moduleRegistration;

    // Named `catalogModule`, not `module` — Next.js's ESLint config forbids
    // shadowing the CommonJS `module` global.
    const catalogModule = await prisma.module.upsert({
      where: { key },
      update: { name, description, version, kind, status },
      create: {
        key,
        name,
        description,
        version,
        kind,
        status,
        healthStatus: "ok",
        installedAt: new Date(),
        // Module.registeredBy is a nullable Member relation (plan.md §3.6:
        // "or a system sentinel for pre-seeded built-ins") — null IS the
        // sentinel here, since no real Member exists yet at this point in
        // the seed; there is no FK-safe free-text alternative.
        registeredById: null,
      },
    });
    catalogModules.set(key, catalogModule);
  }

  for (const mod of ALL_MODULES) {
    if (mod.moduleRegistration.dependsOnModules.length === 0) continue;
    const catalogModule = catalogModules.get(mod.moduleRegistration.key)!;
    await prisma.module.update({
      where: { id: catalogModule.id },
      data: {
        dependsOn: {
          set: mod.moduleRegistration.dependsOnModules.map((key) => ({
            id: catalogModules.get(key)!.id,
          })),
        },
      },
    });
  }

  for (const mod of ALL_MODULES) {
    const catalogModule = catalogModules.get(mod.moduleRegistration.key)!;

    for (const eventType of mod.eventTypes) {
      await prisma.moduleEventType.upsert({
        where: { key: eventType.key },
        update: {
          label: eventType.label,
          payloadSummary: eventType.payloadSummary,
          contractVersion: eventType.contractVersion,
          relatedEntityType: eventType.relatedEntityType,
        },
        create: {
          key: eventType.key,
          label: eventType.label,
          payloadSummary: eventType.payloadSummary,
          contractVersion: eventType.contractVersion,
          relatedEntityType: eventType.relatedEntityType,
          owningModuleId: catalogModule.id,
        },
      });
    }

    for (const decl of mod.permissionDeclarations) {
      await prisma.modulePermissionDeclaration.upsert({
        where: {
          moduleId_resourceDomain: {
            moduleId: catalogModule.id,
            resourceDomain: decl.resourceDomain,
          },
        },
        update: { accessLevel: decl.accessLevel, purpose: decl.purpose, isRequired: decl.isRequired },
        create: { moduleId: catalogModule.id, ...decl },
      });
    }

    for (const surface of mod.surfaceRegistrations) {
      await prisma.moduleSurfaceRegistration.upsert({
        where: {
          moduleId_surface_target: {
            moduleId: catalogModule.id,
            surface: surface.surface,
            target: surface.target,
          },
        },
        update: { label: surface.label, sortOrder: surface.sortOrder, enabled: true },
        create: { moduleId: catalogModule.id, ...surface, enabled: true },
      });
    }

    // Only `kanban` declares one of these today, once its own subscriber
    // function exists (docs/module-architecture.md §7.1) — the loop stays
    // generic over every module regardless, so a 9th module's own
    // subscription needs zero changes here. Looked up (not just keyed by
    // string) because ALL_MODULES's ordering already guarantees the owning
    // module's ModuleEventType row exists by the time a subscriber's turn
    // in the loop comes.
    for (const sub of (
      mod as {
        eventSubscriptions?: Array<{
          subscriberModule: string;
          eventType: string;
          reactionDescription: string;
          onFailure: "ignore" | "log_only" | "disable_after_n_failures";
        }>;
      }
    ).eventSubscriptions ?? []) {
      const eventType = await prisma.moduleEventType.findUniqueOrThrow({ where: { key: sub.eventType } });

      await prisma.eventSubscription.upsert({
        where: {
          subscriberModuleId_eventTypeId: { subscriberModuleId: catalogModule.id, eventTypeId: eventType.id },
        },
        update: { reactionDescription: sub.reactionDescription, onFailure: sub.onFailure, active: true },
        create: {
          subscriberModuleId: catalogModule.id,
          eventTypeId: eventType.id,
          reactionDescription: sub.reactionDescription,
          onFailure: sub.onFailure,
          active: true,
        },
      });
    }
  }
}
