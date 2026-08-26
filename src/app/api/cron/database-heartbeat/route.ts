import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";

function isAuthorized(request: Request, secret: string) {
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return Response.json({ error: "Cron is not configured" }, { status: 503 });
  if (!isAuthorized(request, secret)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!url || !key) return Response.json({ error: "Database is not configured" }, { status: 503 });

  const response = await fetch(`${url}/rest/v1/agents?select=id&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Accept-Profile": "staffer",
    },
    cache: "no-store",
  });

  // RLS may reject this intentionally for the publishable key. Any non-5xx
  // response still proves that Supabase/PostgREST reached the database.
  if (response.status >= 500) {
    console.error("[database-heartbeat] Supabase returned", response.status);
    return Response.json({ error: "Database heartbeat failed" }, { status: 503 });
  }
  return Response.json({ ok: true, database: "reachable" });
}
