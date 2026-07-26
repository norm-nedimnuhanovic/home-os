"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { acceptInvite } from "../../actions";

export function AcceptInviteForm({
  token,
  householdName,
  invitedByName,
  email,
}: {
  token: string;
  householdName: string;
  invitedByName: string;
  email: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(formData: FormData) {
    setIsSubmitting(true);
    setError(null);
    formData.set("token", token);
    const password = formData.get("password") as string;

    const result = await acceptInvite(formData);
    if (result?.error) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    // admin.auth.admin.createUser() (inside acceptInvite) doesn't establish
    // a session — it's a privileged, session-less call. Signing in here,
    // client-side, with the password just typed, is what actually sets the
    // session cookie (docs/auth.md §5).
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signInWithPassword({ email, password });
    router.push("/dashboard");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Join {householdName}</h1>
        <p className="text-sm text-muted-foreground">
          {invitedByName} invited you — set your name and password to join.
        </p>
      </div>

      <form action={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="displayName">Your name</Label>
          <Input id="displayName" name="displayName" required minLength={1} maxLength={80} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required minLength={8} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Joining…" : "Join household"}
        </Button>
      </form>
    </div>
  );
}
