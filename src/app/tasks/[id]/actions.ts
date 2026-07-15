"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentMembership, getCurrentUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { recordAuditEvent } from "@/lib/audit";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const allowedStatuses = new Set(["queued", "blocked", "review", "approval", "completed", "cancelled"]);
const evidenceTypes = new Set(["evidence", "attachment", "status", "retry", "dependency", "watcher", "comment", "system"]);

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

function parseMetadata(formData: FormData) {
  const raw = text(formData, "metadata");
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected an object.");
    }

    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("Evidence metadata must be valid JSON object syntax.");
  }
}

async function getTaskContext(taskReference: string) {
  const user = await getCurrentUser();
  const membership = await getCurrentMembership();
  const supabase = await getSupabaseServerClient();

  if (!user || !membership?.organisation_id || !supabase) {
    throw new Error("Live task collaboration requires an authenticated organisation member.");
  }

  const { data: task, error } = await supabase
    .schema("staffer")
    .from("tasks")
    .select("id, reference, title, retry_count")
    .eq("reference", taskReference)
    .eq("organisation_id", membership.organisation_id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!task?.id) {
    throw new Error("Task was not found.");
  }

  return {
    supabase,
    user,
    membership,
    task: {
      id: String(task.id),
      reference: String(task.reference),
      title: String(task.title ?? task.reference),
      retryCount: Number(task.retry_count ?? 0),
    },
  };
}

async function insertEvidenceEvent({
  context,
  eventType,
  title,
  body,
  metadata = {},
}: {
  context: Awaited<ReturnType<typeof getTaskContext>>;
  eventType: string;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await context.supabase.schema("staffer").from("task_evidence_events").insert({
    organisation_id: context.membership.organisation_id,
    task_id: context.task.id,
    event_type: eventType,
    title,
    body: body || null,
    metadata,
    created_by: context.user.id,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function stageTaskTransitionAction(taskId: string, nextStatus: string) {
  const status = allowedStatuses.has(nextStatus) ? nextStatus : "review";
  const user = await getCurrentUser();
  const membership = await getCurrentMembership();

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE !== "true" && membership?.organisation_id) {
    const supabase = await getSupabaseServerClient();
    const { data, error } =
      (await supabase
        ?.schema("staffer")
        .from("tasks")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .eq("reference", taskId)
        .eq("organisation_id", membership.organisation_id)
        .maybeSingle()) ?? {};

    if (error) {
      return {
        mode: "error" as const,
        eventType: "task.transition_failed",
        summary: error.message,
        createdAt: new Date().toISOString(),
      };
    }

    if (data?.id) {
      await supabase?.schema("staffer").from("task_evidence_events").insert({
        organisation_id: membership.organisation_id,
        task_id: data.id,
        event_type: "status",
        title: `Status changed to ${status}`,
        body: "Task status changed from the task detail panel.",
        metadata: { nextStatus: status, source: "task_transition_panel" },
        created_by: user?.id ?? null,
      });
    }
  }

  return recordAuditEvent({
    organisationId: membership?.organisation_id,
    actorType: user ? "user" : "demo_user",
    actorId: user?.id ?? "demo",
    eventType: "task.status_changed",
    entityType: "task",
    entityId: taskId,
    summary: `Task ${taskId} transition staged as ${status}.`,
    details: {
      taskId,
      nextStatus: status,
      source: "task_detail",
    },
  });
}

export async function addTaskCommentAction(formData: FormData) {
  const taskReference = text(formData, "taskReference");
  const body = text(formData, "body");
  const visibility = text(formData, "visibility") || "internal";

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams(`/tasks/${taskReference}`, { message: "Demo comment staged. Live comments are saved when demo mode is disabled." });
  }

  try {
    if (!taskReference || !body) {
      throw new Error("Task and comment body are required.");
    }

    const context = await getTaskContext(taskReference);
    const { error } = await context.supabase.schema("staffer").from("task_comments").insert({
      organisation_id: context.membership.organisation_id,
      task_id: context.task.id,
      body,
      visibility,
      created_by: context.user.id,
    });

    if (error) {
      throw new Error(error.message);
    }

    await recordAuditEvent({
      organisationId: context.membership.organisation_id,
      actorType: "user",
      actorId: context.user.id,
      eventType: "task.comment_added",
      entityType: "task",
      entityId: taskReference,
      summary: "Task comment was added.",
      details: { taskReference, visibility },
    });

    revalidatePath(`/tasks/${taskReference}`);
    redirectWithParams(`/tasks/${taskReference}`, { message: "Comment added." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/tasks/${taskReference || ""}`, { error: error instanceof Error ? error.message : "Unable to add comment." });
  }
}

export async function addTaskWatcherAction(formData: FormData) {
  const taskReference = text(formData, "taskReference");

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams(`/tasks/${taskReference}`, { message: "Demo watcher staged. No live watcher was changed." });
  }

  try {
    const context = await getTaskContext(taskReference);
    const { error } = await context.supabase.schema("staffer").from("task_watchers").upsert(
      {
        organisation_id: context.membership.organisation_id,
        task_id: context.task.id,
        user_id: context.user.id,
        created_by: context.user.id,
      },
      { onConflict: "task_id,user_id" },
    );

    if (error) {
      throw new Error(error.message);
    }

    await insertEvidenceEvent({
      context,
      eventType: "watcher",
      title: "Watcher added",
      body: "A user started watching this task.",
      metadata: { userId: context.user.id },
    });

    await recordAuditEvent({
      organisationId: context.membership.organisation_id,
      actorType: "user",
      actorId: context.user.id,
      eventType: "task.watcher_added",
      entityType: "task",
      entityId: taskReference,
      summary: "Task watcher was added.",
      details: { taskReference, userId: context.user.id },
    });

    revalidatePath(`/tasks/${taskReference}`);
    redirectWithParams(`/tasks/${taskReference}`, { message: "You are now watching this task." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/tasks/${taskReference || ""}`, { error: error instanceof Error ? error.message : "Unable to watch task." });
  }
}

export async function removeTaskWatcherAction(formData: FormData) {
  const taskReference = text(formData, "taskReference");

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams(`/tasks/${taskReference}`, { message: "Demo watcher removal staged. No live watcher was changed." });
  }

  try {
    const context = await getTaskContext(taskReference);
    const { error } = await context.supabase
      .schema("staffer")
      .from("task_watchers")
      .delete()
      .eq("organisation_id", context.membership.organisation_id)
      .eq("task_id", context.task.id)
      .eq("user_id", context.user.id);

    if (error) {
      throw new Error(error.message);
    }

    await recordAuditEvent({
      organisationId: context.membership.organisation_id,
      actorType: "user",
      actorId: context.user.id,
      eventType: "task.watcher_removed",
      entityType: "task",
      entityId: taskReference,
      summary: "Task watcher was removed.",
      details: { taskReference, userId: context.user.id },
    });

    revalidatePath(`/tasks/${taskReference}`);
    redirectWithParams(`/tasks/${taskReference}`, { message: "Watcher removed." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/tasks/${taskReference || ""}`, { error: error instanceof Error ? error.message : "Unable to remove watcher." });
  }
}

export async function addTaskDependencyAction(formData: FormData) {
  const taskReference = text(formData, "taskReference");
  const dependsOnReference = text(formData, "dependsOnReference");
  const dependencyType = text(formData, "dependencyType") || "blocks";
  const notes = text(formData, "notes");

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams(`/tasks/${taskReference}`, { message: "Demo dependency staged. No live dependency was changed." });
  }

  try {
    if (!taskReference || !dependsOnReference || taskReference === dependsOnReference) {
      throw new Error("Choose a different task as the dependency.");
    }

    const context = await getTaskContext(taskReference);
    const { data: dependencyTask, error: dependencyError } = await context.supabase
      .schema("staffer")
      .from("tasks")
      .select("id, reference, title")
      .eq("organisation_id", context.membership.organisation_id)
      .eq("reference", dependsOnReference)
      .maybeSingle();

    if (dependencyError) {
      throw new Error(dependencyError.message);
    }

    if (!dependencyTask?.id) {
      throw new Error("Dependency task was not found.");
    }

    const { error } = await context.supabase.schema("staffer").from("task_dependencies").insert({
      organisation_id: context.membership.organisation_id,
      task_id: context.task.id,
      depends_on_task_id: dependencyTask.id,
      dependency_type: dependencyType,
      notes: notes || null,
      created_by: context.user.id,
    });

    if (error) {
      throw new Error(error.message);
    }

    await insertEvidenceEvent({
      context,
      eventType: "dependency",
      title: `Dependency added: ${dependsOnReference}`,
      body: notes || `This task now depends on ${String(dependencyTask.title ?? dependsOnReference)}.`,
      metadata: { dependsOnReference, dependencyType },
    });

    await recordAuditEvent({
      organisationId: context.membership.organisation_id,
      actorType: "user",
      actorId: context.user.id,
      eventType: "task.dependency_added",
      entityType: "task",
      entityId: taskReference,
      summary: "Task dependency was added.",
      details: { taskReference, dependsOnReference, dependencyType },
    });

    revalidatePath(`/tasks/${taskReference}`);
    redirectWithParams(`/tasks/${taskReference}`, { message: "Dependency added." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/tasks/${taskReference || ""}`, { error: error instanceof Error ? error.message : "Unable to add dependency." });
  }
}

export async function removeTaskDependencyAction(formData: FormData) {
  const taskReference = text(formData, "taskReference");
  const dependencyId = text(formData, "dependencyId");

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams(`/tasks/${taskReference}`, { message: "Demo dependency removal staged. No live dependency was changed." });
  }

  try {
    if (!dependencyId) {
      throw new Error("Dependency id is required.");
    }

    const context = await getTaskContext(taskReference);
    const { error } = await context.supabase
      .schema("staffer")
      .from("task_dependencies")
      .delete()
      .eq("organisation_id", context.membership.organisation_id)
      .eq("task_id", context.task.id)
      .eq("id", dependencyId);

    if (error) {
      throw new Error(error.message);
    }

    await recordAuditEvent({
      organisationId: context.membership.organisation_id,
      actorType: "user",
      actorId: context.user.id,
      eventType: "task.dependency_removed",
      entityType: "task",
      entityId: taskReference,
      summary: "Task dependency was removed.",
      details: { taskReference, dependencyId },
    });

    revalidatePath(`/tasks/${taskReference}`);
    redirectWithParams(`/tasks/${taskReference}`, { message: "Dependency removed." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/tasks/${taskReference || ""}`, { error: error instanceof Error ? error.message : "Unable to remove dependency." });
  }
}

export async function addTaskEvidenceAction(formData: FormData) {
  const taskReference = text(formData, "taskReference");
  const eventType = evidenceTypes.has(text(formData, "eventType")) ? text(formData, "eventType") : "evidence";
  const title = text(formData, "title");
  const body = text(formData, "body");

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams(`/tasks/${taskReference}`, { message: "Demo evidence staged. Live evidence is saved when demo mode is disabled." });
  }

  try {
    if (!taskReference || !title) {
      throw new Error("Task and evidence title are required.");
    }

    const context = await getTaskContext(taskReference);
    const metadata = parseMetadata(formData);
    await insertEvidenceEvent({ context, eventType, title, body, metadata });

    await recordAuditEvent({
      organisationId: context.membership.organisation_id,
      actorType: "user",
      actorId: context.user.id,
      eventType: "task.evidence_added",
      entityType: "task",
      entityId: taskReference,
      summary: "Task evidence was added.",
      details: { taskReference, eventType, title },
    });

    revalidatePath(`/tasks/${taskReference}`);
    redirectWithParams(`/tasks/${taskReference}`, { message: "Evidence recorded." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/tasks/${taskReference || ""}`, { error: error instanceof Error ? error.message : "Unable to add evidence." });
  }
}

export async function retryTaskAction(formData: FormData) {
  const taskReference = text(formData, "taskReference");
  const retryReason = text(formData, "retryReason") || "Manual retry requested.";

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams(`/tasks/${taskReference}`, { message: "Demo retry staged. No live task was changed." });
  }

  try {
    const context = await getTaskContext(taskReference);
    const retryCount = context.task.retryCount + 1;
    const { error } = await context.supabase
      .schema("staffer")
      .from("tasks")
      .update({
        status: "queued",
        retry_count: retryCount,
        last_retry_at: new Date().toISOString(),
        retry_reason: retryReason,
        updated_at: new Date().toISOString(),
      })
      .eq("organisation_id", context.membership.organisation_id)
      .eq("id", context.task.id);

    if (error) {
      throw new Error(error.message);
    }

    await insertEvidenceEvent({
      context,
      eventType: "retry",
      title: `Retry ${retryCount} requested`,
      body: retryReason,
      metadata: { retryCount },
    });

    await recordAuditEvent({
      organisationId: context.membership.organisation_id,
      actorType: "user",
      actorId: context.user.id,
      eventType: "task.retry_requested",
      entityType: "task",
      entityId: taskReference,
      summary: "Task retry was requested.",
      details: { taskReference, retryCount, retryReason },
    });

    revalidatePath(`/tasks/${taskReference}`);
    redirectWithParams(`/tasks/${taskReference}`, { message: `Retry ${retryCount} requested and task re-queued.` });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/tasks/${taskReference || ""}`, { error: error instanceof Error ? error.message : "Unable to retry task." });
  }
}
