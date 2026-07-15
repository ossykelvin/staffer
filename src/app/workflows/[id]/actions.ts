"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/audit";
import { getCurrentMembership, getCurrentUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const allowedTransitions = new Set(["pause", "resume", "cancel", "retry"]);

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

function eventNameForAction(action: string) {
  if (action === "pause") {
    return "workflow.paused";
  }
  if (action === "resume") {
    return "workflow.resumed";
  }
  if (action === "cancel") {
    return "workflow.cancelled";
  }
  if (action === "retry") {
    return "workflow.retry_requested";
  }
  return "workflow.transitioned";
}

async function liveContext() {
  const user = await getCurrentUser();
  const membership = await getCurrentMembership();
  const supabase = await getSupabaseServerClient();

  if (!user || !membership?.organisation_id || !supabase) {
    throw new Error("Workflow execution requires an authenticated organisation member.");
  }

  return { user, membership, supabase };
}

export async function startWorkflowRunAction(formData: FormData) {
  const workflowKey = text(formData, "workflowKey");
  const triggerType = text(formData, "triggerType") || "manual";
  const idempotencyKey = text(formData, "idempotencyKey") || `${workflowKey}:manual:${new Date().toISOString()}`;

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams(`/workflows/${workflowKey}`, { message: "Demo workflow run staged. Live run creation is enabled when demo mode is disabled." });
  }

  try {
    if (!workflowKey) {
      throw new Error("Workflow key is required.");
    }

    const context = await liveContext();
    const { data, error } = await context.supabase.schema("staffer").rpc("start_workflow_run", {
      target_workflow_key: workflowKey,
      target_task_id: null,
      target_trigger_type: triggerType,
      target_trigger_payload: { source: "workflow_detail", requestedBy: context.user.id },
      target_idempotency_key: idempotencyKey,
    });

    if (error) {
      throw new Error(error.message);
    }

    const result = Array.isArray(data) ? data[0] : data;
    await recordAuditEvent({
      organisationId: context.membership.organisation_id,
      actorType: "user",
      actorId: context.user.id,
      eventType: result?.created_new ? "workflow.run_started" : "workflow.run_reused",
      entityType: "workflow",
      entityId: workflowKey,
      summary: result?.created_new ? "Workflow run was queued." : "Existing workflow run was reused by idempotency key.",
      details: {
        workflowKey,
        runId: result?.run_id,
        status: result?.status,
        idempotencyKey: result?.idempotency_key,
      },
    });

    revalidatePath(`/workflows/${workflowKey}`);
    redirectWithParams(`/workflows/${workflowKey}`, { message: result?.created_new ? "Workflow run queued." : "Existing idempotent run reused." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/workflows/${workflowKey || ""}`, { error: error instanceof Error ? error.message : "Unable to start workflow run." });
  }
}

export async function transitionWorkflowRunAction(formData: FormData) {
  const workflowKey = text(formData, "workflowKey");
  const runId = text(formData, "runId");
  const action = text(formData, "action");
  const reason = text(formData, "reason") || `Manual ${action} requested from workflow detail.`;

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams(`/workflows/${workflowKey}`, { message: `Demo ${action || "transition"} staged. No live run was changed.` });
  }

  try {
    if (!workflowKey || !runId || !allowedTransitions.has(action)) {
      throw new Error("Workflow run, workflow key and supported action are required.");
    }

    const context = await liveContext();
    const { data, error } = await context.supabase.schema("staffer").rpc("transition_workflow_run", {
      target_run_id: runId,
      target_action: action,
      target_reason: reason,
    });

    if (error) {
      throw new Error(error.message);
    }

    const result = Array.isArray(data) ? data[0] : data;
    await recordAuditEvent({
      organisationId: context.membership.organisation_id,
      actorType: "user",
      actorId: context.user.id,
      eventType: eventNameForAction(action),
      entityType: "workflow_run",
      entityId: runId,
      summary: `Workflow run ${action} was recorded.`,
      details: {
        workflowKey,
        runId,
        status: result?.status,
        eventId: result?.event_id,
        reason,
      },
    });

    revalidatePath(`/workflows/${workflowKey}`);
    redirectWithParams(`/workflows/${workflowKey}`, { message: `Workflow run ${action} recorded.` });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/workflows/${workflowKey || ""}`, { error: error instanceof Error ? error.message : "Unable to transition workflow run." });
  }
}

export async function replayWorkflowRunAction(formData: FormData) {
  const workflowKey = text(formData, "workflowKey");
  const runId = text(formData, "runId");
  const reason = text(formData, "reason") || "Manual replay requested from workflow detail.";

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams(`/workflows/${workflowKey}`, { message: "Demo replay staged. No live run was created." });
  }

  try {
    if (!workflowKey || !runId) {
      throw new Error("Workflow run and workflow key are required.");
    }

    const context = await liveContext();
    const { data, error } = await context.supabase.schema("staffer").rpc("replay_workflow_run", {
      target_run_id: runId,
      target_reason: reason,
    });

    if (error) {
      throw new Error(error.message);
    }

    const result = Array.isArray(data) ? data[0] : data;
    await recordAuditEvent({
      organisationId: context.membership.organisation_id,
      actorType: "user",
      actorId: context.user.id,
      eventType: "workflow.replay_requested",
      entityType: "workflow_run",
      entityId: runId,
      summary: "Workflow replay was queued.",
      details: {
        workflowKey,
        sourceRunId: runId,
        replayRunId: result?.run_id,
        idempotencyKey: result?.idempotency_key,
        reason,
      },
    });

    revalidatePath(`/workflows/${workflowKey}`);
    redirectWithParams(`/workflows/${workflowKey}`, { message: "Workflow replay queued." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/workflows/${workflowKey || ""}`, { error: error instanceof Error ? error.message : "Unable to replay workflow run." });
  }
}
