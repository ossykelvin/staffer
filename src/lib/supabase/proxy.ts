import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv, publicEnv } from "@/lib/env";

const protectedPrefixes = ["/agents", "/approvals", "/integrations", "/knowledge", "/onboarding", "/settings", "/tasks", "/workflows"];

export async function updateSession(request: NextRequest) {
  const env = getSupabaseEnv();

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true" || !env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const pathname = request.nextUrl.pathname;
  const isProtected = protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/auth/");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && isProtected && !pathname.startsWith("/onboarding")) {
    const { data: membership } = await supabase.schema("staffer").from("memberships").select("organisation_id").limit(1).maybeSingle();
    if (!membership?.organisation_id) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
