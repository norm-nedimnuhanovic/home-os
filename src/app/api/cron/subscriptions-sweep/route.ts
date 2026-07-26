import { sweepSubscriptionDueDates } from "@/modules/finance/jobs/sweep-subscription-due-dates";

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  await sweepSubscriptionDueDates();
  return new Response("ok");
}
