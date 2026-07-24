"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/audit";
import { getCurrentMembership, getCurrentUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function redirectWithParams(path: string, params: Record<string, string>): never {
  const search = new URLSearchParams(params);
  redirect(`${path}?${search.toString()}`);
}

function isRedirectError(error: unknown) {
  return typeof error === "object" && error !== null && "digest" in error && String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT");
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function referenceForLifecycle(key: string) {
  const now = new Date();
  const prefix = key
    .split("-")
    .map((part) => part[0])
    .join("")
    .slice(0, 5)
    .toUpperCase();
  return `${prefix}-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export async function createWorkflowLifecycleRequestAction(formData: FormData) {
  const lifecycleKey = text(formData, "lifecycleKey");
  const triggerType = text(formData, "triggerType") || "manual_request";
  const summary = text(formData, "summary");
  const evidence = text(formData, "evidence");

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams("/workflows", { message: "Demo lifecycle request queued. Live tasks are created when demo mode is disabled." });
  }

  try {
    if (!lifecycleKey || !summary) {
      throw new Error("Lifecycle and summary are required.");
    }

    const [user, membership, supabase] = await Promise.all([getCurrentUser(), getCurrentMembership(), getSupabaseServerClient()]);
    if (!user || !membership?.organisation_id || !supabase) {
      throw new Error("Lifecycle requests require an authenticated organisation member.");
    }

    const { data: lifecycle, error: lifecycleError } = await supabase
      .schema("staffer")
      .from("workflow_lifecycles")
      .select("id, key, name, owner_agent_key, required_approval_actions, default_steps")
      .eq("organisation_id", membership.organisation_id)
      .eq("key", lifecycleKey)
      .maybeSingle();
    if (lifecycleError || !lifecycle) {
      throw new Error(lifecycleError?.message ?? "Lifecycle was not found.");
    }

    const { data: ownerAgent } = typeof lifecycle.owner_agent_key === "string"
      ? await supabase
          .schema("staffer")
          .from("agents")
          .select("id")
          .eq("organisation_id", membership.organisation_id)
          .eq("key", lifecycle.owner_agent_key)
          .maybeSingle()
      : { data: null };

    const reference = referenceForLifecycle(String(lifecycle.key));
    const triggerPayload = {
      summary,
      evidence: evidence || null,
      triggerType,
      lifecycleKey: lifecycle.key,
      requiredApprovalActions: Array.isArray(lifecycle.required_approval_actions) ? lifecycle.required_approval_actions : [],
      defaultSteps: Array.isArray(lifecycle.default_steps) ? lifecycle.default_steps : [],
    };
    const { data: task, error: taskError } = await supabase
      .schema("staffer")
      .from("tasks")
      .insert({
        organisation_id: membership.organisation_id,
        reference,
        title: `${String(lifecycle.name)}: ${summary}`,
        description: evidence || summary,
        project_key: String(lifecycle.key),
        priority: String(lifecycle.key).includes("release") || String(lifecycle.key).includes("compliance") ? 3 : 2,
        status: "queued",
        assigned_agent_id: typeof ownerAgent?.id === "string" ? ownerAgent.id : null,
        input: triggerPayload,
        idempotency_key: `workflow-lifecycle:${lifecycle.key}:${reference}`,
        retry_policy: { maxRetries: 2, backoffHours: 4 },
        created_by: user.id,
      })
      .select("id, reference")
      .single();
    if (taskError || !task?.id) {
      throw new Error(taskError?.message ?? "Unable to create lifecycle task.");
    }

    const { data: request, error: requestError } = await supabase
      .schema("staffer")
      .from("workflow_lifecycle_requests")
      .insert({
        organisation_id: membership.organisation_id,
        lifecycle_id: lifecycle.id,
        task_id: task.id,
        trigger_type: triggerType,
        trigger_payload: triggerPayload,
        status: "queued",
        owner_agent_id: typeof ownerAgent?.id === "string" ? ownerAgent.id : null,
        evidence: { source: "PB-036+", summary, evidence: evidence || null },
        created_by: user.id,
      })
      .select("id")
      .single();
    if (requestError || !request?.id) {
      throw new Error(requestError?.message ?? "Unable to create lifecycle request.");
    }

    await Promise.all([
      supabase.schema("staffer").from("task_evidence_events").insert({
        organisation_id: membership.organisation_id,
        task_id: task.id,
        event_type: "workflow_lifecycle.request_created",
        title: "Workflow lifecycle request queued",
        body: `${String(lifecycle.name)} request was queued with trigger ${triggerType}.`,
        metadata: { lifecycleRequestId: request.id, lifecycleKey: lifecycle.key, triggerPayload: asRecord(triggerPayload) },
        created_by: user.id,
      }),
      recordAuditEvent({
        organisationId: membership.organisation_id,
        actorType: "user",
        actorId: user.id,
        eventType: "workflow_lifecycle.request_created",
        entityType: "workflow_lifecycle_request",
        entityId: request.id,
        summary: `${String(lifecycle.name)} lifecycle request queued.`,
        details: { lifecycleKey: lifecycle.key, taskId: task.id, taskReference: task.reference, triggerType, summary },
      }),
    ]);

    revalidatePath("/workflows");
    revalidatePath("/tasks");
    redirectWithParams("/workflows", { message: `${String(lifecycle.name)} request ${task.reference} queued.` });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams("/workflows", { error: error instanceof Error ? error.message : "Unable to queue lifecycle request." });
  }
}
