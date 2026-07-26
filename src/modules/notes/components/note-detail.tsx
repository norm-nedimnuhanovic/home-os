"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { NoteForm } from "./note-form";
import { MarkdownBody } from "./markdown-body";
import { NoteLinkDialog } from "./note-link-dialog";
import { archiveNote } from "../actions/archive-note";
import { unarchiveNote } from "../actions/unarchive-note";
import { unlinkNote } from "../actions/unlink-note";
import type { Note, NoteTag, Tag, NoteLink } from "@prisma/client";

type NoteWithRelations = Note & {
  tags: (NoteTag & { tag: Tag })[];
  links: NoteLink[];
};

export function NoteDetail({
  note,
  members,
  tags,
  currentMemberId,
  linkableTasks,
  linkableEvents,
}: {
  note: NoteWithRelations;
  members: { id: string; displayName: string }[];
  tags: { id: string; name: string }[];
  currentMemberId: string;
  linkableTasks: { id: string; label: string }[];
  linkableEvents: { id: string; label: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const { isPending, run } = useActionFeedback();
  const router = useRouter();
  const isAuthor = note.authorMemberId === currentMemberId;

  const taskLabels = new Map(linkableTasks.map((t) => [t.id, t.label]));
  const eventLabels = new Map(linkableEvents.map((e) => [e.id, e.label]));

  function resolveLinkLabel(link: NoteLink): string {
    const label =
      link.linkedEntityType === "task"
        ? taskLabels.get(link.linkedEntityId)
        : link.linkedEntityType === "event"
          ? eventLabels.get(link.linkedEntityId)
          : undefined;
    const typeLabel = link.linkedEntityType[0].toUpperCase() + link.linkedEntityType.slice(1);
    // Graceful degradation (plan.md §4.5's pattern, applied here too): the
    // linked object may no longer resolve (deleted, or just out of the
    // linkable list's current window) — fall back rather than error.
    return label ? `${typeLabel}: ${label}` : `${typeLabel} (no longer available)`;
  }

  if (editing) {
    return <NoteForm note={note} members={members} tags={tags} onDone={() => setEditing(false)} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-2xl font-semibold">{note.title || "Untitled note"}</h1>
        {isAuthor && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              className="w-full sm:w-auto"
              onClick={() =>
                note.isArchived
                  ? run(() => unarchiveNote(note.id), "Note unarchived")
                  : run(
                      async () => {
                        await archiveNote(note.id);
                        router.push("/notes");
                      },
                      "Note archived",
                    )
              }
            >
              {note.isArchived ? "Unarchive" : "Archive"}
            </Button>
          </div>
        )}
      </div>

      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {note.tags.map(({ tag }) => (
            <Badge key={tag.id} variant="outline">
              {tag.name}
            </Badge>
          ))}
        </div>
      )}

      <MarkdownBody body={note.body} />

      <div className="flex flex-col gap-2 border-t pt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-medium">Linked to</h2>
          {isAuthor && <NoteLinkDialog noteId={note.id} tasks={linkableTasks} events={linkableEvents} />}
        </div>
        {note.links.length === 0 && <p className="text-sm text-muted-foreground">Nothing linked yet.</p>}
        <ul className="flex flex-col gap-1">
          {note.links.map((link) => (
            <li key={link.id} className="flex items-center justify-between text-sm">
              <span>{resolveLinkLabel(link)}</span>
              {isAuthor && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => run(() => unlinkNote(note.id, link.id), "Link removed")}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
