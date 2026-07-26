import { Body, Button, Container, Head, Heading, Html, Text } from "@react-email/components";

export function taskAssignedSubject() {
  return "You've been assigned a task";
}

export function TaskAssignedEmail({ taskTitle, assignedByName }: { taskTitle: string; assignedByName: string }) {
  return (
    <Html>
      <Head />
      <Body>
        <Container>
          <Heading>{taskTitle}</Heading>
          <Text>{assignedByName} assigned you this task.</Text>
          <Button href={`${process.env.NEXT_PUBLIC_SITE_URL}/tasks`}>View task</Button>
        </Container>
      </Body>
    </Html>
  );
}
