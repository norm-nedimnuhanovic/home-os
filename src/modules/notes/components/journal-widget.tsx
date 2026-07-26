"use client";

import { useState, useTransition } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { upsertJournalEntry } from "../actions/upsert-journal-entry";

export function JournalWidget({ initialBody, entryDate }: { initialBody: string; entryDate: Date }) {
  const [body, setBody] = useState(initialBody);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSave() {
    startTransition(async () => {
      await upsertJournalEntry({ body, entryDate });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">
          Today&apos;s journal ·{" "}
          {entryDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </h2>
        <span className="text-xs text-muted-foreground">Private — only you can see this</span>
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="What's on your mind today?"
      />
      <Button
        size="sm"
        disabled={isPending || !body.trim()}
        onClick={handleSave}
        className="w-full sm:w-auto"
      >
        {saved ? "Saved" : "Save entry"}
      </Button>
    </div>
  );
}
