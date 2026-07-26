"use client";

import { useTransition } from "react";
import { toast } from "sonner";

// Shared wrapper for the ~20 bare-button Server Action calls across the app
// that had zero try/catch at all — a thrown error was previously an
// unhandled promise rejection with no visible signal, success or failure.
// `successMessage` omitted means "stay silent on success" — for a toggle
// clicked repeatedly in quick succession (a checkbox, a pause/resume
// switch), a toast on every click is noise, not signal; the error path
// still always fires.
export function useActionFeedback() {
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<unknown>, successMessage?: string) {
    startTransition(async () => {
      try {
        await action();
        if (successMessage) toast.success(successMessage);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return { isPending, run };
}
