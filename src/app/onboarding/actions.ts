"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/audit";
import { sendOrganisationWelcomeEmail } from "@/lib/email/identity";
import { publicEnv } from "@/lib/env";
import { emailDomain, logStructured, maskEmail } from "@/lib/observability/log";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createOrganisationAction(formData: FormData) {
  const startedAt = Date.now();
  const name = String(formData.get("name") ?? "");
  const slug = slugify(String(formData.get("slug") ?? name));
  const timezone = String(formData.get("timezone") ?? "Europe/London");
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? "http://localhost:3000";
  const logContext = {
    route: "/onboarding",
    action: "create_organisation",
    requestId: requestHeaders.get("x-vercel-id"),
    organisationSlug: slug,
  };

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirect(`/onboarding?message=${encodeURIComponent("Demo organisation staged. Live creation is blocked until Supabase is connected.")}`);
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    logStructured("error", "identity.onboarding.supabase_unconfigured", logContext);
    redirect(`/onboarding?error=${encodeURIComponent("Supabase is not configured.")}`);
  }

  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError || !userResult.user) {
    logStructured("error", "identity.onboarding.user_read_failed", {
      ...logContext,
      error: userError?.message ?? "Current user unavailable.",
      ms: Date.now() - startedAt,
    });
    redirect(`/onboarding?error=${encodeURIComponent(userError?.message ?? "Authenticated user is required before onboarding can finish.")}`);
  }

  logStructured("info", "identity.onboarding.started", {
    ...logContext,
    userId: userResult.user.id,
  });

  const { data: organisation, error } = await supabase.schema("staffer").rpc("create_organisation_for_current_user", {
    organisation_name: name,
    organisation_slug: slug,
    organisation_timezone: timezone,
  });

  if (error) {
    logStructured("error", "identity.onboarding.failed", {
      ...logContext,
      userId: userResult.user.id,
      error: error.message,
      ms: Date.now() - startedAt,
    });
    redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  }

  const organisationRecord = organisation as { id?: string; name?: string; slug?: string } | null;
  const organisationId = organisationRecord?.id ?? null;
  const organisationName = organisationRecord?.name ?? name;
  const userEmail = userResult.user.email ?? "";
  let message = "Organisation created. Welcome to Staffer.";

  if (userEmail && organisationId) {
    const emailContext = {
      ...logContext,
      userId: userResult.user.id,
      organisationId,
      emailMasked: maskEmail(userEmail),
      emailDomain: emailDomain(userEmail),
    };

    try {
      const welcomeResult = await sendOrganisationWelcomeEmail({
        email: userEmail,
        organisationName,
        appUrl: origin,
      });

      logStructured("info", "identity.organisation_welcome_email.sent", {
        ...emailContext,
        provider: welcomeResult.provider,
        mode: welcomeResult.mode,
        messageId: welcomeResult.messageId,
        ms: Date.now() - startedAt,
      });

      await recordAuditEvent({
        organisationId,
        actorType: "user",
        actorId: userResult.user.id,
        eventType: "identity.organisation_welcome_email_sent",
        entityType: "organisation",
        entityId: organisationId,
        summary: "Founder onboarding welcome email was sent.",
        details: {
          provider: welcomeResult.provider,
          mode: welcomeResult.mode,
          messageId: welcomeResult.messageId,
          recipientDomain: emailDomain(userEmail),
        },
      });

      message = "Organisation created and welcome email sent.";
    } catch (welcomeError) {
      const reason = welcomeError instanceof Error ? welcomeError.message : "Unknown welcome email failure.";
      logStructured("error", "identity.organisation_welcome_email.failed", {
        ...emailContext,
        error: reason,
        ms: Date.now() - startedAt,
      });

      await recordAuditEvent({
        organisationId,
        actorType: "user",
        actorId: userResult.user.id,
        eventType: "identity.organisation_welcome_email_failed",
        entityType: "organisation",
        entityId: organisationId,
        summary: "Founder onboarding welcome email failed.",
        details: {
          reason,
          recipientDomain: emailDomain(userEmail),
        },
      });

      message = "Organisation created. Welcome email could not be sent yet.";
    }
  }

  logStructured("info", "identity.onboarding.created", {
    ...logContext,
    userId: userResult.user.id,
    organisationId,
    ms: Date.now() - startedAt,
  });

  redirect(`/?message=${encodeURIComponent(message)}`);
}
