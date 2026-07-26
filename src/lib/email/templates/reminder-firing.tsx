import { Body, Button, Container, Head, Heading, Html, Text } from "@react-email/components";

// Generic Reminder-fired template — every sourceType except `subscription`
// (docs/email.md §7.1), which gets the nicer-copy bill-due-soon.tsx variant
// of this same firing pipeline instead.
export function reminderFiringSubject(reminder: { title: string }) {
  return `Reminder: ${reminder.title}`;
}

export function ReminderFiringEmail({ reminder }: { reminder: { title: string; description: string | null } }) {
  return (
    <Html>
      <Head />
      <Body>
        <Container>
          <Heading>{reminder.title}</Heading>
          {reminder.description && <Text>{reminder.description}</Text>}
          <Button href={`${process.env.NEXT_PUBLIC_SITE_URL}/reminders`}>View reminder</Button>
        </Container>
      </Body>
    </Html>
  );
}
