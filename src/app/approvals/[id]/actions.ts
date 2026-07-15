"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentMembership, getCurrentUser } from "@/lib/auth";
import { sendTransactionalEmail } from "@/lib/email/provider";
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

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function payloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

function recipientDomain(email: string) {
  const [, domain] = email.split("@");
  return domain?.toLowerCase() ?? "unknown";
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

export async function sendApprovedSupportEmailAction(formData: FormData) {
  const approvalId = text(formData, "approvalId");

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams(`/approvals/${approvalId}`, { message: "Demo mode staged the approved support email send. No external email was sent." });
  }

  try {
    if (!approvalId) {
      throw new Error("Approval id is required before an approved support email can be sent.");
    }

    const user = await getCurrentUser();
    const membership = await getCurrentMembership();
    const supabase = await getSupabaseServerClient();

    if (!user || !membership?.organisation_id || !supabase) {
      throw new Error("Approved support email execution requires an authenticated organisation member.");
    }

    const { data: approval, error: approvalError } = await supabase
      .schema("staffer")
      .from("approvals")
      .select("id, organisation_id, task_id, workflow_run_id, action_key, action_payload, status, execution_status")
      .eq("id", approvalId)
      .eq("organisation_id", membership.organisation_id)
      .maybeSingle();

    if (approvalError || !approval) {
      throw new Error(approvalError?.message ?? "Approval was not found.");
    }

    const actionPayload = asRecord(approval.action_payload);
    const actionKey = String(approval.action_key ?? actionPayload.action ?? "");
    if (actionKey !== "support.response_draft") {
      throw new Error("Only approved Customer Support Triage response drafts can be executed through this Brevo path.");
    }

    if (approval.status !== "approved") {
      throw new Error("The support response must be approved before Brevo can send it.");
    }

    if (approval.execution_status === "executed") {
      throw new Error("This approved support response has already been executed.");
    }

    const recipient = payloadString(actionPayload, "recipient");
    const subject = payloadString(actionPayload, "subject");
    const draftResponse = payloadString(actionPayload, "draftResponse");
    if (!recipient || !subject || !draftResponse) {
      throw new Error("The approved payload must include recipient, subject and draftResponse before email execution.");
    }

    const { data: supportCase, error: supportCaseError } = await supabase
      .schema("staffer")
      .from("support_triage_cases")
      .select("id, task_id, workflow_run_id")
      .eq("approval_id", approval.id)
      .eq("organisation_id", membership.organisation_id)
      .maybeSingle();

    if (supportCaseError || !supportCase) {
      throw new Error(supportCaseError?.message ?? "No support triage case is linked to this approval.");
    }

    const verification = await supabase.schema("staffer").rpc("verify_approval_execution", {
      target_approval_id: approval.id,
      target_execution_payload: actionPayload,
    });

    if (verification.error) {
      throw new Error(verification.error.message);
    }

    const verificationResult = Array.isArray(verification.data) ? verification.data[0] : verification.data;
    if (!verificationResult?.verified) {
      throw new Error(String(verificationResult?.failure_reason ?? "Exact approval payload verification failed."));
    }

    let emailResult: Awaited<ReturnType<typeof sendTransactionalEmail>>;
    try {
      emailResult = await sendTransactionalEmail({
        to: [{ email: recipient }],
        subject,
        textContent: draftResponse,
        tags: ["staffer", "support-triage", "approval-gated"],
        params: {
          approvalId: approval.id,
          taskId: supportCase.task_id ?? approval.task_id,
          workflowRunId: supportCase.workflow_run_id ?? approval.workflow_run_id,
        },
      });
    } catch (sendError) {
      await Promise.all([
        supabase
          .schema("staffer")
          .from("approvals")
          .update({ execution_status: "failed" })
          .eq("id", approval.id)
          .eq("organisation_id", membership.organisation_id),
        supabase
          .schema("staffer")
          .from("support_triage_cases")
          .update({ external_action_status: "sent_blocked", updated_at: new Date().toISOString() })
          .eq("id", supportCase.id)
          .eq("organisation_id", membership.organisation_id),
      ]);

      await recordAuditEvent({
        organisationId: membership.organisation_id,
        actorType: "user",
        actorId: user.id,
        eventType: "support_triage.email_failed",
        entityType: "approval",
        entityId: approval.id,
        summary: "Approval-verified support email failed before Brevo accepted it.",
        details: {
          approvalId: approval.id,
          supportCaseId: supportCase.id,
          recipientDomain: recipientDomain(recipient),
          reason: sendError instanceof Error ? sendError.message : "Unknown Brevo send failure.",
          verificationCheckId: verificationResult?.check_id,
        },
      });

      throw sendError;
    }

    const now = new Date().toISOString();
    const taskId = String(supportCase.task_id ?? approval.task_id ?? "");
    const workflowRunId = String(supportCase.workflow_run_id ?? approval.workflow_run_id ?? "");

    const writeResults = await Promise.all([
      supabase
        .schema("staffer")
        .from("approvals")
        .update({ execution_status: "executed" })
        .eq("id", approval.id)
        .eq("organisation_id", membership.organisation_id),
      supabase
        .schema("staffer")
        .from("support_triage_cases")
        .update({
          draft_status: "approved",
          external_action_status: "sent",
          updated_at: now,
        })
        .eq("id", supportCase.id)
        .eq("organisation_id", membership.organisation_id),
      taskId
        ? supabase.schema("staffer").from("task_evidence_events").insert({
            organisation_id: membership.organisation_id,
            task_id: taskId,
            event_type: "support_triage.email_sent",
            title: "Approved Brevo email sent",
            body: "Anna's approved support response was exact-payload verified and accepted by Brevo.",
            metadata: {
              approvalId: approval.id,
              supportCaseId: supportCase.id,
              provider: emailResult.provider,
              mode: emailResult.mode,
              messageId: emailResult.messageId,
              verificationCheckId: verificationResult?.check_id,
              recipientDomain: recipientDomain(recipient),
            },
            created_by: user.id,
          })
        : Promise.resolve({ error: null }),
      workflowRunId
        ? supabase.schema("staffer").rpc("record_workflow_run_event", {
            target_organisation_id: membership.organisation_id,
            target_workflow_run_id: workflowRunId,
            target_step_run_id: null,
            target_event_type: "support_triage.email_sent",
            target_title: "Approved support email sent",
            target_body: "Brevo accepted the approval-verified support response payload.",
            target_metadata: {
              approvalId: approval.id,
              supportCaseId: supportCase.id,
              provider: emailResult.provider,
              mode: emailResult.mode,
              messageId: emailResult.messageId,
              verificationCheckId: verificationResult?.check_id,
            },
          })
        : Promise.resolve({ error: null }),
    ]);

    const failedWrite = writeResults.find((result) => result?.error);
    if (failedWrite?.error) {
      throw new Error(failedWrite.error.message);
    }

    await recordAuditEvent({
      organisationId: membership.organisation_id,
      actorType: "user",
      actorId: user.id,
      eventType: "support_triage.email_sent",
      entityType: "support_triage_case",
      entityId: supportCase.id,
      summary: "Approved support email was exact-payload verified and sent through Brevo.",
      details: {
        approvalId: approval.id,
        supportCaseId: supportCase.id,
        taskId: taskId || null,
        workflowRunId: workflowRunId || null,
        provider: emailResult.provider,
        mode: emailResult.mode,
        messageId: emailResult.messageId,
        recipientDomain: recipientDomain(recipient),
        verificationCheckId: verificationResult?.check_id,
      },
    });

    revalidatePath(`/approvals/${approvalId}`);
    revalidatePath("/approvals");
    revalidatePath("/tasks");
    revalidatePath("/workflows/support-triage");
    redirectWithParams(`/approvals/${approvalId}`, { message: "Approved support response verified and sent through Brevo." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/approvals/${approvalId || ""}`, { error: error instanceof Error ? error.message : "Unable to send approved support email." });
  }
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
