"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RenewalForm } from "./renewal-form";

type MemberOption = { id: string; displayName: string };
type ContactOption = { id: string; name: string };

export function NewRenewalDialog({ members, contacts }: { members: MemberOption[]; contacts: ContactOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">New renewal</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>Add a renewal</DialogTitle>
        </DialogHeader>
        <RenewalForm members={members} contacts={contacts} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
