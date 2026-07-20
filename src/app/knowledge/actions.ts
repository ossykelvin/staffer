"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/audit";
import { getCurrentMembership, getCurrentUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  KNOWLEDGE_EMBEDDING_MODEL_KEY,
  KNOWLEDGE_UPLOAD_BUCKET,
  chunkKnowledgeText,
  contentHash,
  createKnowledgeEmbedding,
  extractKnowledgeText,
  normaliseMemoryScope,
  safeKnowledgeFileName,
  scanKnowledgeUpload,
  slugifyKnowledgeValue,
} from "@/lib/knowledge/processing";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

function parseAgentKeys(value: string) {
  return value
    .split(",")
    .map((item) => slugifyKnowledgeValue(item))
    .filter(Boolean);
}

function futureDateFromDays(days: number | null) {
  if (!days || days <= 0) {
    return null;
  }

  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function fileFromForm(formData: FormData, key: string) {
  const value = formData.get(key);
  return value instanceof File && value.size > 0 ? value : null;
}

function numberOrDefault(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cleanOptionalKey(value: string) {
  return value ? slugifyKnowledgeValue(value) : null;
}

async function liveKnowledgeContext() {
  const user = await getCurrentUser();
  const membership = await getCurrentMembership();
  const supabase = await getSupabaseServerClient();

  if (!user || !membership?.organisation_id || !supabase) {
    throw new Error("Knowledge controls require an authenticated organisation member.");
  }

  return { user, membership, supabase };
}

function riskClassForKnowledgeDocument(sensitivity: string) {
  return sensitivity === "restricted" ? 4 : sensitivity === "confidential" ? 3 : 2;
}

async function hashApprovalPayload(supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>, payload: Record<string, unknown>) {
  if (!supabase) {
    throw new Error("Supabase is unavailable.");
  }

  const result = await supabase.schema("staffer").rpc("approval_payload_hash", {
    target_payload: payload,
  });

  if (result.error || typeof result.data !== "string") {
    throw new Error(result.error?.message ?? "Unable to hash approval payload.");
  }

  return result.data;
}

export async function ingestKnowledgeDocumentAction(formData: FormData) {
  const collectionName = text(formData, "collectionName");
  const collectionKey = slugifyKnowledgeValue(text(formData, "collectionKey") || collectionName);
  const title = text(formData, "title");
  const sourceUrl = text(formData, "sourceUrl");
  const sensitivity = text(formData, "sensitivity") || "internal";
  const accessMode = text(formData, "accessMode") === "restricted" ? "restricted" : "organisation";
  const pastedContent = text(formData, "content");
  const agentKeys = parseAgentKeys(text(formData, "agentKeys"));
  const reviewDays = numberOrDefault(text(formData, "reviewIntervalDays"), 90);
  const retentionDays = numberOrDefault(text(formData, "retentionDays"), 365);
  const legalHold = text(formData, "legalHold") === "on";
  const memoryScope = normaliseMemoryScope(text(formData, "memoryScope"));
  const projectKey = cleanOptionalKey(text(formData, "projectKey"));
  const customerKey = cleanOptionalKey(text(formData, "customerKey"));
  const uploadedFile = fileFromForm(formData, "documentFile");

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams("/knowledge", { message: "Demo knowledge upload staged. Live upload, scan, extraction and memory controls are enabled when demo mode is disabled." });
  }

  try {
    if (!collectionName || !collectionKey || !title || (!pastedContent && !uploadedFile)) {
      throw new Error("Collection name, document title and either approved source text or an upload are required.");
    }

    if (uploadedFile && uploadedFile.size > 10 * 1024 * 1024) {
      throw new Error("Knowledge uploads are limited to 10 MB. Use a smaller source or split the document.");
    }

    const user = await getCurrentUser();
    const membership = await getCurrentMembership();
    const supabase = await getSupabaseServerClient();

    if (!user || !membership?.organisation_id || !supabase) {
      throw new Error("Knowledge ingestion requires an authenticated organisation member.");
    }

    const now = new Date().toISOString();
    const documentId = randomUUID();
    const uploadBuffer = uploadedFile ? Buffer.from(await uploadedFile.arrayBuffer()) : null;
    const originalFilename = uploadedFile ? safeKnowledgeFileName(uploadedFile.name) : null;
    const mimeType = uploadedFile?.type || (uploadedFile ? "application/octet-stream" : "text/plain");
    const plannedStoragePath = uploadedFile ? `${membership.organisation_id}/${documentId}/${originalFilename}` : null;
    const scan = uploadBuffer ? scanKnowledgeUpload(uploadBuffer, mimeType, originalFilename ?? "upload") : { status: "not_required" as const, summary: "Manual text ingestion does not require file scanning." };
    const storagePath = scan.status === "clean" ? plannedStoragePath : null;
    const extractedUpload = uploadBuffer && scan.status === "clean" ? extractKnowledgeText(uploadBuffer, mimeType, originalFilename ?? "upload") : null;
    const content = (pastedContent || extractedUpload?.text || "").trim();
    const hasSearchableContent = scan.status !== "flagged" && scan.status !== "failed" && content.length > 0;
    const hash = contentHash(content || uploadBuffer || title);
    const uploadStatus = uploadedFile ? (scan.status === "clean" ? "uploaded" : scan.status === "flagged" ? "blocked" : "failed") : "not_required";
    const extractionStatus = hasSearchableContent ? "completed" : extractedUpload?.status ?? (uploadedFile ? "failed" : "completed");
    const documentStatus = hasSearchableContent ? "approved" : "needs_review";

    const { data: collection, error: collectionError } = await supabase
      .schema("staffer")
      .from("knowledge_collections")
      .upsert(
        {
          organisation_id: membership.organisation_id,
          key: collectionKey,
          name: collectionName,
          sensitivity,
          access_mode: accessMode,
          memory_scope: memoryScope,
          project_key: projectKey,
          customer_key: customerKey,
          retention_days: retentionDays,
          review_interval_days: reviewDays,
          metadata: { createdFrom: "knowledge_hub", pb: "PB-033" },
          created_by: user.id,
          updated_at: now,
        },
        { onConflict: "organisation_id,key" },
      )
      .select("id, key, name")
      .single();

    if (collectionError || !collection?.id) {
      throw new Error(collectionError?.message ?? "Unable to create knowledge collection.");
    }

    const { data: document, error: documentError } = await supabase
      .schema("staffer")
      .from("documents")
      .insert({
        id: documentId,
        organisation_id: membership.organisation_id,
        collection_id: collection.id,
        title,
        source_type: uploadedFile ? "file_upload" : "manual_text",
        source_url: sourceUrl || null,
        storage_bucket: KNOWLEDGE_UPLOAD_BUCKET,
        storage_path: storagePath,
        original_filename: originalFilename,
        file_size_bytes: uploadedFile?.size ?? null,
        upload_status: uploadStatus,
        mime_type: uploadedFile ? mimeType : "text/plain",
        sensitivity,
        memory_scope: memoryScope,
        project_key: projectKey,
        customer_key: customerKey,
        metadata: {
          ingestionMode: uploadedFile ? "file_upload" : "manual_text",
          collectionKey,
          uploadScan: scan.summary,
          extractionSummary: extractedUpload?.summary ?? null,
        },
        status: documentStatus,
        version: 1,
        content_hash: hash,
        extracted_text: content || null,
        extraction_status: extractionStatus,
        scan_status: scan.status,
        scan_summary: scan.summary,
        embedding_status: hasSearchableContent ? "completed" : "not_requested",
        review_due_at: futureDateFromDays(reviewDays),
        retention_until: legalHold ? null : futureDateFromDays(retentionDays),
        legal_hold: legalHold,
        reviewed_at: hasSearchableContent ? now : null,
        reviewed_by: hasSearchableContent ? user.id : null,
        created_by: user.id,
        updated_at: now,
      })
      .select("id")
      .single();

    if (documentError || !document?.id) {
      throw new Error(documentError?.message ?? "Unable to store knowledge document.");
    }

    if (uploadBuffer && storagePath && scan.status === "clean") {
      const { error: uploadError } = await supabase.storage.from(KNOWLEDGE_UPLOAD_BUCKET).upload(storagePath, uploadBuffer, {
        contentType: mimeType,
        upsert: false,
      });

      if (uploadError) {
        await supabase
          .schema("staffer")
          .from("documents")
          .update({
            status: "needs_review",
            upload_status: "failed",
            extraction_status: "failed",
            scan_summary: `Upload failed after metadata creation: ${uploadError.message}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", document.id)
          .eq("organisation_id", membership.organisation_id);

        throw new Error(uploadError.message);
      }
    }

    const { data: version, error: versionError } = await supabase
      .schema("staffer")
      .from("document_versions")
      .insert({
        organisation_id: membership.organisation_id,
        document_id: document.id,
        collection_id: collection.id,
        version: 1,
        title,
        source_url: sourceUrl || null,
        storage_path: storagePath,
        mime_type: uploadedFile ? mimeType : "text/plain",
        file_size_bytes: uploadedFile?.size ?? null,
        content_hash: hash,
        extracted_text: content,
        scan_status: scan.status,
        extraction_status: extractionStatus,
        memory_scope: memoryScope,
        project_key: projectKey,
        customer_key: customerKey,
        metadata: { ingestionMode: uploadedFile ? "file_upload" : "manual_text", pb: "PB-033" },
        created_by: user.id,
      })
      .select("id")
      .single();

    if (versionError || !version?.id) {
      throw new Error(versionError?.message ?? "Unable to store document version.");
    }

    if (!hasSearchableContent) {
      await recordAuditEvent({
        organisationId: membership.organisation_id,
        actorType: "user",
        actorId: user.id,
        eventType: scan.status === "flagged" ? "knowledge.document_upload_flagged" : "knowledge.document_needs_review",
        entityType: "document",
        entityId: document.id,
        summary: scan.status === "flagged" ? "Knowledge upload was blocked by the file safety scan." : "Knowledge upload was versioned for manual extraction review.",
        details: {
          documentId: document.id,
          documentVersionId: version.id,
          collectionId: collection.id,
          collectionKey,
          scanStatus: scan.status,
          scanSummary: scan.summary,
          extractionStatus,
          originalFilename,
          memoryScope,
          projectKey,
          customerKey,
        },
      });

      revalidatePath("/knowledge");
      redirectWithParams("/knowledge", {
        message:
          scan.status === "flagged"
            ? "Upload was blocked by the file safety scan; Staffer kept only the review metadata, not the file bytes."
            : "Upload was stored and versioned, but it needs manual extraction review before it becomes searchable knowledge.",
      });
    }

    const chunks = chunkKnowledgeText(content);
    const chunkRows = chunks.map((chunk, index) => {
      const embedding = createKnowledgeEmbedding(chunk);
      return {
        organisation_id: membership.organisation_id,
        collection_id: collection.id,
        document_id: document.id,
        document_version_id: version.id,
        chunk_index: index + 1,
        content: chunk,
        citation: {
          documentId: document.id,
          documentTitle: title,
          collectionKey,
          sourceUrl: sourceUrl || null,
          version: 1,
          chunkIndex: index + 1,
        },
        metadata: { contentHash: hash, sourceType: uploadedFile ? "file_upload" : "manual_text", memoryScope },
        sensitivity,
        memory_scope: memoryScope,
        project_key: projectKey,
        customer_key: customerKey,
        embedding,
        embedding_dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
        embedding_input_hash: contentHash(chunk),
        embedding_generated_at: now,
        embedding_metadata: {
          generator: KNOWLEDGE_EMBEDDING_MODEL_KEY,
          dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
          source: "PB-033",
        },
        embedding_model_key: KNOWLEDGE_EMBEDDING_MODEL_KEY,
        embedding_status: "completed",
      };
    });
    const { error: chunkError } = await supabase.schema("staffer").from("document_chunks").insert(chunkRows);

    if (chunkError) {
      throw new Error(chunkError.message);
    }

    if (agentKeys.length) {
      const { data: agents } = await supabase
        .schema("staffer")
        .from("agents")
        .select("id, key")
        .eq("organisation_id", membership.organisation_id)
        .in("key", agentKeys);

      const accessRows = (agents ?? []).map((agent) => ({
        organisation_id: membership.organisation_id,
        collection_id: collection.id,
        agent_id: agent.id,
        can_retrieve: true,
        can_ingest: false,
        created_by: user.id,
      }));

      if (accessRows.length) {
        const { error: accessError } = await supabase
          .schema("staffer")
          .from("knowledge_collection_agents")
          .upsert(accessRows, { onConflict: "collection_id,agent_id" });

        if (accessError) {
          throw new Error(accessError.message);
        }
      }
    }

    await recordAuditEvent({
      organisationId: membership.organisation_id,
      actorType: "user",
      actorId: user.id,
      eventType: "knowledge.document_ingested",
      entityType: "document",
      entityId: document.id,
      summary: "Knowledge document was ingested, versioned and chunked.",
      details: {
        documentId: document.id,
        collectionId: collection.id,
        collectionKey,
        chunkCount: chunks.length,
        contentHash: hash,
        accessMode,
        agentKeys,
        uploadStatus,
        scanStatus: scan.status,
        extractionStatus,
        memoryScope,
        projectKey,
        customerKey,
      },
    });

    revalidatePath("/knowledge");
    redirectWithParams("/knowledge", { message: `Ingested ${chunks.length} citation-ready chunks into ${collection.name}.` });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirectWithParams("/knowledge", { error: error instanceof Error ? error.message : "Unable to ingest knowledge document." });
  }
}

export async function requestKnowledgeMemoryPromotionAction(formData: FormData) {
  const documentId = text(formData, "documentId");
  const targetMemoryScope = normaliseMemoryScope(text(formData, "targetMemoryScope") || "company");
  const reason = text(formData, "reason");

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams("/knowledge", { message: "Demo memory promotion approval staged. Live approvals are created when demo mode is disabled." });
  }

  try {
    if (!documentId || !reason) {
      throw new Error("Document and promotion reason are required.");
    }

    const { user, membership, supabase } = await liveKnowledgeContext();
    const { data: document, error: documentError } = await supabase
      .schema("staffer")
      .from("documents")
      .select("id, title, sensitivity, status, memory_scope, project_key, customer_key, promotion_approval_id")
      .eq("organisation_id", membership.organisation_id)
      .eq("id", documentId)
      .maybeSingle();

    if (documentError || !document?.id) {
      throw new Error(documentError?.message ?? "Knowledge document was not found.");
    }

    if (document.status !== "approved") {
      throw new Error("Only approved knowledge documents can be promoted to longer-lived memory.");
    }

    if (document.memory_scope === targetMemoryScope) {
      throw new Error("Choose a different target memory scope before requesting promotion.");
    }

    const promotionId = randomUUID();
    const riskClass = riskClassForKnowledgeDocument(String(document.sensitivity ?? "internal"));
    const actionPayload = {
      action: "knowledge.memory_promotion",
      promotionId,
      documentId: document.id,
      title: document.title,
      sourceMemoryScope: document.memory_scope,
      targetMemoryScope,
      projectKey: document.project_key ?? null,
      customerKey: document.customer_key ?? null,
      reason,
      externalPublicationBlocked: true,
    };
    const payloadHash = await hashApprovalPayload(supabase, actionPayload);

    const { error: promotionError } = await supabase.schema("staffer").from("knowledge_memory_promotions").insert({
      id: promotionId,
      organisation_id: membership.organisation_id,
      source_document_id: document.id,
      source_memory_scope: document.memory_scope,
      target_memory_scope: targetMemoryScope,
      reason,
      status: "approval_requested",
      metadata: { source: "PB-033", payloadHash },
      created_by: user.id,
      updated_at: new Date().toISOString(),
    });

    if (promotionError) {
      throw new Error(promotionError.message);
    }

    const { data: approval, error: approvalError } = await supabase
      .schema("staffer")
      .from("approvals")
      .insert({
        organisation_id: membership.organisation_id,
        requested_by_user_id: user.id,
        action_key: "knowledge.memory_promotion",
        action_payload: actionPayload,
        payload_hash: payloadHash,
        risk_class: riskClass,
        status: "pending",
        required_reviewer_count: riskClass >= 4 ? 2 : 1,
        policy_snapshot: {
          source: "PB-033 Knowledge upload and memory controls",
          policyKey: "knowledge_memory_promotion",
          policyName: "Knowledge memory promotion approval",
          exactPayloadRequired: true,
          targetMemoryScope,
        },
      })
      .select("id")
      .single();

    if (approvalError || !approval?.id) {
      throw new Error(approvalError?.message ?? "Unable to create memory promotion approval.");
    }

    const updateResults = await Promise.all([
      supabase
        .schema("staffer")
        .from("knowledge_memory_promotions")
        .update({ approval_id: approval.id, updated_at: new Date().toISOString() })
        .eq("id", promotionId)
        .eq("organisation_id", membership.organisation_id),
      supabase
        .schema("staffer")
        .from("documents")
        .update({ promotion_approval_id: approval.id, updated_at: new Date().toISOString() })
        .eq("id", document.id)
        .eq("organisation_id", membership.organisation_id),
    ]);

    const failedUpdate = updateResults.find((result) => result.error);
    if (failedUpdate?.error) {
      throw new Error(failedUpdate.error.message);
    }

    await recordAuditEvent({
      organisationId: membership.organisation_id,
      actorType: "user",
      actorId: user.id,
      eventType: "knowledge.memory_promotion_requested",
      entityType: "document",
      entityId: document.id,
      summary: "Long-term memory promotion approval was requested.",
      details: {
        documentId: document.id,
        promotionId,
        approvalId: approval.id,
        sourceMemoryScope: document.memory_scope,
        targetMemoryScope,
        payloadHash,
      },
    });

    revalidatePath("/knowledge");
    revalidatePath("/approvals");
    redirectWithParams("/knowledge", { message: "Memory promotion approval requested. The document remains in its current scope until approval is recorded." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirectWithParams("/knowledge", { error: error instanceof Error ? error.message : "Unable to request memory promotion approval." });
  }
}

export async function requestKnowledgeRetentionDeletionAction(formData: FormData) {
  const documentId = text(formData, "documentId");
  const reason = text(formData, "reason");

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams("/knowledge", { message: "Demo retention deletion approval staged. Live approvals are created when demo mode is disabled." });
  }

  try {
    if (!documentId || !reason) {
      throw new Error("Document and retention/deletion reason are required.");
    }

    const { user, membership, supabase } = await liveKnowledgeContext();
    const { data: document, error: documentError } = await supabase
      .schema("staffer")
      .from("documents")
      .select("id, title, sensitivity, status, memory_scope, project_key, customer_key, storage_bucket, storage_path, retention_until, legal_hold")
      .eq("organisation_id", membership.organisation_id)
      .eq("id", documentId)
      .maybeSingle();

    if (documentError || !document?.id) {
      throw new Error(documentError?.message ?? "Knowledge document was not found.");
    }

    if (document.legal_hold) {
      throw new Error("This document is under legal hold. Remove the hold before requesting retention deletion.");
    }

    const retentionActionId = randomUUID();
    const riskClass = Math.max(4, riskClassForKnowledgeDocument(String(document.sensitivity ?? "internal")));
    const actionPayload = {
      action: "knowledge.retention_delete",
      retentionActionId,
      documentId: document.id,
      title: document.title,
      memoryScope: document.memory_scope,
      projectKey: document.project_key ?? null,
      customerKey: document.customer_key ?? null,
      storageBucket: document.storage_bucket ?? null,
      storagePath: document.storage_path ?? null,
      retentionUntil: document.retention_until ?? null,
      reason,
      deletionBlockedUntilApproved: true,
    };
    const payloadHash = await hashApprovalPayload(supabase, actionPayload);

    const { error: retentionError } = await supabase.schema("staffer").from("knowledge_retention_actions").insert({
      id: retentionActionId,
      organisation_id: membership.organisation_id,
      document_id: document.id,
      action_key: "knowledge.retention_delete",
      reason,
      status: "approval_requested",
      action_payload: actionPayload,
      created_by: user.id,
    });

    if (retentionError) {
      throw new Error(retentionError.message);
    }

    const { data: approval, error: approvalError } = await supabase
      .schema("staffer")
      .from("approvals")
      .insert({
        organisation_id: membership.organisation_id,
        requested_by_user_id: user.id,
        action_key: "knowledge.retention_delete",
        action_payload: actionPayload,
        payload_hash: payloadHash,
        risk_class: riskClass,
        status: "pending",
        required_reviewer_count: 2,
        policy_snapshot: {
          source: "PB-033 Knowledge upload and memory controls",
          policyKey: "knowledge_retention_delete",
          policyName: "Knowledge retention deletion approval",
          exactPayloadRequired: true,
          deletionRequiresApproval: true,
        },
      })
      .select("id")
      .single();

    if (approvalError || !approval?.id) {
      throw new Error(approvalError?.message ?? "Unable to create retention deletion approval.");
    }

    const updateResults = await Promise.all([
      supabase
        .schema("staffer")
        .from("knowledge_retention_actions")
        .update({ approval_id: approval.id })
        .eq("id", retentionActionId)
        .eq("organisation_id", membership.organisation_id),
      supabase
        .schema("staffer")
        .from("documents")
        .update({ status: "deletion_requested", deletion_approval_id: approval.id, deletion_requested_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", document.id)
        .eq("organisation_id", membership.organisation_id),
    ]);

    const failedUpdate = updateResults.find((result) => result.error);
    if (failedUpdate?.error) {
      throw new Error(failedUpdate.error.message);
    }

    await recordAuditEvent({
      organisationId: membership.organisation_id,
      actorType: "user",
      actorId: user.id,
      eventType: "knowledge.retention_delete_requested",
      entityType: "document",
      entityId: document.id,
      summary: "Knowledge retention deletion approval was requested.",
      details: {
        documentId: document.id,
        retentionActionId,
        approvalId: approval.id,
        payloadHash,
      },
    });

    revalidatePath("/knowledge");
    revalidatePath("/approvals");
    redirectWithParams("/knowledge", { message: "Retention deletion approval requested. No document or file was deleted." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirectWithParams("/knowledge", { error: error instanceof Error ? error.message : "Unable to request retention deletion approval." });
  }
}

export async function setKnowledgeLegalHoldAction(formData: FormData) {
  const documentId = text(formData, "documentId");
  const legalHoldEnabled = text(formData, "legalHold") === "true";
  const reason = text(formData, "reason") || "Legal hold updated from Knowledge Hub.";
  const retentionDays = numberOrDefault(text(formData, "retentionDays"), 365);

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams("/knowledge", { message: "Demo legal hold update staged. Live legal holds are updated when demo mode is disabled." });
  }

  try {
    if (!documentId) {
      throw new Error("Document id is required.");
    }

    const { user, membership, supabase } = await liveKnowledgeContext();
    const nextRetentionUntil = legalHoldEnabled ? null : futureDateFromDays(retentionDays);
    const { error } = await supabase
      .schema("staffer")
      .from("documents")
      .update({
        legal_hold: legalHoldEnabled,
        retention_until: nextRetentionUntil,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId)
      .eq("organisation_id", membership.organisation_id);

    if (error) {
      throw new Error(error.message);
    }

    await recordAuditEvent({
      organisationId: membership.organisation_id,
      actorType: "user",
      actorId: user.id,
      eventType: legalHoldEnabled ? "knowledge.legal_hold_enabled" : "knowledge.legal_hold_removed",
      entityType: "document",
      entityId: documentId,
      summary: legalHoldEnabled ? "Knowledge document legal hold was enabled." : "Knowledge document legal hold was removed.",
      details: {
        documentId,
        reason,
        retentionUntil: nextRetentionUntil,
      },
    });

    revalidatePath("/knowledge");
    redirectWithParams("/knowledge", { message: legalHoldEnabled ? "Legal hold enabled. Retention expiry is paused." : "Legal hold removed. Retention expiry was recalculated." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirectWithParams("/knowledge", { error: error instanceof Error ? error.message : "Unable to update legal hold." });
  }
}

export async function retireKnowledgeDocumentAction(formData: FormData) {
  const documentId = text(formData, "documentId");
  const reason = text(formData, "reason") || "Retention period reached.";

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams("/knowledge", { message: "Demo document retirement staged. Live retirement is enabled when demo mode is disabled." });
  }

  try {
    if (!documentId) {
      throw new Error("Document id is required.");
    }

    const { user, membership, supabase } = await liveKnowledgeContext();
    const { data: document, error: documentError } = await supabase
      .schema("staffer")
      .from("documents")
      .select("id, title, retention_until, legal_hold")
      .eq("organisation_id", membership.organisation_id)
      .eq("id", documentId)
      .maybeSingle();

    if (documentError || !document?.id) {
      throw new Error(documentError?.message ?? "Knowledge document was not found.");
    }

    if (document.legal_hold) {
      throw new Error("This document is under legal hold and cannot be retired.");
    }

    if (document.retention_until && new Date(String(document.retention_until)) > new Date()) {
      throw new Error("This document has not reached its retention date yet.");
    }

    const { error } = await supabase
      .schema("staffer")
      .from("documents")
      .update({ status: "retired", updated_at: new Date().toISOString() })
      .eq("id", document.id)
      .eq("organisation_id", membership.organisation_id);

    if (error) {
      throw new Error(error.message);
    }

    await recordAuditEvent({
      organisationId: membership.organisation_id,
      actorType: "user",
      actorId: user.id,
      eventType: "knowledge.document_retired",
      entityType: "document",
      entityId: document.id,
      summary: "Knowledge document was retired from retrieval.",
      details: {
        documentId: document.id,
        reason,
      },
    });

    revalidatePath("/knowledge");
    redirectWithParams("/knowledge", { message: "Document retired from retrieval. Its audit history and metadata remain available." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirectWithParams("/knowledge", { error: error instanceof Error ? error.message : "Unable to retire knowledge document." });
  }
}
