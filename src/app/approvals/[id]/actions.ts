"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentMembership, getCurrentUser } from "@/lib/auth";
import { sendTransactionalEmail } from "@/lib/email/provider";
import { publicEnv } from "@/lib/env";
import { createApprovedGitHubIssue } from "@/lib/github/issues";
import { recordAuditEvent } from "@/lib/audit";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { assertAgentToolPermission, recordToolRuntimeOutcome } from "@/lib/tools/permissions";
import { runGmailDraftCreateTool } from "@/lib/tools/gmail";

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

function approvalActionUrl(approvalId: string) {
  return `/approvals/${approvalId}`;
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
      .select(
        "id, organisation_id, action_key, action_payload, status, payload_hash, policy_snapshot, required_reviewer_count, approved_reviewer_count, requested_by_user_id, risk_class, approval_mode, current_review_sequence, separation_of_duties_enforced, expires_at",
      )
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

    const requestedByUserId = typeof approval.requested_by_user_id === "string" ? approval.requested_by_user_id : null;
    const riskClass = Number(approval.risk_class ?? 1);
    const separationRequired = approval.separation_of_duties_enforced === true || riskClass >= 4;
    if (status === "approved" && separationRequired && requestedByUserId === user.id) {
      return {
        mode: "error" as const,
        eventType: "approval.decision_failed",
        summary: "Separation of duties blocks the requester from approving this high-risk action.",
        createdAt: new Date().toISOString(),
      };
    }

    const currentSequence = Number(approval.current_review_sequence ?? 1);
    const { data: existingSteps } = await supabase
      .schema("staffer")
      .from("approval_review_steps")
      .select("id, sequence, status")
      .eq("approval_id", approval.id)
      .eq("organisation_id", membership.organisation_id)
      .order("sequence", { ascending: true });

    if (!existingSteps?.length) {
      await supabase.schema("staffer").from("approval_review_steps").insert({
        organisation_id: membership.organisation_id,
        approval_id: approval.id,
        sequence: 1,
        reviewer_role: riskClass >= 4 ? "founder" : "reviewer",
        status: "ready",
        required: true,
        expires_at: approval.expires_at ?? null,
        created_by: user.id,
      });
    }

    const nextApprovedCount = status === "approved" ? Number(approval.approved_reviewer_count ?? 0) + 1 : Number(approval.approved_reviewer_count ?? 0);
    const requiredReviewerCount = Number(approval.required_reviewer_count ?? 1);
    const finalStatus = status === "approved" && nextApprovedCount < requiredReviewerCount ? "pending" : status;

    const { data: decisionRecord, error: decisionError } = await supabase
      .schema("staffer")
      .from("approval_decisions")
      .insert({
        organisation_id: membership.organisation_id,
        approval_id: approval.id,
        decision: status,
        comment: `Decision recorded through Staffer UI: ${status}`,
        decided_by: user.id,
        payload_hash_at_decision: approval.payload_hash,
        policy_snapshot: approval.policy_snapshot ?? {},
      })
      .select("id")
      .single();

    if (decisionError) {
      return {
        mode: "error" as const,
        eventType: "approval.decision_failed",
        summary: decisionError.message,
        createdAt: new Date().toISOString(),
      };
    }

    const nextSequence = status === "approved" && finalStatus === "pending" ? currentSequence + 1 : currentSequence;
    const { error } = await supabase
      .schema("staffer")
      .from("approvals")
      .update({
        status: finalStatus,
        decided_by: user.id,
        decided_at: finalStatus === "pending" ? null : new Date().toISOString(),
        decision_comment:
          finalStatus === "pending"
            ? `Decision recorded. ${nextApprovedCount}/${requiredReviewerCount} approvals collected.`
            : `Decision recorded through Staffer UI: ${status}`,
        approved_reviewer_count: nextApprovedCount,
        approval_mode: requiredReviewerCount > 1 ? "sequential" : "single",
        current_review_sequence: nextSequence,
        separation_of_duties_enforced: separationRequired,
        mobile_notification_payload: {
          title: `Approval ${finalStatus}`,
          body:
            finalStatus === "pending"
              ? `${nextApprovedCount}/${requiredReviewerCount} approvals collected. Next reviewer is ready.`
              : `Approval ${approval.id} was marked ${finalStatus}.`,
          actionUrl: approvalActionUrl(approval.id),
        },
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

    const decisionId = typeof decisionRecord?.id === "string" ? decisionRecord.id : null;
    await Promise.allSettled([
      supabase
        .schema("staffer")
        .from("approval_review_steps")
        .update({
          status,
          decision_id: decisionId,
          reviewer_user_id: user.id,
          reviewer_comment: `Decision recorded through Staffer UI: ${status}`,
          decided_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("approval_id", approval.id)
        .eq("organisation_id", membership.organisation_id)
        .eq("sequence", currentSequence),
      finalStatus === "pending"
        ? supabase.schema("staffer").from("approval_review_steps").upsert(
            {
              organisation_id: membership.organisation_id,
              approval_id: approval.id,
              sequence: nextSequence,
              reviewer_role: riskClass >= 4 ? "founder" : "reviewer",
              status: "ready",
              required: true,
              expires_at: approval.expires_at ?? null,
              created_by: user.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "organisation_id,approval_id,sequence,reviewer_user_id" },
          )
        : Promise.resolve({ error: null }),
      supabase.schema("staffer").from("approval_mobile_notifications").insert({
        organisation_id: membership.organisation_id,
        approval_id: approval.id,
        recipient_user_id: finalStatus === "pending" ? null : requestedByUserId,
        channel: "in_app",
        title: finalStatus === "pending" ? "Approval advanced to next reviewer" : `Approval ${finalStatus}`,
        body:
          finalStatus === "pending"
            ? `${nextApprovedCount}/${requiredReviewerCount} approvals collected. The next reviewer can continue.`
            : `Approval ${approval.id} was marked ${finalStatus}.`,
        action_url: approvalActionUrl(approval.id),
        payload: { source: "PB-032", finalStatus, currentSequence, nextSequence, separationRequired },
        created_by: user.id,
      }),
    ]);

    if (String(approval.action_key ?? "") === "github.issue_draft") {
      const featureStatus =
        finalStatus === "approved"
          ? "github_issue_ready"
          : finalStatus === "rejected" || finalStatus === "changes_requested"
            ? "changes_requested"
            : null;

      if (featureStatus) {
        const { error: featureError } = await supabase
          .schema("staffer")
          .from("feature_intake_requests")
          .update({ status: featureStatus, updated_at: new Date().toISOString() })
          .eq("approval_id", approval.id)
          .eq("organisation_id", membership.organisation_id);

        if (featureError) {
          return {
            mode: "error" as const,
            eventType: "approval.decision_failed",
            summary: featureError.message,
            createdAt: new Date().toISOString(),
          };
        }
      }
    }

    if (String(approval.action_key ?? "") === "knowledge.memory_promotion") {
      const promotionStatus =
        finalStatus === "approved"
          ? "applied"
          : finalStatus === "rejected"
            ? "rejected"
            : finalStatus === "changes_requested"
              ? "changes_requested"
              : null;
      const payload = asRecord(approval.action_payload);
      const documentId = typeof payload.documentId === "string" ? payload.documentId : null;
      const targetMemoryScope = typeof payload.targetMemoryScope === "string" ? payload.targetMemoryScope : null;

      const promotionWrites = await Promise.all([
        promotionStatus
          ? supabase
              .schema("staffer")
              .from("knowledge_memory_promotions")
              .update({ status: promotionStatus, updated_at: new Date().toISOString() })
              .eq("approval_id", approval.id)
              .eq("organisation_id", membership.organisation_id)
          : Promise.resolve({ error: null }),
        promotionStatus === "applied" && documentId && targetMemoryScope
          ? supabase
              .schema("staffer")
              .from("documents")
              .update({ memory_scope: targetMemoryScope, updated_at: new Date().toISOString() })
              .eq("id", documentId)
              .eq("organisation_id", membership.organisation_id)
          : Promise.resolve({ error: null }),
        promotionStatus === "applied" && documentId && targetMemoryScope
          ? supabase
              .schema("staffer")
              .from("document_chunks")
              .update({ memory_scope: targetMemoryScope })
              .eq("document_id", documentId)
              .eq("organisation_id", membership.organisation_id)
          : Promise.resolve({ error: null }),
      ]);

      const failedPromotionWrite = promotionWrites.find((result) => result.error);
      if (failedPromotionWrite?.error) {
        return {
          mode: "error" as const,
          eventType: "approval.decision_failed",
          summary: failedPromotionWrite.error.message,
          createdAt: new Date().toISOString(),
        };
      }

      if (promotionStatus && documentId) {
        await recordAuditEvent({
          organisationId: membership.organisation_id,
          actorType: "user",
          actorId: user.id,
          eventType: promotionStatus === "applied" ? "knowledge.memory_promoted" : `knowledge.memory_promotion_${promotionStatus}`,
          entityType: "document",
          entityId: documentId,
          summary:
            promotionStatus === "applied"
              ? "Approved knowledge memory promotion was applied to the document and chunks."
              : `Knowledge memory promotion was marked ${promotionStatus}.`,
          details: {
            approvalId: approval.id,
            documentId,
            sourceMemoryScope: typeof payload.sourceMemoryScope === "string" ? payload.sourceMemoryScope : null,
            targetMemoryScope,
          },
        });
      }
    }

    if (String(approval.action_key ?? "") === "knowledge.retention_delete") {
      const now = new Date().toISOString();
      const retentionStatus =
        finalStatus === "approved"
          ? "executed"
          : finalStatus === "rejected"
            ? "rejected"
            : finalStatus === "changes_requested"
              ? "changes_requested"
              : null;
      const payload = asRecord(approval.action_payload);
      const documentId = typeof payload.documentId === "string" ? payload.documentId : null;
      const retentionWrites = await Promise.all([
        retentionStatus
          ? supabase
              .schema("staffer")
              .from("knowledge_retention_actions")
              .update({ status: retentionStatus, executed_at: retentionStatus === "executed" ? now : null })
              .eq("approval_id", approval.id)
              .eq("organisation_id", membership.organisation_id)
          : Promise.resolve({ error: null }),
        retentionStatus === "executed" && documentId
          ? supabase
              .schema("staffer")
              .from("documents")
              .update({ status: "retired", deleted_at: now, updated_at: now })
              .eq("id", documentId)
              .eq("organisation_id", membership.organisation_id)
          : Promise.resolve({ error: null }),
        retentionStatus && retentionStatus !== "executed" && documentId
          ? supabase
              .schema("staffer")
              .from("documents")
              .update({ status: "approved", updated_at: new Date().toISOString() })
              .eq("id", documentId)
              .eq("organisation_id", membership.organisation_id)
          : Promise.resolve({ error: null }),
      ]);

      const failedRetentionWrite = retentionWrites.find((result) => result.error);
      if (failedRetentionWrite?.error) {
        return {
          mode: "error" as const,
          eventType: "approval.decision_failed",
          summary: failedRetentionWrite.error.message,
          createdAt: new Date().toISOString(),
        };
      }

      if (retentionStatus && documentId) {
        await recordAuditEvent({
          organisationId: membership.organisation_id,
          actorType: "user",
          actorId: user.id,
          eventType: retentionStatus === "executed" ? "knowledge.retention_delete_executed" : `knowledge.retention_delete_${retentionStatus}`,
          entityType: "document",
          entityId: documentId,
          summary:
            retentionStatus === "executed"
              ? "Approved retention deletion was executed as a soft retirement from retrieval."
              : `Knowledge retention deletion request was marked ${retentionStatus}.`,
          details: {
            approvalId: approval.id,
            documentId,
            retentionActionId: typeof payload.retentionActionId === "string" ? payload.retentionActionId : null,
            storageBucket: typeof payload.storageBucket === "string" ? payload.storageBucket : null,
            storagePath: typeof payload.storagePath === "string" ? payload.storagePath : null,
          },
        });
      }
    }

    revalidatePath(`/approvals/${approvalId}`);
    if (String(approval.action_key ?? "").startsWith("knowledge.")) {
      revalidatePath("/knowledge");
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

export async function delegateApprovalStepAction(formData: FormData) {
  const approvalId = text(formData, "approvalId");
  const delegatedToUserId = text(formData, "delegatedToUserId");
  const comment = text(formData, "comment") || "Approval review delegated through Staffer.";

  try {
    if (!approvalId || !delegatedToUserId) {
      throw new Error("Approval id and delegate user id are required.");
    }

    const user = await getCurrentUser();
    const membership = await getCurrentMembership();
    const supabase = await getSupabaseServerClient();
    if (!user || !membership?.organisation_id || !supabase) {
      throw new Error("Delegating an approval requires an authenticated organisation member.");
    }

    const { data: approval, error: approvalError } = await supabase
      .schema("staffer")
      .from("approvals")
      .select("id, payload_hash, policy_snapshot, current_review_sequence")
      .eq("id", approvalId)
      .eq("organisation_id", membership.organisation_id)
      .maybeSingle();
    if (approvalError || !approval) {
      throw new Error(approvalError?.message ?? "Approval was not found.");
    }

    const currentSequence = Number(approval.current_review_sequence ?? 1);
    const { data: decision, error: decisionError } = await supabase
      .schema("staffer")
      .from("approval_decisions")
      .insert({
        organisation_id: membership.organisation_id,
        approval_id: approval.id,
        decision: "delegated",
        comment,
        decided_by: user.id,
        payload_hash_at_decision: approval.payload_hash,
        policy_snapshot: approval.policy_snapshot ?? {},
      })
      .select("id")
      .single();
    if (decisionError) {
      throw new Error(decisionError.message);
    }

    await Promise.all([
      supabase
        .schema("staffer")
        .from("approval_review_steps")
        .update({
          status: "delegated",
          decision_id: decision.id,
          delegated_to_user_id: delegatedToUserId,
          delegated_by_user_id: user.id,
          delegation_comment: comment,
          updated_at: new Date().toISOString(),
        })
        .eq("approval_id", approval.id)
        .eq("organisation_id", membership.organisation_id)
        .eq("sequence", currentSequence),
      supabase.schema("staffer").from("approval_review_steps").insert({
        organisation_id: membership.organisation_id,
        approval_id: approval.id,
        sequence: currentSequence + 1,
        reviewer_user_id: delegatedToUserId,
        required: true,
        status: "ready",
        delegated_by_user_id: user.id,
        delegation_comment: comment,
        created_by: user.id,
      }),
      supabase
        .schema("staffer")
        .from("approvals")
        .update({
          approval_mode: "sequential",
          current_review_sequence: currentSequence + 1,
          decision_comment: `Delegated to ${delegatedToUserId}: ${comment}`,
          mobile_notification_payload: {
            title: "Approval delegated",
            body: comment,
            actionUrl: approvalActionUrl(approval.id),
          },
        })
        .eq("id", approval.id)
        .eq("organisation_id", membership.organisation_id),
      supabase.schema("staffer").from("approval_mobile_notifications").insert({
        organisation_id: membership.organisation_id,
        approval_id: approval.id,
        recipient_user_id: delegatedToUserId,
        channel: "in_app",
        title: "Approval delegated to you",
        body: comment,
        action_url: approvalActionUrl(approval.id),
        payload: { source: "PB-032", delegatedByUserId: user.id, currentSequence },
        created_by: user.id,
      }),
    ]);

    await recordAuditEvent({
      organisationId: membership.organisation_id,
      actorType: "user",
      actorId: user.id,
      eventType: "approval.delegated",
      entityType: "approval",
      entityId: approval.id,
      summary: "Approval review step delegated.",
      details: { approvalId: approval.id, delegatedToUserId, comment, source: "PB-032" },
    });

    revalidatePath(`/approvals/${approvalId}`);
    redirectWithParams(`/approvals/${approvalId}`, { message: "Approval review delegated and notification queued." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/approvals/${approvalId || ""}`, { error: error instanceof Error ? error.message : "Unable to delegate approval." });
  }
}

export async function expireApprovalAction(formData: FormData) {
  const approvalId = text(formData, "approvalId");
  const comment = text(formData, "comment") || "Approval expired through Staffer.";

  try {
    if (!approvalId) {
      throw new Error("Approval id is required.");
    }

    const user = await getCurrentUser();
    const membership = await getCurrentMembership();
    const supabase = await getSupabaseServerClient();
    if (!user || !membership?.organisation_id || !supabase) {
      throw new Error("Expiring an approval requires an authenticated organisation member.");
    }

    const { data: approval, error: approvalError } = await supabase
      .schema("staffer")
      .from("approvals")
      .select("id, payload_hash, policy_snapshot")
      .eq("id", approvalId)
      .eq("organisation_id", membership.organisation_id)
      .maybeSingle();
    if (approvalError || !approval) {
      throw new Error(approvalError?.message ?? "Approval was not found.");
    }

    await Promise.all([
      supabase.schema("staffer").from("approval_decisions").insert({
        organisation_id: membership.organisation_id,
        approval_id: approval.id,
        decision: "expired",
        comment,
        decided_by: user.id,
        payload_hash_at_decision: approval.payload_hash,
        policy_snapshot: approval.policy_snapshot ?? {},
      }),
      supabase
        .schema("staffer")
        .from("approval_review_steps")
        .update({ status: "expired", reviewer_comment: comment, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("approval_id", approval.id)
        .eq("organisation_id", membership.organisation_id)
        .in("status", ["pending", "ready"]),
      supabase
        .schema("staffer")
        .from("approvals")
        .update({
          status: "expired",
          decided_by: user.id,
          decided_at: new Date().toISOString(),
          decision_comment: comment,
          mobile_notification_payload: { title: "Approval expired", body: comment, actionUrl: approvalActionUrl(approval.id) },
        })
        .eq("id", approval.id)
        .eq("organisation_id", membership.organisation_id),
    ]);

    await recordAuditEvent({
      organisationId: membership.organisation_id,
      actorType: "user",
      actorId: user.id,
      eventType: "approval.expired",
      entityType: "approval",
      entityId: approval.id,
      summary: "Approval expired with reviewer history retained.",
      details: { approvalId: approval.id, comment, source: "PB-032" },
    });

    revalidatePath(`/approvals/${approvalId}`);
    redirectWithParams(`/approvals/${approvalId}`, { message: "Approval expired and reviewer steps were closed." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/approvals/${approvalId || ""}`, { error: error instanceof Error ? error.message : "Unable to expire approval." });
  }
}

export async function recordApprovalReviewerCommentAction(formData: FormData) {
  const approvalId = text(formData, "approvalId");
  const comment = text(formData, "comment");

  try {
    if (!approvalId || !comment) {
      throw new Error("Approval id and comment are required.");
    }

    const user = await getCurrentUser();
    const membership = await getCurrentMembership();
    const supabase = await getSupabaseServerClient();
    if (!user || !membership?.organisation_id || !supabase) {
      throw new Error("Recording reviewer comments requires an authenticated organisation member.");
    }

    const { data: approval, error: approvalError } = await supabase
      .schema("staffer")
      .from("approvals")
      .select("id, current_review_sequence")
      .eq("id", approvalId)
      .eq("organisation_id", membership.organisation_id)
      .maybeSingle();
    if (approvalError || !approval) {
      throw new Error(approvalError?.message ?? "Approval was not found.");
    }

    await Promise.allSettled([
      supabase
        .schema("staffer")
        .from("approval_review_steps")
        .update({ reviewer_comment: comment, reviewer_user_id: user.id, updated_at: new Date().toISOString() })
        .eq("approval_id", approval.id)
        .eq("organisation_id", membership.organisation_id)
        .eq("sequence", Number(approval.current_review_sequence ?? 1)),
      recordAuditEvent({
        organisationId: membership.organisation_id,
        actorType: "user",
        actorId: user.id,
        eventType: "approval.reviewer_comment_added",
        entityType: "approval",
        entityId: approval.id,
        summary: "Reviewer comment recorded for approval.",
        details: { approvalId: approval.id, comment, source: "PB-032" },
      }),
    ]);

    revalidatePath(`/approvals/${approvalId}`);
    redirectWithParams(`/approvals/${approvalId}`, { message: "Reviewer comment recorded." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/approvals/${approvalId || ""}`, { error: error instanceof Error ? error.message : "Unable to record reviewer comment." });
  }
}

export async function createApprovedGitHubIssueAction(formData: FormData) {
  const approvalId = text(formData, "approvalId");

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams(`/approvals/${approvalId}`, { message: "Demo mode staged approved GitHub issue creation. No external issue was created." });
  }

  try {
    if (!approvalId) {
      throw new Error("Approval id is required before an approved GitHub issue can be created.");
    }

    const user = await getCurrentUser();
    const membership = await getCurrentMembership();
    const supabase = await getSupabaseServerClient();

    if (!user || !membership?.organisation_id || !supabase) {
      throw new Error("Approved GitHub issue execution requires an authenticated organisation member.");
    }

    const { data: approval, error: approvalError } = await supabase
      .schema("staffer")
      .from("approvals")
      .select("id, organisation_id, task_id, workflow_run_id, requested_by_agent_id, action_key, action_payload, status, execution_status")
      .eq("id", approvalId)
      .eq("organisation_id", membership.organisation_id)
      .maybeSingle();

    if (approvalError || !approval) {
      throw new Error(approvalError?.message ?? "Approval was not found.");
    }

    const actionPayload = asRecord(approval.action_payload);
    const actionKey = String(approval.action_key ?? actionPayload.action ?? "");
    if (actionKey !== "github.issue_draft") {
      throw new Error("Only approved Feature Intake GitHub issue drafts can be executed through this path.");
    }

    if (approval.status !== "approved") {
      throw new Error("The GitHub issue payload must be approved before Staffer can create the issue.");
    }

    if (approval.execution_status === "executed") {
      throw new Error("This approved GitHub issue payload has already been executed.");
    }

    const { data: featureRequest, error: featureRequestError } = await supabase
      .schema("staffer")
      .from("feature_intake_requests")
      .select("id, task_id, workflow_run_id, github_issue_payload")
      .eq("approval_id", approval.id)
      .eq("organisation_id", membership.organisation_id)
      .maybeSingle();

    if (featureRequestError || !featureRequest) {
      throw new Error(featureRequestError?.message ?? "No feature intake request is linked to this approval.");
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

    const githubCreatePermission = await assertAgentToolPermission({
      supabase,
      organisationId: membership.organisation_id,
      agentId: typeof approval.requested_by_agent_id === "string" ? approval.requested_by_agent_id : null,
      toolKey: "github_issue_draft",
      actionKey: "github.issue_create",
      actorUserId: user.id,
      taskId: featureRequest.task_id ?? approval.task_id ?? null,
      workflowRunId: featureRequest.workflow_run_id ?? approval.workflow_run_id ?? null,
      approvalId: approval.id,
      approvalMode: "approved_execution",
      workflowAllowedActions: ["github.issue_create"],
      workflowRequiresApproval: true,
      integrationKey: "github",
      inputSummary: payloadString(actionPayload, "title") || "Approved Feature Intake GitHub issue",
      riskClass: 4,
      metadata: {
        source: "feature_intake",
        repository: payloadString(actionPayload, "repository"),
        verificationCheckId: verificationResult?.check_id,
      },
    });

    let issueResult: Awaited<ReturnType<typeof createApprovedGitHubIssue>>;
    try {
      issueResult = await createApprovedGitHubIssue(actionPayload);
    } catch (createError) {
      await Promise.all([
        supabase
          .schema("staffer")
          .from("approvals")
          .update({ execution_status: "failed" })
          .eq("id", approval.id)
          .eq("organisation_id", membership.organisation_id),
        supabase.schema("staffer").from("tool_execution_logs").insert({
          organisation_id: membership.organisation_id,
          tool_id: githubCreatePermission.toolId,
          agent_id: githubCreatePermission.agentId,
          task_id: featureRequest.task_id ?? approval.task_id,
          workflow_run_id: featureRequest.workflow_run_id ?? approval.workflow_run_id,
          approval_id: approval.id,
          action_key: "github.issue_create",
          integration_key: githubCreatePermission.integrationKey,
          rate_limit_key: githubCreatePermission.rateLimitKey,
          circuit_breaker_key: githubCreatePermission.circuitBreakerKey,
          status: "failed",
          risk_class: 4,
          input_summary: payloadString(actionPayload, "title") || "Approved Feature Intake GitHub issue",
          output_summary: "GitHub issue creation failed before the provider accepted it.",
          redaction_summary: "Full issue body is retained only in the approved payload; telemetry stores title, repository and failure reason only.",
          idempotency_key: `feature-intake:github-create:${featureRequest.id}`,
          metadata: {
            repository: payloadString(actionPayload, "repository"),
            verificationCheckId: verificationResult?.check_id,
            reason: createError instanceof Error ? createError.message : "Unknown GitHub issue creation failure.",
          },
          created_by: user.id,
        }),
      ]);

      await recordAuditEvent({
        organisationId: membership.organisation_id,
        actorType: "user",
        actorId: user.id,
        eventType: "feature_intake.github_issue_failed",
        entityType: "approval",
        entityId: approval.id,
        summary: "Approval-verified GitHub issue creation failed before GitHub accepted it.",
        details: {
          approvalId: approval.id,
          featureRequestId: featureRequest.id,
          repository: payloadString(actionPayload, "repository"),
          reason: createError instanceof Error ? createError.message : "Unknown GitHub issue creation failure.",
          verificationCheckId: verificationResult?.check_id,
        },
      });

      await recordToolRuntimeOutcome({
        supabase,
        organisationId: membership.organisation_id,
        toolId: githubCreatePermission.toolId,
        toolKey: githubCreatePermission.toolKey,
        actionKey: githubCreatePermission.actionKey,
        integrationKey: githubCreatePermission.integrationKey,
        circuitBreakerKey: githubCreatePermission.circuitBreakerKey,
        status: "failed",
        errorMessage: createError instanceof Error ? createError.message : "Unknown GitHub issue creation failure.",
        metadata: { source: "feature_intake", repository: payloadString(actionPayload, "repository") },
      });

      throw createError;
    }

    const now = new Date().toISOString();
    const taskId = String(featureRequest.task_id ?? approval.task_id ?? "");
    const workflowRunId = String(featureRequest.workflow_run_id ?? approval.workflow_run_id ?? "");
    const updatedGithubPayload = {
      ...actionPayload,
      createdIssue: {
        provider: issueResult.provider,
        mode: issueResult.mode,
        repository: issueResult.repository,
        issueNumber: issueResult.issueNumber ?? null,
        issueUrl: issueResult.issueUrl ?? null,
        issueId: issueResult.issueId ?? null,
        createdAt: now,
      },
    };

    const writeResults = await Promise.all([
      supabase
        .schema("staffer")
        .from("approvals")
        .update({ execution_status: "executed" })
        .eq("id", approval.id)
        .eq("organisation_id", membership.organisation_id),
      supabase
        .schema("staffer")
        .from("feature_intake_requests")
        .update({
          status: "github_issue_created",
          github_issue_payload: updatedGithubPayload,
          updated_at: now,
        })
        .eq("id", featureRequest.id)
        .eq("organisation_id", membership.organisation_id),
      taskId
        ? supabase
            .schema("staffer")
            .from("tasks")
            .update({ status: "completed", completed_at: now, updated_at: now })
            .eq("id", taskId)
            .eq("organisation_id", membership.organisation_id)
        : Promise.resolve({ error: null }),
      supabase.schema("staffer").from("tool_execution_logs").insert({
        organisation_id: membership.organisation_id,
        tool_id: githubCreatePermission.toolId,
        agent_id: githubCreatePermission.agentId,
        task_id: taskId || null,
        workflow_run_id: workflowRunId || null,
        approval_id: approval.id,
        action_key: "github.issue_create",
        integration_key: githubCreatePermission.integrationKey,
        rate_limit_key: githubCreatePermission.rateLimitKey,
        circuit_breaker_key: githubCreatePermission.circuitBreakerKey,
        status: "succeeded",
        risk_class: 4,
        input_summary: payloadString(actionPayload, "title") || "Approved Feature Intake GitHub issue",
        output_summary: issueResult.issueUrl ? `GitHub issue created: ${issueResult.issueUrl}` : "GitHub issue created.",
        redaction_summary: "Full issue body is retained in approval evidence; execution telemetry stores metadata and the resulting issue URL.",
        idempotency_key: `feature-intake:github-create:${featureRequest.id}`,
        metadata: {
          repository: issueResult.repository,
          issueNumber: issueResult.issueNumber ?? null,
          issueUrl: issueResult.issueUrl ?? null,
          verificationCheckId: verificationResult?.check_id,
        },
        created_by: user.id,
      }),
      taskId
        ? supabase.schema("staffer").from("task_evidence_events").insert({
            organisation_id: membership.organisation_id,
            task_id: taskId,
            event_type: "feature_intake.github_issue_created",
            title: "Approved GitHub issue created",
            body: issueResult.issueUrl
              ? `Staffer exact-payload verified the approved Feature Intake issue and created ${issueResult.issueUrl}.`
              : "Staffer exact-payload verified the approved Feature Intake issue and created the GitHub issue.",
            metadata: {
              approvalId: approval.id,
              featureRequestId: featureRequest.id,
              repository: issueResult.repository,
              issueNumber: issueResult.issueNumber ?? null,
              issueUrl: issueResult.issueUrl ?? null,
              verificationCheckId: verificationResult?.check_id,
            },
            created_by: user.id,
          })
        : Promise.resolve({ error: null }),
      workflowRunId
        ? supabase.schema("staffer").rpc("record_workflow_run_event", {
            target_organisation_id: membership.organisation_id,
            target_workflow_run_id: workflowRunId,
            target_step_run_id: null,
            target_event_type: "feature_intake.github_issue_created",
            target_title: "Approved GitHub issue created",
            target_body: "GitHub accepted the approval-verified Feature Intake issue payload.",
            target_metadata: {
              approvalId: approval.id,
              featureRequestId: featureRequest.id,
              repository: issueResult.repository,
              issueNumber: issueResult.issueNumber ?? null,
              issueUrl: issueResult.issueUrl ?? null,
              verificationCheckId: verificationResult?.check_id,
            },
          })
        : Promise.resolve({ error: null }),
    ]);

    const failedWrite = writeResults.find((result) => result?.error);
    if (failedWrite?.error) {
      throw new Error(failedWrite.error.message);
    }

    await recordToolRuntimeOutcome({
      supabase,
      organisationId: membership.organisation_id,
      toolId: githubCreatePermission.toolId,
      toolKey: githubCreatePermission.toolKey,
      actionKey: githubCreatePermission.actionKey,
      integrationKey: githubCreatePermission.integrationKey,
      circuitBreakerKey: githubCreatePermission.circuitBreakerKey,
      status: "succeeded",
      metadata: { source: "feature_intake", repository: issueResult.repository },
    });

    await recordAuditEvent({
      organisationId: membership.organisation_id,
      actorType: "user",
      actorId: user.id,
      eventType: "feature_intake.github_issue_created",
      entityType: "feature_intake_request",
      entityId: featureRequest.id,
      summary: "Approved Feature Intake GitHub issue was exact-payload verified and created.",
      details: {
        approvalId: approval.id,
        featureRequestId: featureRequest.id,
        taskId: taskId || null,
        workflowRunId: workflowRunId || null,
        repository: issueResult.repository,
        issueNumber: issueResult.issueNumber ?? null,
        issueUrl: issueResult.issueUrl ?? null,
        verificationCheckId: verificationResult?.check_id,
      },
    });

    revalidatePath(`/approvals/${approvalId}`);
    revalidatePath("/approvals");
    revalidatePath("/tasks");
    revalidatePath("/workflows/feature-intake");
    revalidatePath("/governance");
    redirectWithParams(`/approvals/${approvalId}`, {
      message: issueResult.issueUrl ? `Approved GitHub issue created: ${issueResult.issueUrl}` : "Approved GitHub issue created.",
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/approvals/${approvalId || ""}`, { error: error instanceof Error ? error.message : "Unable to create approved GitHub issue." });
  }
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
      .select("id, organisation_id, task_id, workflow_run_id, requested_by_agent_id, action_key, action_payload, status, execution_status")
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

    const supportSendPermission = await assertAgentToolPermission({
      supabase,
      organisationId: membership.organisation_id,
      agentId: typeof approval.requested_by_agent_id === "string" ? approval.requested_by_agent_id : null,
      toolKey: "email_draft",
      actionKey: "support.response_send",
      actorUserId: user.id,
      taskId: supportCase.task_id ?? approval.task_id ?? null,
      workflowRunId: supportCase.workflow_run_id ?? approval.workflow_run_id ?? null,
      approvalId: approval.id,
      approvalMode: "approved_execution",
      workflowAllowedActions: ["support.response_send"],
      workflowRequiresApproval: true,
      integrationKey: "email",
      inputSummary: subject,
      riskClass: 4,
      metadata: {
        source: "support_triage",
        recipientDomain: recipientDomain(recipient),
        verificationCheckId: verificationResult?.check_id,
      },
    });

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
        supabase.schema("staffer").from("tool_execution_logs").insert({
          organisation_id: membership.organisation_id,
          tool_id: supportSendPermission.toolId,
          agent_id: supportSendPermission.agentId,
          task_id: supportCase.task_id ?? approval.task_id,
          workflow_run_id: supportCase.workflow_run_id ?? approval.workflow_run_id,
          approval_id: approval.id,
          action_key: "support.response_send",
          integration_key: supportSendPermission.integrationKey,
          rate_limit_key: supportSendPermission.rateLimitKey,
          circuit_breaker_key: supportSendPermission.circuitBreakerKey,
          status: "failed",
          risk_class: 4,
          input_summary: subject,
          output_summary: "Support email send failed before the provider accepted it.",
          redaction_summary: "Email body remains in approved payload evidence; telemetry stores subject, recipient domain and failure reason only.",
          idempotency_key: `support-triage:email-send:${supportCase.id}`,
          metadata: {
            recipientDomain: recipientDomain(recipient),
            verificationCheckId: verificationResult?.check_id,
            reason: sendError instanceof Error ? sendError.message : "Unknown support email send failure.",
          },
          created_by: user.id,
        }),
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

      await recordToolRuntimeOutcome({
        supabase,
        organisationId: membership.organisation_id,
        toolId: supportSendPermission.toolId,
        toolKey: supportSendPermission.toolKey,
        actionKey: supportSendPermission.actionKey,
        integrationKey: supportSendPermission.integrationKey,
        circuitBreakerKey: supportSendPermission.circuitBreakerKey,
        status: "failed",
        errorMessage: sendError instanceof Error ? sendError.message : "Unknown support email send failure.",
        metadata: { source: "support_triage", recipientDomain: recipientDomain(recipient) },
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
      supabase.schema("staffer").from("tool_execution_logs").insert({
        organisation_id: membership.organisation_id,
        tool_id: supportSendPermission.toolId,
        agent_id: supportSendPermission.agentId,
        task_id: taskId || null,
        workflow_run_id: workflowRunId || null,
        approval_id: approval.id,
        action_key: "support.response_send",
        integration_key: supportSendPermission.integrationKey,
        rate_limit_key: supportSendPermission.rateLimitKey,
        circuit_breaker_key: supportSendPermission.circuitBreakerKey,
        status: "succeeded",
        risk_class: 4,
        input_summary: subject,
        output_summary: emailResult.messageId ? `Support email accepted with message id ${emailResult.messageId}.` : "Support email accepted by provider.",
        redaction_summary: "Email body remains in approval evidence; execution telemetry stores provider metadata and recipient domain.",
        idempotency_key: `support-triage:email-send:${supportCase.id}`,
        metadata: {
          provider: emailResult.provider,
          mode: emailResult.mode,
          messageId: emailResult.messageId,
          verificationCheckId: verificationResult?.check_id,
          recipientDomain: recipientDomain(recipient),
        },
        created_by: user.id,
      }),
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

    await recordToolRuntimeOutcome({
      supabase,
      organisationId: membership.organisation_id,
      toolId: supportSendPermission.toolId,
      toolKey: supportSendPermission.toolKey,
      actionKey: supportSendPermission.actionKey,
      integrationKey: supportSendPermission.integrationKey,
      circuitBreakerKey: supportSendPermission.circuitBreakerKey,
      status: "succeeded",
      metadata: { source: "support_triage", recipientDomain: recipientDomain(recipient) },
    });

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

export async function createApprovedGmailDraftAction(formData: FormData) {
  const approvalId = text(formData, "approvalId");

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams(`/approvals/${approvalId}`, { message: "Demo mode staged the approved Gmail draft. No Gmail draft was created." });
  }

  try {
    if (!approvalId) {
      throw new Error("Approval id is required before an approved Gmail draft can be created.");
    }

    const user = await getCurrentUser();
    const membership = await getCurrentMembership();
    const supabase = await getSupabaseServerClient();

    if (!user || !membership?.organisation_id || !supabase) {
      throw new Error("Approved Gmail draft creation requires an authenticated organisation member.");
    }

    const { data: approval, error: approvalError } = await supabase
      .schema("staffer")
      .from("approvals")
      .select("id, organisation_id, task_id, workflow_run_id, requested_by_agent_id, action_key, action_payload, status, execution_status")
      .eq("id", approvalId)
      .eq("organisation_id", membership.organisation_id)
      .maybeSingle();

    if (approvalError || !approval) {
      throw new Error(approvalError?.message ?? "Approval was not found.");
    }

    const actionPayload = asRecord(approval.action_payload);
    const actionKey = String(approval.action_key ?? actionPayload.action ?? "");
    if (actionKey !== "support.response_draft") {
      throw new Error("Only approved Customer Support Triage response drafts can create Gmail drafts.");
    }

    if (approval.status !== "approved") {
      throw new Error("The support response must be approved before Staffer can create a Gmail draft.");
    }

    if (approval.execution_status === "executed") {
      throw new Error("This approved support response has already been executed.");
    }

    const recipient = payloadString(actionPayload, "recipient");
    const subject = payloadString(actionPayload, "subject");
    const draftResponse = payloadString(actionPayload, "draftResponse");
    if (!recipient || !subject || !draftResponse) {
      throw new Error("The approved payload must include recipient, subject and draftResponse before Gmail draft creation.");
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

    let draftResult: Awaited<ReturnType<typeof runGmailDraftCreateTool>>;
    try {
      draftResult = await runGmailDraftCreateTool({
        supabase,
        organisationId: membership.organisation_id,
        agentId: typeof approval.requested_by_agent_id === "string" ? approval.requested_by_agent_id : null,
        actorUserId: user.id,
        taskId: supportCase.task_id ?? approval.task_id ?? null,
        workflowRunId: supportCase.workflow_run_id ?? approval.workflow_run_id ?? null,
        approvalId: approval.id,
        to: recipient,
        subject,
        textBody: draftResponse,
        threadId: payloadString(actionPayload, "gmailThreadId") || null,
        inReplyTo: payloadString(actionPayload, "gmailMessageId") || null,
        riskClass: 4,
        metadata: {
          source: "support_triage",
          verificationCheckId: verificationResult?.check_id,
          recipientDomain: recipientDomain(recipient),
        },
      });
    } catch (draftError) {
      await Promise.allSettled([
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
        eventType: "support_triage.gmail_draft_failed",
        entityType: "approval",
        entityId: approval.id,
        summary: "Approval-verified Gmail draft creation failed before Gmail accepted it.",
        details: {
          approvalId: approval.id,
          supportCaseId: supportCase.id,
          recipientDomain: recipientDomain(recipient),
          reason: draftError instanceof Error ? draftError.message : "Unknown Gmail draft creation failure.",
          verificationCheckId: verificationResult?.check_id,
        },
      });

      throw draftError;
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
          external_action_status: "draft_created",
          updated_at: now,
        })
        .eq("id", supportCase.id)
        .eq("organisation_id", membership.organisation_id),
      taskId
        ? supabase.schema("staffer").from("task_evidence_events").insert({
            organisation_id: membership.organisation_id,
            task_id: taskId,
            event_type: "support_triage.gmail_draft_created",
            title: "Approved Gmail draft created",
            body: "Anna's approved support response was exact-payload verified and saved as a Gmail draft. No email was sent.",
            metadata: {
              approvalId: approval.id,
              supportCaseId: supportCase.id,
              draftId: draftResult.id,
              messageId: draftResult.messageId,
              threadId: draftResult.threadId,
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
            target_event_type: "support_triage.gmail_draft_created",
            target_title: "Approved Gmail draft created",
            target_body: "Gmail accepted the approval-verified support response as a draft only.",
            target_metadata: {
              approvalId: approval.id,
              supportCaseId: supportCase.id,
              draftId: draftResult.id,
              messageId: draftResult.messageId,
              threadId: draftResult.threadId,
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
      eventType: "support_triage.gmail_draft_created",
      entityType: "support_triage_case",
      entityId: supportCase.id,
      summary: "Approved support response was exact-payload verified and saved as a Gmail draft.",
      details: {
        approvalId: approval.id,
        supportCaseId: supportCase.id,
        taskId: taskId || null,
        workflowRunId: workflowRunId || null,
        draftId: draftResult.id,
        messageId: draftResult.messageId,
        threadId: draftResult.threadId,
        recipientDomain: recipientDomain(recipient),
        verificationCheckId: verificationResult?.check_id,
      },
    });

    revalidatePath(`/approvals/${approvalId}`);
    revalidatePath("/approvals");
    revalidatePath("/tasks");
    revalidatePath("/workflows/support-triage");
    redirectWithParams(`/approvals/${approvalId}`, { message: "Approved support response verified and saved as a Gmail draft. No email was sent." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/approvals/${approvalId || ""}`, { error: error instanceof Error ? error.message : "Unable to create approved Gmail draft." });
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
