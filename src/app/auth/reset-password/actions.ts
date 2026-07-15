"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    redirect(`/auth/reset-password?error=${encodeURIComponent("Email is required.")}`);
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    redirect(`/auth/reset-password?error=${encodeURIComponent("Supabase is not configured for live authentication.")}`);
  }

  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/account/update-password`,
  });

  if (error) {
    redirect(`/auth/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/auth/reset-password?message=${encodeURIComponent("If an account exists for that email, a password reset link has been sent.")}`);
}
