"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAndCreateHousehold } from "../actions";

export default function SignupPage() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(formData: FormData) {
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    formData.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);

    const result = await signUpAndCreateHousehold(formData);
    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage(result.message ?? "Check your email to confirm your account.");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Create your household</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;ll be the first owner — invite the rest of your household afterwards.
        </p>
      </div>

      <form action={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="householdName">Household name</Label>
          <Input id="householdName" name="householdName" required minLength={2} maxLength={80} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="baseCurrency">Currency (ISO code)</Label>
          <Input id="baseCurrency" name="baseCurrency" defaultValue="USD" required minLength={3} maxLength={3} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="displayName">Your name</Label>
          <Input id="displayName" name="displayName" required minLength={1} maxLength={80} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required minLength={8} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm text-muted-foreground">{message}</p>}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Creating…" : "Create household"}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => router.push("/login")}
        className="cursor-pointer text-sm text-muted-foreground underline underline-offset-4"
      >
        Already have an account? Log in
      </button>
    </div>
  );
}
