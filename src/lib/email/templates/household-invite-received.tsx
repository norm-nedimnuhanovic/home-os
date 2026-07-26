import { Body, Button, Container, Head, Heading, Html, Text } from "@react-email/components";

// Sent directly by inviteMember() (settings/members/actions.ts), never
// through the standard NotificationPreference-gated pipeline — the
// recipient has no Member row yet, so there's no memberId to look a
// preference up against (docs/email.md §2.1).
export function householdInviteReceivedSubject(householdName: string) {
  return `You've been invited to join ${householdName} on Home OS`;
}

export function HouseholdInviteReceivedEmail({
  householdName,
  invitedByName,
  acceptUrl,
}: {
  householdName: string;
  invitedByName: string;
  acceptUrl: string;
}) {
  return (
    <Html>
      <Head />
      <Body>
        <Container>
          <Heading>Join {householdName} on Home OS</Heading>
          <Text>{invitedByName} invited you to join their household.</Text>
          <Button href={acceptUrl}>Accept invite</Button>
        </Container>
      </Body>
    </Html>
  );
}
