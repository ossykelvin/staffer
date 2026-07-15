import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const next = requestUrl.searchParams.get("next") ?? "/";
  const redirectTo = new URL(next.startsWith("/") ? next : "/", requestUrl.origin);

  if (tokenHash && type) {
    const supabase = await getSupabaseServerClient();
    const { error } = (await supabase?.auth.verifyOtp({ token_hash: tokenHash, type })) ?? { error: new Error("Supabase is not configured.") };

    if (!error) {
      return NextResponse.redirect(redirectTo);
    }
  }

  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent("Authentication link is invalid or expired.")}`, requestUrl.origin));
}
