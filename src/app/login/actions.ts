"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function redirectWithError(message: string): never {
  redirect(`/login?error=${encodeURIComponent(message)}`);
}

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    redirectWithError("Supabase is not configured for live authentication.");
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirectWithError(error.message);
  }

  redirect(next.startsWith("/") ? next : "/");
}

export async function signUpAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    redirectWithError("Supabase is not configured for live authentication.");
  }

  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
    },
  });

  if (error) {
    redirectWithError(error.message);
  }

  redirect("/login?message=Check your email to confirm your account, then create your organisation.");
}
