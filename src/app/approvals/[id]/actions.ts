"use server";

import { getCurrentMembership, getCurrentUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { recordAuditEvent } from "@/lib/audit";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const decisionToStatus: Record<string, string> = {
  approved: "approved",
  rejected: "rejected",
  changes: "changes_requested",
  expired: "expired",
};

export async function stageApprovalDecisionAction(approvalId: string, decision: string) {
  const status = decisionToStatus[decision] ?? "changes_requested";
  const user = await getCurrentUser();
  const membership = await getCurrentMembership();

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE !== "true" && membership?.organisation_id) {
    const supabase = await getSupabaseServerClient();
    const { error } =
      (await supabase
        ?.schema("staffer")
        .from("approvals")
        .update({
          status,
          decided_by: user?.id ?? null,
          decided_at: new Date().toISOString(),
          decision_comment: `Decision recorded through Staffer UI: ${status}`,
        })
        .eq("id", approvalId)
        .eq("organisation_id", membership.organisation_id)) ?? {};

    if (error) {
      return {
        mode: "error" as const,
        eventType: "approval.decision_failed",
        summary: error.message,
        createdAt: new Date().toISOString(),
      };
    }
  }

  return recordAuditEvent({
    organisationId: membership?.organisation_id,
    actorType: user ? "user" : "demo_user",
    actorId: user?.id ?? "demo",
    eventType: `approval.${status}`,
    entityType: "approval",
    entityId: approvalId,
    summary: `Approval ${approvalId} decision staged as ${status}.`,
    details: {
      approvalId,
      status,
      source: "approval_detail",
    },
  });
}
