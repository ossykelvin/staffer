"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/audit";
import { isDemoMode } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const adminRoles = new Set(["founder", "administrator"]);
const agentStatuses = new Set(["draft", "active", "retired"]);

type AdminContext = {
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>;
  user: { id: string };
  organisationId: string;
};

function slugifyKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function textList(formData: FormData, key: string) {
  return text(formData, key)
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function intValue(formData: FormData, key: string, fallback: number) {
  const parsed = Number.parseInt(text(formData, key), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function jsonObjectValue(formData: FormData, key: string) {
  const raw = text(formData, key);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected a JSON object.");
    }

    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`${key} must be valid JSON object syntax.`);
  }
}

function redirectWithParams(path: string, params: Record<string, string>): never {
  const search = new URLSearchParams(params);
  redirect(`${path}?${search.toString()}`);
}

function isRedirectError(error: unknown) {
  return typeof error === "object" && error !== null && "digest" in error && String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT");
}

async function requireAdminContext(): Promise<AdminContext> {
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

  return { supabase, user, organisationId: String(membership.organisation_id) };
}

function buildAgentPayload(formData: FormData, organisationId: string, userId: string, version: number) {
  const name = text(formData, "name");
  const key = slugifyKey(text(formData, "key") || name);
  const jobTitle = text(formData, "jobTitle");
  const department = text(formData, "department");
  const summary = text(formData, "summary");
  const status = text(formData, "status") || "draft";
  const autonomyLevel = Math.min(5, Math.max(0, intValue(formData, "autonomyLevel", 1)));
  const experienceYears = Math.max(0, intValue(formData, "experienceYears", 0));
  const avatarPath = text(formData, "avatarPath");

  if (!name || !key || !jobTitle || !department || !summary) {
    throw new Error("Name, key, job title, department and biography are required.");
  }

  if (!agentStatuses.has(status)) {
    throw new Error("Agent status is not allowed.");
  }

  if (avatarPath && !avatarPath.startsWith("/")) {
    throw new Error("Avatar path must start with / or be left blank.");
  }

  const profile = {
    pronouns: text(formData, "pronouns") || "they/them",
    location: text(formData, "location") || "Configured by organisation",
    timezone: text(formData, "timezone") || "Configured by organisation",
    experienceYears,
    profileStatus: text(formData, "profileStatus") || "draft",
    initials: text(formData, "initials") || name.slice(0, 2).toUpperCase(),
    accent: text(formData, "accent") || "blue",
    avatarPath: avatarPath || undefined,
    avatarStyle: text(formData, "avatarStyle") || undefined,
    personality: textList(formData, "personality"),
    communicationStyle: text(formData, "communicationStyle") || "Configured by organisation",
    background: text(formData, "background") || undefined,
    personalDetail: text(formData, "personalDetail") || undefined,
    signatureHabit: text(formData, "signatureHabit") || undefined,
    tools: textList(formData, "tools"),
    requiresApproval: textList(formData, "requiresApproval"),
  };

  return {
    organisation_id: organisationId,
    key,
    name,
    job_title: jobTitle,
    department,
    biography: summary,
    profile,
    autonomy_level: autonomyLevel,
    status,
    version,
    created_by: userId,
    updated_at: new Date().toISOString(),
  };
}

async function recordAgentVersion(context: AdminContext, agent: Record<string, unknown>, changeSummary: string) {
  const { error } = await context.supabase.schema("staffer").from("agent_versions").insert({
    organisation_id: context.organisationId,
    agent_id: agent.id,
    version: agent.version,
    snapshot: agent,
    change_summary: changeSummary,
    created_by: context.user.id,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function createAgentAction(formData: FormData) {
  if (isDemoMode()) {
    redirectWithParams("/agents/new", { message: "Demo agent staged. Live persistence is available when demo mode is disabled." });
  }

  let target = "/agents";

  try {
    const context = await requireAdminContext();
    const payload = buildAgentPayload(formData, context.organisationId, context.user.id, 1);

    const { data: agent, error } = await context.supabase
      .schema("staffer")
      .from("agents")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await recordAgentVersion(context, agent as Record<string, unknown>, "Agent profile created.");
    await recordAuditEvent({
      organisationId: context.organisationId,
      actorType: "user",
      actorId: context.user.id,
      eventType: "agent.created",
      entityType: "agent",
      entityId: String(agent.id),
      summary: "Agent profile was created.",
      details: { key: payload.key, name: payload.name, version: payload.version },
    });

    revalidatePath("/agents");
    target = `/agents/${payload.key}`;
    redirectWithParams(target, { message: "Agent profile created and version 1 recorded." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(target, { error: error instanceof Error ? error.message : "Unable to create agent profile." });
  }
}

export async function updateAgentAction(formData: FormData) {
  const key = slugifyKey(text(formData, "originalKey") || text(formData, "key"));

  if (isDemoMode()) {
    redirectWithParams(`/agents/${key}`, { message: "Demo profile update staged. No live record was changed." });
  }

  let target = key ? `/agents/${key}` : "/agents";

  try {
    const context = await requireAdminContext();

    const { data: existing, error: existingError } = await context.supabase
      .schema("staffer")
      .from("agents")
      .select("*")
      .eq("organisation_id", context.organisationId)
      .eq("key", key)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (!existing?.id) {
      throw new Error("Agent profile was not found.");
    }

    const nextVersion = Number(existing.version ?? 1) + 1;
    const payload = buildAgentPayload(formData, context.organisationId, context.user.id, nextVersion);
    const updatePayload: Partial<typeof payload> = { ...payload };
    delete updatePayload.created_by;
    delete updatePayload.organisation_id;

    const { data: updated, error } = await context.supabase
      .schema("staffer")
      .from("agents")
      .update(updatePayload)
      .eq("id", existing.id)
      .eq("organisation_id", context.organisationId)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const changeSummary = text(formData, "changeSummary") || "Agent profile updated.";
    await recordAgentVersion(context, updated as Record<string, unknown>, changeSummary);
    await recordAuditEvent({
      organisationId: context.organisationId,
      actorType: "user",
      actorId: context.user.id,
      eventType: "agent.updated",
      entityType: "agent",
      entityId: String(updated.id),
      summary: "Agent profile was updated.",
      details: { previousKey: key, key: payload.key, version: payload.version, changeSummary },
    });

    revalidatePath("/agents");
    target = `/agents/${payload.key}`;
    redirectWithParams(target, { message: `Agent profile updated. Version ${payload.version} recorded.` });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(target, { error: error instanceof Error ? error.message : "Unable to update agent profile." });
  }
}

export async function setAgentStatusAction(formData: FormData) {
  const key = slugifyKey(text(formData, "key"));
  const status = text(formData, "status");

  if (isDemoMode()) {
    redirectWithParams(`/agents/${key}`, { message: `Demo status change staged: ${status}.` });
  }

  try {
    if (!key || !agentStatuses.has(status)) {
      throw new Error("A valid agent and status are required.");
    }

    const context = await requireAdminContext();
    const { data: existing, error: existingError } = await context.supabase
      .schema("staffer")
      .from("agents")
      .select("*")
      .eq("organisation_id", context.organisationId)
      .eq("key", key)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (!existing?.id) {
      throw new Error("Agent profile was not found.");
    }

    const nextVersion = Number(existing.version ?? 1) + 1;
    const { data: updated, error } = await context.supabase
      .schema("staffer")
      .from("agents")
      .update({ status, version: nextVersion, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("organisation_id", context.organisationId)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await recordAgentVersion(context, updated as Record<string, unknown>, `Agent status changed to ${status}.`);
    await recordAuditEvent({
      organisationId: context.organisationId,
      actorType: "user",
      actorId: context.user.id,
      eventType: "agent.status_changed",
      entityType: "agent",
      entityId: String(updated.id),
      summary: `Agent status changed to ${status}.`,
      details: { key, status, version: nextVersion },
    });

    revalidatePath("/agents");
    redirectWithParams(`/agents/${key}`, { message: `Agent ${status === "active" ? "activated" : status}. Version ${nextVersion} recorded.` });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/agents/${key || ""}`, { error: error instanceof Error ? error.message : "Unable to change agent status." });
  }
}

export async function createSkillAction(formData: FormData) {
  const agentKey = slugifyKey(text(formData, "agentKey"));
  const name = text(formData, "name");
  const key = slugifyKey(text(formData, "key") || name);
  const description = text(formData, "description");

  if (isDemoMode()) {
    redirectWithParams(agentKey ? `/agents/${agentKey}` : "/agents", { message: "Demo skill staged. Live persistence is available when demo mode is disabled." });
  }

  try {
    if (!name || !key) {
      throw new Error("Skill name and key are required.");
    }

    const context = await requireAdminContext();
    const { data: skill, error } = await context.supabase
      .schema("staffer")
      .from("skills")
      .insert({
        organisation_id: context.organisationId,
        key,
        name,
        description: description || null,
      })
      .select("id, key, name")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await recordAuditEvent({
      organisationId: context.organisationId,
      actorType: "user",
      actorId: context.user.id,
      eventType: "skill.created",
      entityType: "skill",
      entityId: String(skill.id),
      summary: "Skill catalogue entry was created.",
      details: { key, name },
    });

    revalidatePath("/agents");
    redirectWithParams(agentKey ? `/agents/${agentKey}` : "/agents", { message: "Skill added to the organisation catalogue." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(agentKey ? `/agents/${agentKey}` : "/agents", { error: error instanceof Error ? error.message : "Unable to create skill." });
  }
}

export async function assignAgentSkillAction(formData: FormData) {
  const agentKey = slugifyKey(text(formData, "agentKey"));
  const agentId = text(formData, "agentId");
  const skillId = text(formData, "skillId");
  const proficiency = Math.min(5, Math.max(1, intValue(formData, "proficiency", 3)));

  if (isDemoMode()) {
    redirectWithParams(`/agents/${agentKey}`, { message: "Demo skill mapping staged. No live record was changed." });
  }

  try {
    if (!agentId || !skillId) {
      throw new Error("Agent and skill are required.");
    }

    const context = await requireAdminContext();
    const { data: existing, error: existingError } = await context.supabase
      .schema("staffer")
      .from("agents")
      .select("*")
      .eq("organisation_id", context.organisationId)
      .eq("id", agentId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (!existing?.id) {
      throw new Error("Agent profile was not found.");
    }

    const { error } = await context.supabase
      .schema("staffer")
      .from("agent_skills")
      .upsert({ agent_id: agentId, skill_id: skillId, proficiency }, { onConflict: "agent_id,skill_id" });

    if (error) {
      throw new Error(error.message);
    }

    const nextVersion = Number(existing.version ?? 1) + 1;
    const { data: updated, error: updateError } = await context.supabase
      .schema("staffer")
      .from("agents")
      .update({ version: nextVersion, updated_at: new Date().toISOString() })
      .eq("id", agentId)
      .eq("organisation_id", context.organisationId)
      .select("*")
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    await recordAgentVersion(context, updated as Record<string, unknown>, "Agent skill mapping updated.");
    await recordAuditEvent({
      organisationId: context.organisationId,
      actorType: "user",
      actorId: context.user.id,
      eventType: "agent.skill_mapped",
      entityType: "agent",
      entityId: agentId,
      summary: "Agent skill mapping was updated.",
      details: { agentKey, skillId, proficiency, version: nextVersion },
    });

    revalidatePath("/agents");
    redirectWithParams(`/agents/${agentKey}`, { message: `Skill mapping saved. Version ${nextVersion} recorded.` });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/agents/${agentKey}`, { error: error instanceof Error ? error.message : "Unable to map skill to agent." });
  }
}

export async function removeAgentSkillAction(formData: FormData) {
  const agentKey = slugifyKey(text(formData, "agentKey"));
  const agentId = text(formData, "agentId");
  const skillId = text(formData, "skillId");

  if (isDemoMode()) {
    redirectWithParams(`/agents/${agentKey}`, { message: "Demo skill mapping removal staged. No live record was changed." });
  }

  try {
    if (!agentId || !skillId) {
      throw new Error("Agent and skill are required.");
    }

    const context = await requireAdminContext();
    const { data: existing, error: existingError } = await context.supabase
      .schema("staffer")
      .from("agents")
      .select("*")
      .eq("organisation_id", context.organisationId)
      .eq("id", agentId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (!existing?.id) {
      throw new Error("Agent profile was not found.");
    }

    const { error } = await context.supabase.schema("staffer").from("agent_skills").delete().eq("agent_id", agentId).eq("skill_id", skillId);

    if (error) {
      throw new Error(error.message);
    }

    const nextVersion = Number(existing.version ?? 1) + 1;
    const { data: updated, error: updateError } = await context.supabase
      .schema("staffer")
      .from("agents")
      .update({ version: nextVersion, updated_at: new Date().toISOString() })
      .eq("id", agentId)
      .eq("organisation_id", context.organisationId)
      .select("*")
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    await recordAgentVersion(context, updated as Record<string, unknown>, "Agent skill mapping removed.");
    await recordAuditEvent({
      organisationId: context.organisationId,
      actorType: "user",
      actorId: context.user.id,
      eventType: "agent.skill_removed",
      entityType: "agent",
      entityId: agentId,
      summary: "Agent skill mapping was removed.",
      details: { agentKey, skillId, version: nextVersion },
    });

    revalidatePath("/agents");
    redirectWithParams(`/agents/${agentKey}`, { message: `Skill mapping removed. Version ${nextVersion} recorded.` });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/agents/${agentKey}`, { error: error instanceof Error ? error.message : "Unable to remove skill from agent." });
  }
}

export async function createToolAction(formData: FormData) {
  const agentKey = slugifyKey(text(formData, "agentKey"));
  const name = text(formData, "name");
  const key = slugifyKey(text(formData, "key") || name);
  const description = text(formData, "description");
  const riskClass = Math.min(5, Math.max(0, intValue(formData, "riskClass", 1)));
  const requiresApproval = booleanValue(formData, "requiresApproval");
  const isActive = !formData.has("isActive") || booleanValue(formData, "isActive");

  if (isDemoMode()) {
    redirectWithParams(agentKey ? `/agents/${agentKey}` : "/agents", { message: "Demo tool staged. Live persistence is available when demo mode is disabled." });
  }

  try {
    if (!name || !key) {
      throw new Error("Tool name and key are required.");
    }

    const context = await requireAdminContext();
    const { data: tool, error } = await context.supabase
      .schema("staffer")
      .from("tools")
      .insert({
        organisation_id: context.organisationId,
        key,
        name,
        description: description || null,
        risk_class: riskClass,
        input_schema: jsonObjectValue(formData, "inputSchema"),
        output_schema: jsonObjectValue(formData, "outputSchema"),
        requires_approval: requiresApproval,
        is_active: isActive,
      })
      .select("id, key, name")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await recordAuditEvent({
      organisationId: context.organisationId,
      actorType: "user",
      actorId: context.user.id,
      eventType: "tool.created",
      entityType: "tool",
      entityId: String(tool.id),
      summary: "Tool catalogue entry was created.",
      details: { key, name, riskClass, requiresApproval, isActive },
    });

    revalidatePath("/agents");
    redirectWithParams(agentKey ? `/agents/${agentKey}` : "/agents", { message: "Tool added to the organisation catalogue." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(agentKey ? `/agents/${agentKey}` : "/agents", { error: error instanceof Error ? error.message : "Unable to create tool." });
  }
}

export async function assignAgentToolAction(formData: FormData) {
  const agentKey = slugifyKey(text(formData, "agentKey"));
  const agentId = text(formData, "agentId");
  const toolId = text(formData, "toolId");
  const constraints = jsonObjectValue(formData, "constraints");

  if (isDemoMode()) {
    redirectWithParams(`/agents/${agentKey}`, { message: "Demo tool permission staged. No live record was changed." });
  }

  try {
    if (!agentId || !toolId) {
      throw new Error("Agent and tool are required.");
    }

    const context = await requireAdminContext();
    const { data: existing, error: existingError } = await context.supabase
      .schema("staffer")
      .from("agents")
      .select("*")
      .eq("organisation_id", context.organisationId)
      .eq("id", agentId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (!existing?.id) {
      throw new Error("Agent profile was not found.");
    }

    const { error } = await context.supabase
      .schema("staffer")
      .from("agent_tools")
      .upsert({ agent_id: agentId, tool_id: toolId, constraints }, { onConflict: "agent_id,tool_id" });

    if (error) {
      throw new Error(error.message);
    }

    const nextVersion = Number(existing.version ?? 1) + 1;
    const { data: updated, error: updateError } = await context.supabase
      .schema("staffer")
      .from("agents")
      .update({ version: nextVersion, updated_at: new Date().toISOString() })
      .eq("id", agentId)
      .eq("organisation_id", context.organisationId)
      .select("*")
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    await recordAgentVersion(context, updated as Record<string, unknown>, "Agent tool permission mapping updated.");
    await recordAuditEvent({
      organisationId: context.organisationId,
      actorType: "user",
      actorId: context.user.id,
      eventType: "agent.tool_mapped",
      entityType: "agent",
      entityId: agentId,
      summary: "Agent tool permission mapping was updated.",
      details: { agentKey, toolId, constraints, version: nextVersion },
    });

    revalidatePath("/agents");
    redirectWithParams(`/agents/${agentKey}`, { message: `Tool permission saved. Version ${nextVersion} recorded.` });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/agents/${agentKey}`, { error: error instanceof Error ? error.message : "Unable to map tool to agent." });
  }
}

export async function removeAgentToolAction(formData: FormData) {
  const agentKey = slugifyKey(text(formData, "agentKey"));
  const agentId = text(formData, "agentId");
  const toolId = text(formData, "toolId");

  if (isDemoMode()) {
    redirectWithParams(`/agents/${agentKey}`, { message: "Demo tool permission removal staged. No live record was changed." });
  }

  try {
    if (!agentId || !toolId) {
      throw new Error("Agent and tool are required.");
    }

    const context = await requireAdminContext();
    const { data: existing, error: existingError } = await context.supabase
      .schema("staffer")
      .from("agents")
      .select("*")
      .eq("organisation_id", context.organisationId)
      .eq("id", agentId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (!existing?.id) {
      throw new Error("Agent profile was not found.");
    }

    const { error } = await context.supabase.schema("staffer").from("agent_tools").delete().eq("agent_id", agentId).eq("tool_id", toolId);

    if (error) {
      throw new Error(error.message);
    }

    const nextVersion = Number(existing.version ?? 1) + 1;
    const { data: updated, error: updateError } = await context.supabase
      .schema("staffer")
      .from("agents")
      .update({ version: nextVersion, updated_at: new Date().toISOString() })
      .eq("id", agentId)
      .eq("organisation_id", context.organisationId)
      .select("*")
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    await recordAgentVersion(context, updated as Record<string, unknown>, "Agent tool permission mapping removed.");
    await recordAuditEvent({
      organisationId: context.organisationId,
      actorType: "user",
      actorId: context.user.id,
      eventType: "agent.tool_removed",
      entityType: "agent",
      entityId: agentId,
      summary: "Agent tool permission mapping was removed.",
      details: { agentKey, toolId, version: nextVersion },
    });

    revalidatePath("/agents");
    redirectWithParams(`/agents/${agentKey}`, { message: `Tool permission removed. Version ${nextVersion} recorded.` });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/agents/${agentKey}`, { error: error instanceof Error ? error.message : "Unable to remove tool from agent." });
  }
}
