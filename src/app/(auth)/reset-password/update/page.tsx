"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword } from "../../actions";

export default function UpdatePasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(formData: FormData) {
    setIsSubmitting(true);
    setError(null);

    const result = await updatePassword(formData);
    // updatePassword() redirects on success (throws Next.js's internal
    // redirect signal), so reaching this line at all means it returned an
    // error.
    setIsSubmitting(false);
    if (result?.error) setError(result.error);
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 p-4">
      <h1 className="text-2xl font-semibold">Set a new password</h1>

      <form action={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">New password</Label>
          <Input id="password" name="password" type="password" required minLength={8} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Saving…" : "Save new password"}
        </Button>
      </form>
    </div>
  );
}
