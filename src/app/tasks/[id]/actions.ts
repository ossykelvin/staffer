"use server";

import { getCurrentMembership, getCurrentUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { recordAuditEvent } from "@/lib/audit";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const allowedStatuses = new Set(["queued", "blocked", "review", "approval", "completed", "cancelled"]);

export async function stageTaskTransitionAction(taskId: string, nextStatus: string) {
  const status = allowedStatuses.has(nextStatus) ? nextStatus : "review";
  const user = await getCurrentUser();
  const membership = await getCurrentMembership();

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE !== "true" && membership?.organisation_id) {
    const supabase = await getSupabaseServerClient();
    const { error } =
      (await supabase
        ?.schema("staffer")
        .from("tasks")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("reference", taskId)
        .eq("organisation_id", membership.organisation_id)) ?? {};

    if (error) {
      return {
        mode: "error" as const,
        eventType: "task.transition_failed",
        summary: error.message,
        createdAt: new Date().toISOString(),
      };
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
