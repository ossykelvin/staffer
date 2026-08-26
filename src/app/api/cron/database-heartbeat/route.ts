import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

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

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase
    .schema("staffer")
    .from("agents")
    .select("id", { count: "exact", head: true })
    .limit(1);

  if (error) {
    console.error("[database-heartbeat]", error.message);
    return Response.json({ error: "Database heartbeat failed" }, { status: 503 });
  }
  return Response.json({ ok: true, database: "reachable" });
}
