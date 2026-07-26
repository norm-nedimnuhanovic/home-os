import { Body, Container, Head, Heading, Html, Section, Text } from "@react-email/components";
import type { Notification, Reminder, ReminderOccurrence } from "@prisma/client";

export function digestSubject(frequency: "daily" | "weekly") {
  return frequency === "daily" ? "Your daily Home OS digest" : "Your weekly Home OS digest";
}

export function DigestEmail({
  notifications,
  occurrences,
}: {
  notifications: Notification[];
  occurrences: (ReminderOccurrence & { reminder: Reminder })[];
}) {
  return (
    <Html>
      <Head />
      <Body>
        <Container>
          <Heading>Your Home OS digest</Heading>
          {notifications.length === 0 && occurrences.length === 0 && <Text>Nothing new since your last digest.</Text>}
          {notifications.length > 0 && (
            <Section>
              <Heading as="h2">Notifications</Heading>
              {notifications.map((notification) => (
                <Text key={notification.id}>{notification.title}</Text>
              ))}
            </Section>
          )}
          {occurrences.length > 0 && (
            <Section>
              <Heading as="h2">Active reminders</Heading>
              {occurrences.map((occurrence) => (
                <Text key={occurrence.id}>{occurrence.reminder.title}</Text>
              ))}
            </Section>
          )}
        </Container>
      </Body>
    </Html>
  );
}
