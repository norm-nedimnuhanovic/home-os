import Link from "next/link";
import { Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Note, NoteTag, Tag } from "@prisma/client";

type NoteRow = Note & { tags: (NoteTag & { tag: Tag })[] };

function displayTitle(note: NoteRow): string {
  if (note.title) return note.title;
  const firstLine = note.body.split("\n")[0]?.trim();
  return firstLine || "Untitled note";
}

export function NoteList({ notes }: { notes: NoteRow[] }) {
  if (notes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No notes yet — capture your first one.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {notes.map((note) => (
        <li key={note.id}>
          <Link
            href={`/notes/${note.id}`}
            className="flex h-full flex-col gap-2 rounded-lg border p-4 transition-colors hover:bg-muted"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate font-medium">{displayTitle(note)}</p>
              {note.isPinned && <Pin className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Pinned" />}
            </div>
            <p className="line-clamp-3 flex-1 text-sm text-muted-foreground">{note.body}</p>
            {note.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {note.tags.map(({ tag }) => (
                  <Badge key={tag.id} variant="outline" className="text-xs">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
