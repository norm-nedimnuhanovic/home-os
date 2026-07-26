import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { prismaAuthBootstrap } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  if (token_hash && type) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (!error) {
      if (type === "signup") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          // Bypasses the tenant guard deliberately — see prismaAuthBootstrap's
          // doc comment in @/lib/db. householdId isn't known yet here.
          await prismaAuthBootstrap.member.updateMany({
            where: { supabaseUserId: user.id },
            data: { emailVerifiedAt: new Date() },
          });
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-error`);
}
