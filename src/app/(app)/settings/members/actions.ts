"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth/session";
import {
  canInviteMember,
  canRemoveMember,
  canChangeMemberRole,
  canTransferOwnership,
  canCloseHousehold,
  assertNotLastOwner,
} from "@/lib/access/household-permissions";
import { ForbiddenError, runAction } from "@/lib/access/errors";
import { prisma } from "@/lib/db";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { sendHouseholdInviteEmail } from "@/lib/email/send-category-email";
import type { MemberRole } from "@prisma/client";

const inviteMemberInputSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]),
});
export type InviteMemberInput = z.infer<typeof inviteMemberInputSchema>;

export async function inviteMember(rawInput: InviteMemberInput) {
  return runAction(async () => {
    const input = inviteMemberInputSchema.parse(rawInput);

    const actingMember = await requireMember();
    if (!actingMember) throw new ForbiddenError("Not authenticated.");

    if (!canInviteMember(actingMember)) {
      throw new ForbiddenError("Only an admin or owner can invite a new member.");
    }

    const existing = await prisma.member.findFirst({
      where: { householdId: actingMember.householdId, email: input.email, status: "active" },
    });
    if (existing) {
      throw new ForbiddenError("That email already belongs to an active member of this household.");
    }

    const invite = await prisma.invite.create({
      data: {
        householdId: actingMember.householdId,
        email: input.email,
        role: input.role,
        invitedByMemberId: actingMember.id,
        token: randomBytes(32).toString("hex"),
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7-day default
      },
    });

    // Sent directly, not through the NotificationPreference-gated pipeline
    // — the invitee has no Member row yet, so there's nothing to gate
    // against (docs/email.md §2.1). This link is the invitee's only way to
    // ever discover the invite exists (docs/auth.md §5) — unlike the
    // best-effort notification fan-out elsewhere (which has other surfaces
    // to fall back on and must never break its triggering action), a
    // failed send here has no fallback, so it rolls back the row and
    // surfaces a clear error instead of silently leaving the admin
    // thinking an invite went out when it didn't.
    try {
      await sendHouseholdInviteEmail({
        to: invite.email,
        householdName: actingMember.household.name,
        invitedByName: actingMember.displayName,
        acceptUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/invite/${invite.token}`,
      });
    } catch (error) {
      await prisma.invite.delete({ where: { id: invite.id, householdId: invite.householdId } });
      throw new ForbiddenError(
        `Could not send the invite email (${error instanceof Error ? error.message : "unknown error"}). Please try again.`,
      );
    }

    revalidatePath("/settings/members");
    return invite;
  });
}

// plan.md §2.3.4: "Resending an invite regenerates the token and
// invalidates the previous one. An expired invite must be resent to
// produce a fresh token before it can be accepted." The old token is
// invalidated implicitly — once the row's token column changes, nothing
// looks it up by the stale value anymore (Invite.token is @unique).
export async function resendInvite(inviteId: string) {
  return runAction(async () => {
    const actingMember = await requireMember();
    if (!actingMember) throw new ForbiddenError("Not authenticated.");

    if (!canInviteMember(actingMember)) {
      throw new ForbiddenError("Only an admin or owner can resend an invite.");
    }

    const invite = await prisma.invite.findFirst({
      where: { id: inviteId, householdId: actingMember.householdId },
    });
    if (!invite) {
      throw new ForbiddenError("Invite not found in this household.");
    }
    // Covers both "still within its 7-day window" and "expired" — nothing
    // ever flips status to the schema's `expired` value (it's derived from
    // expiresAt at read time, docs/auth.md's getInviteByToken()), so a
    // stale-but-unaccepted invite is still `pending` here. `accepted`/
    // `revoked` are deliberate terminal states — resending one would
    // silently resurrect a decision someone already made; send a fresh
    // Invite instead.
    if (invite.status !== "pending") {
      throw new ForbiddenError("Only a pending invite can be resent.");
    }

    const nextToken = randomBytes(32).toString("hex");
    const nextExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // The new token is only ever persisted once the email carrying it has
    // actually gone out — regenerating it first and having the send fail
    // would strand the invitee with neither a working old link nor a
    // delivered new one (same all-or-nothing rule as inviteMember() above).
    try {
      await sendHouseholdInviteEmail({
        to: invite.email,
        householdName: actingMember.household.name,
        invitedByName: actingMember.displayName,
        acceptUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/invite/${nextToken}`,
      });
    } catch (error) {
      throw new ForbiddenError(
        `Could not send the invite email (${error instanceof Error ? error.message : "unknown error"}). Please try again.`,
      );
    }

    const updated = await prisma.invite.update({
      where: { id: invite.id, householdId: invite.householdId },
      data: { token: nextToken, expiresAt: nextExpiresAt },
    });

    revalidatePath("/settings/members");
    return updated;
  });
}

// This is the canonical example of an *asymmetric* rule: it isn't "role ≥
// X", it depends on the *target's* role too, and it must re-check the
// last-owner invariant (docs/access-control.md §4.2).
export async function removeMember(targetMemberId: string) {
  return runAction(async () => {
    const actingMember = await requireMember();
    if (!actingMember) throw new ForbiddenError("Not authenticated.");

    // Always re-scope the lookup by householdId — Member.email is unique per
    // household, not globally, so a memberId from another household must
    // resolve to nothing here, never leak whether it exists elsewhere.
    const targetMember = await prisma.member.findFirst({
      where: { id: targetMemberId, householdId: actingMember.householdId },
    });
    if (!targetMember) {
      throw new ForbiddenError("Member not found in this household.");
    }

    if (!canRemoveMember(actingMember, targetMember)) {
      throw new ForbiddenError("Only the owner can remove an admin.");
    }

    if (targetMember.role === "owner") {
      await assertNotLastOwner(actingMember.householdId, targetMember.id);
    }

    // Plan: "removed members' owned objects stay attributed to them, not
    // reassigned/deleted" — this is a status flip only, never a delete.
    // Real bug found and fixed alongside this change: Member is
    // tenant-scoped (src/lib/db/tenant-guard.ts) — omitting householdId
    // here meant the guard rejected this update outright, so removing a
    // member has been throwing since the day this was written. Never
    // caught before because this action's own unit tests mock @/lib/db
    // entirely (same class of bug as the cron-job/dispatchToSubscribers()
    // gaps found in the Email & Scheduled Jobs phase).
    const removed = await prisma.member.update({
      where: { id: targetMember.id, householdId: actingMember.householdId },
      data: { status: "removed" },
    });

    // Defense in depth on top of the status check in requireMember() — ban
    // the underlying Supabase user too, in case an already-issued access
    // token is still valid for its remaining lifetime (docs/auth.md §7.3).
    const admin = createAdminSupabaseClient();
    await admin.auth.admin.updateUserById(removed.supabaseUserId, { ban_duration: "876000h" });

    // Real bug found via an actual browser test: without this, the acting
    // member's own already-open /settings/members page kept showing the
    // removed member (and every other stale row below) until a manual
    // reload — the mutation succeeded, only the cached RSC payload was stale.
    revalidatePath("/settings/members");
    return removed;
  });
}

export async function changeMemberRole(targetMemberId: string, nextRole: MemberRole) {
  return runAction(async () => {
    const actingMember = await requireMember();
    if (!actingMember) throw new ForbiddenError("Not authenticated.");

    const targetMember = await prisma.member.findFirst({
      where: { id: targetMemberId, householdId: actingMember.householdId },
    });
    if (!targetMember) {
      throw new ForbiddenError("Member not found in this household.");
    }

    if (!canChangeMemberRole(actingMember, targetMember, nextRole)) {
      throw new ForbiddenError("You are not allowed to change this member's role.");
    }

    if (targetMember.role === "owner" && nextRole !== "owner") {
      await assertNotLastOwner(actingMember.householdId, targetMember.id);
    }

    // Same missing-householdId bug as removeMember() above — fixed here too.
    const updated = await prisma.member.update({
      where: { id: targetMember.id, householdId: actingMember.householdId },
      data: { role: nextRole },
    });

    // Same stale-page bug as removeMember() — found in the same browser pass.
    revalidatePath("/settings/members");
    return updated;
  });
}

// Transfers ownership to another existing member — an owner-only, explicit
// action (plan.md §2.2), never something an Invite can grant directly. The
// acting owner is demoted to admin in the same transaction, so the
// household never briefly has two owners or zero.
export async function transferOwnership(targetMemberId: string) {
  return runAction(async () => {
    const actingMember = await requireMember();
    if (!actingMember) throw new ForbiddenError("Not authenticated.");

    if (!canTransferOwnership(actingMember)) {
      throw new ForbiddenError("Only the current owner can transfer ownership.");
    }

    const targetMember = await prisma.member.findFirst({
      where: {
        id: targetMemberId,
        householdId: actingMember.householdId,
        status: "active",
      },
    });
    if (!targetMember) {
      throw new ForbiddenError("Member not found in this household.");
    }
    if (targetMember.id === actingMember.id) {
      throw new ForbiddenError("You are already the owner.");
    }

    // Same missing-householdId bug as removeMember()/changeMemberRole() —
    // fixed in both updates here too.
    const result = await prisma.$transaction([
      prisma.member.update({
        where: { id: targetMember.id, householdId: actingMember.householdId },
        data: { role: "owner" },
      }),
      prisma.member.update({
        where: { id: actingMember.id, householdId: actingMember.householdId },
        data: { role: "admin" },
      }),
    ]);

    // Same stale-page bug as removeMember()/changeMemberRole() — found in
    // the same browser pass.
    revalidatePath("/settings/members");
    return result;
  });
}

// Owner-initiated, one-way shutdown of the whole household (plan.md §2.1/
// §2.2, resolving what was a self-contradiction in an earlier plan.md draft
// — see this change's plan.md edit). A soft status flip only, matching
// removeMember()'s "never touch historical data" precedent — no Member
// row is touched, so every task/note/transaction/etc. stays attributed
// exactly as it was. What actually locks everyone out is requireMember()'s
// own household.status check (src/lib/auth/session.ts) rejecting every
// member's *next* request once status is no longer "active" — same
// defense-in-depth shape as the existing member.status check there.
export async function closeHousehold() {
  return runAction(async () => {
    const actingMember = await requireMember();
    if (!actingMember) throw new ForbiddenError("Not authenticated.");

    if (!canCloseHousehold(actingMember)) {
      throw new ForbiddenError("Only the owner can close the household.");
    }

    // Household itself isn't tenant-scoped (it's the tenant root) — `id`
    // alone is the correct, sufficient filter here.
    await prisma.$transaction([
      prisma.household.update({
        where: { id: actingMember.householdId },
        data: { status: "closed" },
      }),
      // A still-pending Invite into a now-closed household must never be
      // acceptable — revoke every outstanding one rather than leaving them
      // to be silently rejected later by an ad-hoc household-status check
      // in acceptInvite() (no in-app path can ever create a *new* invite
      // after this point either, since inviteMember() requires a live
      // requireMember() session, which this same closure just killed).
      prisma.invite.updateMany({
        where: { householdId: actingMember.householdId, status: "pending" },
        data: { status: "revoked" },
      }),
    ]);
  });
}
