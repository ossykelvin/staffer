"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/audit";
import { isDemoMode } from "@/lib/auth";
import { encryptIntegrationSecret } from "@/lib/integration-secrets";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const adminRoles = new Set(["founder", "administrator"]);

function slugifyKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function redirectToSettings(search: URLSearchParams): never {
  redirect(`/settings?${search.toString()}`);
}

async function getOrigin() {
  const requestHeaders = await headers();
  return requestHeaders.get("origin") ?? "http://localhost:3000";
}

async function requireAdminContext() {
  if (isDemoMode()) {
    return null;
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Authentication is required.");
  }

  const { data: membership, error } = await supabase
    .schema("staffer")
    .from("memberships")
    .select("organisation_id, role")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!membership?.organisation_id || !adminRoles.has(String(membership.role))) {
    throw new Error("Founder or administrator membership is required.");
  }

  return {
    supabase,
    user,
    organisationId: String(membership.organisation_id),
    role: String(membership.role),
  };
}

export async function updateOrganisationSettingsAction(formData: FormData) {
  const search = new URLSearchParams();
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const approvalMode = String(formData.get("approvalMode") ?? "default").trim();

  if (isDemoMode()) {
    search.set("message", "Demo settings staged. Live persistence is available when demo mode is disabled.");
    redirectToSettings(search);
  }

  try {
    if (!name) {
      throw new Error("Organisation name is required.");
    }

    const context = await requireAdminContext();
    if (!context) {
      throw new Error("Live organisation context is unavailable.");
    }

    const { error } = await context.supabase
      .schema("staffer")
      .from("organisations")
      .update({
        name,
        timezone: timezone || "Europe/London",
        settings: {
          approval_mode: approvalMode || "default",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", context.organisationId);

    if (error) {
      throw new Error(error.message);
    }

    await recordAuditEvent({
      organisationId: context.organisationId,
      actorType: "user",
      actorId: context.user.id,
      eventType: "organisation.settings_updated",
      entityType: "organisation",
      entityId: context.organisationId,
      summary: "Organisation settings were updated.",
      details: { name, timezone, approvalMode },
    });

    revalidatePath("/settings");
    search.set("message", "Organisation settings updated.");
  } catch (error) {
    search.set("error", error instanceof Error ? error.message : "Unable to update organisation settings.");
  }

  redirectToSettings(search);
}

export async function createInvitationAction(formData: FormData) {
  const search = new URLSearchParams();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "viewer");

  if (isDemoMode()) {
    search.set("message", "Demo invitation staged. Live invitations are created when demo mode is disabled.");
    redirectToSettings(search);
  }

  try {
    if (!email || !email.includes("@")) {
      throw new Error("A valid invitee email is required.");
    }

    const allowedRoles = new Set(["administrator", "reviewer", "operator", "viewer"]);
    if (!allowedRoles.has(role)) {
      throw new Error("Invitation role is not allowed.");
    }

    const context = await requireAdminContext();
    if (!context) {
      throw new Error("Live organisation context is unavailable.");
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const { error } = await context.supabase.schema("staffer").from("organisation_invitations").insert({
      organisation_id: context.organisationId,
      email,
      role,
      token_hash: tokenHash,
      invited_by: context.user.id,
    });

    if (error) {
      throw new Error(error.message);
    }

    await recordAuditEvent({
      organisationId: context.organisationId,
      actorType: "user",
      actorId: context.user.id,
      eventType: "membership.invitation_created",
      entityType: "organisation_invitation",
      entityId: email,
      summary: "Organisation invitation was created.",
      details: { email, role },
    });

    revalidatePath("/settings");
    search.set("message", "Invitation created. Share the generated invite link with the user.");
    search.set("invite", `${await getOrigin()}/invite/${token}`);
  } catch (error) {
    search.set("error", error instanceof Error ? error.message : "Unable to create invitation.");
  }

  redirectToSettings(search);
}

export async function storeIntegrationSecretAction(formData: FormData) {
  const search = new URLSearchParams();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const integrationKey = slugifyKey(String(formData.get("integrationKey") ?? displayName));
  const secretLabel = slugifyKey(String(formData.get("secretLabel") ?? "api-key"));
  const secretValue = String(formData.get("secretValue") ?? "");

  if (isDemoMode()) {
    search.set("message", "Demo integration secret staged. No secret was persisted in demo mode.");
    redirectToSettings(search);
  }

  try {
    if (!displayName || !integrationKey || !secretLabel) {
      throw new Error("Integration name, key and secret label are required.");
    }

    const context = await requireAdminContext();
    if (!context) {
      throw new Error("Live organisation context is unavailable.");
    }

    const encrypted = encryptIntegrationSecret(secretValue);

    const { error } = await context.supabase
      .schema("staffer")
      .from("integration_secrets")
      .upsert(
        {
          organisation_id: context.organisationId,
          integration_key: integrationKey,
          display_name: displayName,
          secret_label: secretLabel,
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          tag: encrypted.tag,
          key_version: encrypted.keyVersion,
          created_by: context.user.id,
          updated_by: context.user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organisation_id,integration_key,secret_label" },
      );

    if (error) {
      throw new Error(error.message);
    }

    await recordAuditEvent({
      organisationId: context.organisationId,
      actorType: "user",
      actorId: context.user.id,
      eventType: "integration_secret.stored",
      entityType: "integration_secret",
      entityId: `${integrationKey}:${secretLabel}`,
      summary: "Encrypted integration secret was stored or rotated.",
      details: { integrationKey, secretLabel, displayName },
    });

    revalidatePath("/settings");
    search.set("message", "Encrypted integration secret stored.");
  } catch (error) {
    search.set("error", error instanceof Error ? error.message : "Unable to store encrypted integration secret.");
  }

  redirectToSettings(search);
}
