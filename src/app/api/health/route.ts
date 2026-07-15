import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    app: publicEnv.NEXT_PUBLIC_APP_NAME,
    demoMode: publicEnv.NEXT_PUBLIC_DEMO_MODE === "true",
    configuration: {
      publicEnv: "valid",
      liveServices: "not_required_for_demo",
    },
    timestamp: new Date().toISOString(),
  });
}
