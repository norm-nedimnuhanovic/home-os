import { sweepDueOccurrences } from "@/modules/reminders/jobs/sweep-due-occurrences";

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sweepDueOccurrences();
  return Response.json(result);
}
