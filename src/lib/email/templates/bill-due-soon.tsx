import { Body, Button, Container, Head, Heading, Html, Text } from "@react-email/components";

// Not a second delivery path — a nicer-copy template variant of the same
// reminder-firing pipeline (reminder-firing.tsx), selected by
// Reminder.sourceType === "subscription" (docs/email.md §7.1).
export function billDueSoonSubject(reminder: { title: string }) {
  return `Bill due soon: ${reminder.title}`;
}

export function BillDueSoonEmail({ reminder }: { reminder: { title: string; description: string | null } }) {
  return (
    <Html>
      <Head />
      <Body>
        <Container>
          <Heading>{reminder.title}</Heading>
          <Text>This bill is coming up — take care of it before the due date.</Text>
          {reminder.description && <Text>{reminder.description}</Text>}
          <Button href={`${process.env.NEXT_PUBLIC_SITE_URL}/finance/subscriptions`}>View subscription</Button>
        </Container>
      </Body>
    </Html>
  );
}
