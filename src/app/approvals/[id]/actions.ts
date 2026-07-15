"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

function parseJsonObject(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected object.");
    }

    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("Execution payload must be valid JSON object syntax.");
  }
}

export async function stageApprovalDecisionAction(approvalId: string, decision: string) {
  const status = decisionToStatus[decision] ?? "changes_requested";
  const user = await getCurrentUser();
  const membership = await getCurrentMembership();

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE !== "true" && membership?.organisation_id) {
    const supabase = await getSupabaseServerClient();
    if (!supabase || !user) {
      return {
        mode: "error" as const,
        eventType: "approval.decision_failed",
        summary: "Live approval decisions require an authenticated user.",
        createdAt: new Date().toISOString(),
      };
    }

    const { data: approval, error: readError } = await supabase
      .schema("staffer")
      .from("approvals")
      .select("id, organisation_id, status, payload_hash, policy_snapshot, required_reviewer_count, approved_reviewer_count")
      .eq("id", approvalId)
      .eq("organisation_id", membership.organisation_id)
      .maybeSingle();

    if (readError || !approval) {
      return {
        mode: "error" as const,
        eventType: "approval.decision_failed",
        summary: readError?.message ?? "Approval was not found.",
        createdAt: new Date().toISOString(),
      };
    }

    const nextApprovedCount = status === "approved" ? Number(approval.approved_reviewer_count ?? 0) + 1 : Number(approval.approved_reviewer_count ?? 0);
    const requiredReviewerCount = Number(approval.required_reviewer_count ?? 1);
    const finalStatus = status === "approved" && nextApprovedCount < requiredReviewerCount ? "pending" : status;

    const { error: decisionError } = await supabase.schema("staffer").from("approval_decisions").insert({
      organisation_id: membership.organisation_id,
      approval_id: approval.id,
      decision: status,
      comment: `Decision recorded through Staffer UI: ${status}`,
      decided_by: user.id,
      payload_hash_at_decision: approval.payload_hash,
      policy_snapshot: approval.policy_snapshot ?? {},
    });

    if (decisionError) {
      return {
        mode: "error" as const,
        eventType: "approval.decision_failed",
        summary: decisionError.message,
        createdAt: new Date().toISOString(),
      };
    }

    const { error } = await supabase
      .schema("staffer")
      .from("approvals")
      .update({
        status: finalStatus,
        decided_by: user.id,
        decided_at: new Date().toISOString(),
        decision_comment:
          finalStatus === "pending"
            ? `Decision recorded. ${nextApprovedCount}/${requiredReviewerCount} approvals collected.`
            : `Decision recorded through Staffer UI: ${status}`,
        approved_reviewer_count: nextApprovedCount,
      })
        .eq("id", approvalId)
        .eq("organisation_id", membership.organisation_id);

    if (error) {
      return {
        mode: "error" as const,
        eventType: "approval.decision_failed",
        summary: error.message,
        createdAt: new Date().toISOString(),
      };
    }

    revalidatePath(`/approvals/${approvalId}`);
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

export async function verifyApprovalExecutionAction(formData: FormData) {
  const approvalId = text(formData, "approvalId");
  const payloadRaw = text(formData, "executionPayload");

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams(`/approvals/${approvalId}`, { message: "Demo execution check staged. Live protected execution remains blocked." });
  }

  try {
    if (!approvalId || !payloadRaw) {
      throw new Error("Approval id and execution payload are required.");
    }

    const user = await getCurrentUser();
    const membership = await getCurrentMembership();
    const supabase = await getSupabaseServerClient();

    if (!user || !membership?.organisation_id || !supabase) {
      throw new Error("Execution verification requires an authenticated organisation member.");
    }

    const executionPayload = parseJsonObject(payloadRaw);
    const { data, error } = await supabase.schema("staffer").rpc("verify_approval_execution", {
      target_approval_id: approvalId,
      target_execution_payload: executionPayload,
    });

    if (error) {
      throw new Error(error.message);
    }

    const result = Array.isArray(data) ? data[0] : data;
    const verified = Boolean(result?.verified);

    await recordAuditEvent({
      organisationId: membership.organisation_id,
      actorType: "user",
      actorId: user.id,
      eventType: verified ? "approval.execution_verified" : "approval.execution_blocked",
      entityType: "approval",
      entityId: approvalId,
      summary: verified ? "Approval execution payload was verified." : String(result?.failure_reason ?? "Approval execution payload was blocked."),
      details: {
        approvalId,
        expectedPayloadHash: result?.expected_payload_hash,
        actualPayloadHash: result?.actual_payload_hash,
        checkId: result?.check_id,
      },
    });

    revalidatePath(`/approvals/${approvalId}`);
    redirectWithParams(`/approvals/${approvalId}`, {
      message: verified ? "Execution payload verified. The protected action is cleared for the execution layer." : "Execution payload blocked. Check the exact payload, approval status and expiry.",
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/approvals/${approvalId || ""}`, { error: error instanceof Error ? error.message : "Unable to verify execution payload." });
  }
}
