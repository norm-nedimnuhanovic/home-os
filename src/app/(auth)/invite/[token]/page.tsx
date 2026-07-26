import { getInviteByToken } from "../../actions";
import { AcceptInviteForm } from "./accept-invite-form";

// docs/auth.md §5 — server-renders the invite (reject up front if it's
// missing, already accepted/expired/revoked) before ever showing the form.
export default async function InviteAcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInviteByToken(token);

  if (!invite) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-2 p-4 text-center">
        <h1 className="text-2xl font-semibold">This invite is no longer valid</h1>
        <p className="text-sm text-muted-foreground">Ask an admin to send you a new one.</p>
      </div>
    );
  }

  return (
    <AcceptInviteForm
      token={token}
      householdName={invite.household.name}
      invitedByName={invite.invitedByMember.displayName}
      email={invite.email}
    />
  );
}
