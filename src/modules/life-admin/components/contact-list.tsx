"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ContactForm } from "./contact-form";
import { toggleContactPin } from "../actions/toggle-contact-pin";
import { deleteContact } from "../actions/delete-contact";
import type { Contact } from "@prisma/client";

type MemberOption = { id: string; displayName: string };

export function ContactList({ contacts, members }: { contacts: Contact[]; members: MemberOption[] }) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);

  if (contacts.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No contacts yet — add one to get started.
      </p>
    );
  }

  const pinned = contacts.filter((c) => c.isPinned);
  const rest = contacts.filter((c) => !c.isPinned);

  function renderGroup(group: Contact[]) {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {group.map((contact) => (
          <div key={contact.id} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <button type="button" className="min-w-0 flex-1 cursor-pointer text-left" onClick={() => setEditing(contact)}>
                <p className="truncate font-medium">{contact.name}</p>
                <p className="truncate text-xs text-muted-foreground">{contact.category.replace(/_/g, " ")}</p>
              </button>
              <Button
                variant="ghost"
                size="icon"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await toggleContactPin(contact.id, !contact.isPinned);
                  })
                }
                aria-label={contact.isPinned ? "Unpin contact" : "Pin contact"}
              >
                <Star className={contact.isPinned ? "h-4 w-4 fill-current" : "h-4 w-4"} />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
              {contact.phone && <Badge variant="outline">{contact.phone}</Badge>}
              {contact.email && <Badge variant="outline">{contact.email}</Badge>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(contact)}>
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleting(contact)}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pinned.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Pinned</h2>
          {renderGroup(pinned)}
        </section>
      )}
      {rest.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">All contacts</h2>
          {renderGroup(rest)}
        </section>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
          <DialogHeader>
            <DialogTitle>Edit contact</DialogTitle>
          </DialogHeader>
          {editing && <ContactForm contact={editing} members={members} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete contact"
        description={deleting ? `"${deleting.name}" will be permanently deleted. This cannot be undone.` : ""}
        confirmLabel="Delete"
        successMessage="Contact deleted"
        onConfirm={() => deleteContact(deleting!.id)}
      />
    </div>
  );
}
