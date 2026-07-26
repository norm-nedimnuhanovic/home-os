import { sendDueDigests } from "@/lib/notifications/jobs/send-digests";

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sendDueDigests();
  return Response.json(result);
}
