import { redirect } from "next/navigation";
import { publicEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export function isDemoMode() {
  return publicEnv.NEXT_PUBLIC_DEMO_MODE === "true";
}

export async function getCurrentUser() {
  if (isDemoMode()) {
    return null;
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user && !isDemoMode()) {
    redirect("/login");
  }

  return user;
}

export async function getCurrentMembership() {
  if (isDemoMode()) {
    return null;
  }

  const supabase = await getSupabaseServerClient();
  const user = await getCurrentUser();

  if (!supabase || !user) {
    return null;
  }

  const { data } = await supabase
    .schema("staffer")
    .from("memberships")
    .select("organisation_id, role")
    .limit(1)
    .maybeSingle();

  return data;
}
