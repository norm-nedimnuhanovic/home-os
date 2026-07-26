import { sweepBudgetThresholds } from "@/modules/finance/jobs/sweep-budget-thresholds";

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  await sweepBudgetThresholds();
  return new Response("ok");
}
