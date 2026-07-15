import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { getAgents } from "@/lib/repositories/staffer";

export const dynamic = "force-dynamic";

export async function GET() {
  if (publicEnv.NEXT_PUBLIC_DEMO_MODE !== "true" && !(await getCurrentUser())) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const agents = await getAgents();
  return NextResponse.json(
    { data: agents, count: agents.length },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
