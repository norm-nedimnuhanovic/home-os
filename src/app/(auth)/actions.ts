"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma, prismaAuthBootstrap } from "@/lib/db";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { seedModuleGrantsForHousehold } from "@/lib/access/module-grants";
import { seedStarterCategories } from "@/modules/finance/actions/seed-starter-categories";
import { seedNotificationPreferencesForMember } from "@/lib/notifications/actions/seed-preferences";

// ---------------------------------------------------------------------------
// Signup — creates a new Household + its first owner Member (docs/auth.md §4)
// ---------------------------------------------------------------------------

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(80),
  householdName: z.string().min(2).max(80),
  timezone: z.string().min(1), // IANA id, e.g. from Intl.DateTimeFormat().resolvedOptions().timeZone on the client
  baseCurrency: z.string().length(3), // ISO 4217, e.g. "USD"
});

export async function signUpAndCreateHousehold(formData: FormData) {
  const parsed = signUpSchema.parse(Object.fromEntries(formData));
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.email,
    password: parsed.password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/callback?next=/dashboard`,
    },
  });

  if (error || !data.user) {
    return { error: error?.message ?? "Could not create account." };
  }

  // Household + owner Member are created immediately — signUp() already
  // returns a stable auth.users id even though the email isn't confirmed
  // yet. We do NOT wait for confirmation to create these rows; we only wait
  // for confirmation to set emailVerifiedAt and allow sign-in (Supabase
  // itself blocks signInWithPassword until the email is confirmed, since
  // "Confirm email" is ON).
  await prisma.$transaction(async (tx) => {
    const household = await tx.household.create({
      data: {
        name: parsed.householdName,
        timezone: parsed.timezone,
        baseCurrency: parsed.baseCurrency,
      },
    });

    const owner = await tx.member.create({
      data: {
        householdId: household.id,
        supabaseUserId: data.user!.id,
        displayName: parsed.displayName,
        email: parsed.email,
        role: "owner",
        status: "active",
      },
    });

    // All 8 built-in modules' required declarations are pre-granted here,
    // in the same transaction — "works immediately, zero setup friction"
    // (plan.md §7, docs/access-control.md §7.1).
    await seedModuleGrantsForHousehold(tx, household.id);

    // Starter expense/income categories (plan.md §3.4) — seeded once at
    // household creation, never re-seeded; still editable/archivable.
    await seedStarterCategories(tx, household.id);

    // Every registered email_notification_category, defaulted to on
    // (docs/email.md §3.1) — same "seed at creation" shape as the grants
    // above.
    await seedNotificationPreferencesForMember(tx, owner.id, household.id);
  });

  return { success: true, message: "Check your email to confirm your account." };
}

// ---------------------------------------------------------------------------
// Invite acceptance — joining an existing household (docs/auth.md §5)
// ---------------------------------------------------------------------------

// Server-renders app/(auth)/invite/[token]/page.tsx (docs/auth.md §5) —
// same prismaAuthBootstrap bypass as acceptInvite() below, for the same
// reason: householdId isn't known until the token resolves it.
export async function getInviteByToken(token: string) {
  const invite = await prismaAuthBootstrap.invite.findUnique({
    where: { token },
    include: { household: true, invitedByMember: true },
  });
  if (!invite || invite.status !== "pending" || invite.expiresAt < new Date()) return null;
  return invite;
}

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  displayName: z.string().min(1).max(80),
  password: z.string().min(8),
});

export async function acceptInvite(formData: FormData) {
  const parsed = acceptInviteSchema.parse(Object.fromEntries(formData));

  // Bypasses the tenant guard deliberately — see prismaAuthBootstrap's doc
  // comment in @/lib/db. The whole point of this lookup is to discover
  // which household the token belongs to; householdId isn't known yet.
  const invite = await prismaAuthBootstrap.invite.findUnique({ where: { token: parsed.token } });

  if (!invite || invite.status !== "pending" || invite.expiresAt < new Date()) {
    return { error: "This invite is no longer valid. Ask an admin to resend it." };
  }

  const admin = createAdminSupabaseClient();

  // email_confirm: true — the Invite link, delivered to invite.email via
  // Resend, is itself the proof of inbox ownership. We deliberately do NOT
  // send a second Supabase confirmation email on top of it.
  const { data, error } = await admin.auth.admin.createUser({
    email: invite.email,
    password: parsed.password,
    email_confirm: true,
  });

  if (error || !data.user) {
    if (error?.message.includes("already been registered")) {
      return {
        error:
          "An account already exists for this email address. Multi-household accounts aren't supported yet.",
      };
    }
    return { error: error?.message ?? "Could not create account." };
  }

  await prisma.$transaction(async (tx) => {
    const member = await tx.member.create({
      data: {
        householdId: invite.householdId,
        supabaseUserId: data.user!.id,
        displayName: parsed.displayName,
        email: invite.email,
        role: invite.role, // "admin" | "member" — never "owner"
        status: "active",
        emailVerifiedAt: new Date(),
        joinedAt: new Date(),
      },
    });

    await tx.invite.update({
      where: { id: invite.id, householdId: invite.householdId },
      data: { status: "accepted", acceptedAt: new Date(), acceptedByMemberId: member.id },
    });

    await seedNotificationPreferencesForMember(tx, member.id, invite.householdId);
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Login / logout (docs/auth.md §7)
// ---------------------------------------------------------------------------

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function login(formData: FormData) {
  const { email, password } = loginSchema.parse(Object.fromEntries(formData));
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { error: "Invalid email or password." };
  }

  // Bypasses the tenant guard deliberately — see prismaAuthBootstrap's doc
  // comment in @/lib/db. householdId isn't known yet at login time.
  await prismaAuthBootstrap.member.updateMany({
    where: { supabaseUserId: data.user.id },
    data: { lastLoginAt: new Date() },
  });

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Password reset (docs/auth.md §8)
// ---------------------------------------------------------------------------

export async function requestPasswordReset(formData: FormData) {
  const email = z.string().email().parse(formData.get("email"));
  const supabase = await createServerSupabaseClient();

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/callback?type=recovery&next=/reset-password/update`,
  });

  // Always return the same message whether or not the email exists —
  // never let this endpoint be used to enumerate registered emails.
  return { success: true, message: "If that email has an account, a reset link is on its way." };
}

const updatePasswordSchema = z.object({ password: z.string().min(8) });

export async function updatePassword(formData: FormData) {
  const { password } = updatePasswordSchema.parse(Object.fromEntries(formData));
  const supabase = await createServerSupabaseClient();

  // Relies on the session already established by /api/auth/callback's
  // verifyOtp({ type: "recovery", ... }) call — no separate token handling
  // needed here.
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/dashboard");
}
