import { sweepRenewalLifecycle } from "@/modules/life-admin/jobs/sweep-renewal-lifecycle";

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sweepRenewalLifecycle();
  return Response.json(result);
}
