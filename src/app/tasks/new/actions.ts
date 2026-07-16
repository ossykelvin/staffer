"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/audit";
import { getCurrentMembership, getCurrentUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const priorityMap: Record<string, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

const allowedStatuses = new Set(["draft", "queued", "running", "blocked", "review", "approval", "completed", "failed", "cancelled"]);

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

async function liveContext() {
  const user = await getCurrentUser();
  const membership = await getCurrentMembership();
  const supabase = await getSupabaseServerClient();

  if (!user || !membership?.organisation_id || !supabase) {
    throw new Error("Live task creation requires an authenticated organisation member.");
  }

  return { user, membership, supabase };
}

export async function createTaskAction(formData: FormData) {
  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams("/tasks/new", { message: "Demo task staged. Live tasks are saved when demo mode is disabled." });
  }

  try {
    const title = text(formData, "title");
    const description = text(formData, "description");
    const project = text(formData, "project");
    const priority = text(formData, "priority") || "Medium";
    const status = text(formData, "status") || "queued";
    const dueAt = text(formData, "dueAt");
    const assignee = text(formData, "assignee");
    const idempotencyKey = text(formData, "idempotencyKey");

    if (!title || !project) {
      throw new Error("Task title and project are required.");
    }

    if (!allowedStatuses.has(status)) {
      throw new Error("Unsupported task status.");
    }

    const context = await liveContext();
    const now = new Date();
    const reference = `TSK-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const assignedAgentId = assignee.startsWith("agent:") ? assignee.replace("agent:", "") : null;
    const assignedUserId = assignee === "user:self" ? context.user.id : null;

    const { data: task, error } = await context.supabase
      .schema("staffer")
      .from("tasks")
      .insert({
        organisation_id: context.membership.organisation_id,
        reference,
        title,
        description: description || null,
        project_key: project,
        priority: priorityMap[priority] ?? 2,
        status,
        assigned_agent_id: assignedAgentId || null,
        assigned_user_id: assignedUserId,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        input: { source: "manual_task_create", priority, assignee },
        idempotency_key: idempotencyKey || `manual-task:${reference}`,
        created_by: context.user.id,
      })
      .select("id, reference")
      .single();

    if (error || !task?.id) {
      throw new Error(error?.message ?? "Unable to create task.");
    }

    await Promise.all([
      context.supabase.schema("staffer").from("task_evidence_events").insert({
        organisation_id: context.membership.organisation_id,
        task_id: task.id,
        event_type: "system",
        title: "Task created",
        body: "Manual task was created from the live task form.",
        metadata: { reference: task.reference, project, priority, status, assignee },
        created_by: context.user.id,
      }),
      context.supabase.schema("staffer").rpc("queue_task_notifications", {
        target_organisation_id: context.membership.organisation_id,
      }),
      recordAuditEvent({
        organisationId: context.membership.organisation_id,
        actorType: "user",
        actorId: context.user.id,
        eventType: "task.created",
        entityType: "task",
        entityId: task.reference,
        summary: "Manual task was created.",
        details: { taskId: task.id, taskReference: task.reference, project, priority, status, assignedAgentId, assignedUserId },
      }),
    ]);

    revalidatePath("/tasks");
    revalidatePath(`/tasks/${task.reference}`);
    revalidatePath("/governance");
    redirectWithParams(`/tasks/${task.reference}`, { message: "Task created." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams("/tasks/new", { error: error instanceof Error ? error.message : "Unable to create task." });
  }
}
