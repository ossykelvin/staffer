"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sendSignupWelcomeEmail } from "@/lib/email/identity";
import { emailDomain, logStructured, maskEmail } from "@/lib/observability/log";
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
  const startedAt = Date.now();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const supabase = await getSupabaseServerClient();
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? "http://localhost:3000";
  const logContext = {
    route: "/login",
    action: "sign_up",
    requestId: requestHeaders.get("x-vercel-id"),
    emailMasked: maskEmail(email),
    emailDomain: emailDomain(email),
  };

  if (!supabase) {
    logStructured("error", "auth.signup.supabase_unconfigured", logContext);
    redirectWithError("Supabase is not configured for live authentication.");
  }

  logStructured("info", "auth.signup.started", logContext);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
    },
  });

  if (error) {
    logStructured("error", "auth.signup.failed", {
      ...logContext,
      error: error.message,
      ms: Date.now() - startedAt,
    });
    redirectWithError(error.message);
  }

  logStructured("info", "auth.signup.created", {
    ...logContext,
    userId: data.user?.id,
    requiresEmailConfirmation: !data.session,
    ms: Date.now() - startedAt,
  });

  let welcomeMessage = "Check your email to confirm your account, then create your organisation.";
  try {
    const welcomeResult = await sendSignupWelcomeEmail({ email, appUrl: origin });
    logStructured("info", "auth.signup_welcome_email.sent", {
      ...logContext,
      provider: welcomeResult.provider,
      mode: welcomeResult.mode,
      messageId: welcomeResult.messageId,
      ms: Date.now() - startedAt,
    });
    welcomeMessage = "Check your email for the confirmation link and Staffer welcome email, then create your organisation.";
  } catch (welcomeError) {
    logStructured("error", "auth.signup_welcome_email.failed", {
      ...logContext,
      error: welcomeError instanceof Error ? welcomeError.message : "Unknown welcome email failure.",
      ms: Date.now() - startedAt,
    });
    welcomeMessage = "Account signup was accepted. Check your email for the confirmation link; the Staffer welcome email could not be sent yet.";
  }

  redirect(`/login?message=${encodeURIComponent(welcomeMessage)}`);
}
