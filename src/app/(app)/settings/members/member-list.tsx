import { Badge } from "@/components/ui/badge";
import { MemberRowActions } from "./member-row-actions";
import { InviteRowActions } from "./invite-row-actions";
import type { Member, Invite, MemberRole } from "@prisma/client";

const ROLE_VARIANT: Record<MemberRole, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
  member: "outline",
};

export function MemberList({
  members,
  pendingInvites,
  actingMember,
}: {
  members: Member[];
  pendingInvites: Invite[];
  actingMember: { id: string; role: MemberRole };
}) {
  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-2">
        {members.map((member) => (
          <li key={member.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-medium">
                {member.displayName}
                {member.id === actingMember.id && <span className="text-muted-foreground"> (you)</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">{member.email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant={ROLE_VARIANT[member.role]}>{member.role}</Badge>
              <MemberRowActions member={member} actingMember={actingMember} />
            </div>
          </li>
        ))}
      </ul>

      {pendingInvites.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Pending invites</h2>
          <ul className="flex flex-col gap-2">
            {pendingInvites.map((invite) => {
              // Nothing ever flips Invite.status to the schema's `expired`
              // value (docs/auth.md's getInviteByToken() derives it from
              // expiresAt at read time instead) — surfacing that here is
              // what actually makes the "Resend" action legible: an admin
              // needs to know *why* to resend, not just that they can.
              const isExpired = new Date(invite.expiresAt) < new Date();
              return (
                <li
                  key={invite.id}
                  className="flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{invite.email}</p>
                    <p className={`text-xs ${isExpired ? "text-destructive" : "text-muted-foreground"}`}>
                      {isExpired ? "Expired" : "Expires"} {new Date(invite.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline">{invite.role}</Badge>
                    {actingMember.role !== "member" && <InviteRowActions inviteId={invite.id} />}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
