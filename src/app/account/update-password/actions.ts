"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function updatePasswordAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (password.length < 8) {
    redirect(`/account/update-password?error=${encodeURIComponent("Password must be at least 8 characters.")}`);
  }

  if (password !== confirmation) {
    redirect(`/account/update-password?error=${encodeURIComponent("Passwords do not match.")}`);
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    redirect(`/account/update-password?error=${encodeURIComponent("Supabase is not configured.")}`);
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/account/update-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/settings?message=Password updated.");
}
