"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { createCard } from "../actions/create-card";

export function AddCardInput({ boardId, columnId }: { boardId: string; columnId: string }) {
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setTitle("");
    startTransition(async () => {
      await createCard(boardId, columnId, { title: trimmed });
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="+ Add a card"
        disabled={isPending}
        className="border-dashed bg-transparent text-sm"
      />
    </form>
  );
}
