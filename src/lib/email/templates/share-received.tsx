import { Body, Button, Container, Head, Heading, Html, Text } from "@react-email/components";

export function shareReceivedSubject() {
  return "Something was shared with you";
}

// No per-module deep link (docs/orm-conventions.md §4.1's resolveSourceEntity()
// isn't built) — falls back to the dashboard, always a valid destination.
export function ShareReceivedEmail({ objectType, sharedByName }: { objectType: string; sharedByName: string }) {
  return (
    <Html>
      <Head />
      <Body>
        <Container>
          <Heading>Something was shared with you</Heading>
          <Text>
            {sharedByName} shared a {objectType.toLowerCase()} with you.
          </Text>
          <Button href={`${process.env.NEXT_PUBLIC_SITE_URL}/dashboard`}>Open Home OS</Button>
        </Container>
      </Body>
    </Html>
  );
}
