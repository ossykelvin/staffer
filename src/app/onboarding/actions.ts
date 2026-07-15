"use server";

import { redirect } from "next/navigation";
import { publicEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createOrganisationAction(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const slug = slugify(String(formData.get("slug") ?? name));
  const timezone = String(formData.get("timezone") ?? "Europe/London");

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirect(`/onboarding?message=${encodeURIComponent("Demo organisation staged. Live creation is blocked until Supabase is connected.")}`);
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    redirect(`/onboarding?error=${encodeURIComponent("Supabase is not configured.")}`);
  }

  const { error } = await supabase.schema("staffer").rpc("create_organisation_for_current_user", {
    organisation_name: name,
    organisation_slug: slug,
    organisation_timezone: timezone,
  });

  if (error) {
    redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/");
}
