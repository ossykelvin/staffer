"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/audit";
import { getCurrentMembership, getCurrentUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
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

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "knowledge";
}

function contentHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function chunkText(content: string, maxLength = 1_200) {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs.length ? paragraphs : [content.trim()]) {
    if ((current + "\n\n" + paragraph).trim().length > maxLength && current.trim()) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = [current, paragraph].filter(Boolean).join("\n\n");
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

function parseAgentKeys(value: string) {
  return value
    .split(",")
    .map((item) => slugify(item))
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

export async function ingestKnowledgeDocumentAction(formData: FormData) {
  const collectionName = text(formData, "collectionName");
  const collectionKey = slugify(text(formData, "collectionKey") || collectionName);
  const title = text(formData, "title");
  const sourceUrl = text(formData, "sourceUrl");
  const sensitivity = text(formData, "sensitivity") || "internal";
  const accessMode = text(formData, "accessMode") === "restricted" ? "restricted" : "organisation";
  const content = text(formData, "content");
  const agentKeys = parseAgentKeys(text(formData, "agentKeys"));
  const reviewDays = Number(text(formData, "reviewIntervalDays") || "90");
  const retentionDays = Number(text(formData, "retentionDays") || "365");
  const legalHold = text(formData, "legalHold") === "on";

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams("/knowledge", { message: "Demo knowledge ingestion staged. Live ingestion is enabled when demo mode is disabled." });
  }

  try {
    if (!collectionName || !collectionKey || !title || !content) {
      throw new Error("Collection name, document title and source text are required.");
    }

    const user = await getCurrentUser();
    const membership = await getCurrentMembership();
    const supabase = await getSupabaseServerClient();

    if (!user || !membership?.organisation_id || !supabase) {
      throw new Error("Knowledge ingestion requires an authenticated organisation member.");
    }

    const hash = contentHash(content);
    const now = new Date().toISOString();
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
          retention_days: Number.isFinite(retentionDays) ? retentionDays : 365,
          review_interval_days: Number.isFinite(reviewDays) ? reviewDays : 90,
          metadata: { createdFrom: "knowledge_hub" },
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
        organisation_id: membership.organisation_id,
        collection_id: collection.id,
        title,
        source_type: "manual_text",
        source_url: sourceUrl || null,
        mime_type: "text/plain",
        sensitivity,
        metadata: { ingestionMode: "manual_text", collectionKey },
        status: "approved",
        version: 1,
        content_hash: hash,
        extracted_text: content,
        extraction_status: "completed",
        scan_status: "not_required",
        embedding_status: "queued",
        review_due_at: futureDateFromDays(Number.isFinite(reviewDays) ? reviewDays : 90),
        retention_until: legalHold ? null : futureDateFromDays(Number.isFinite(retentionDays) ? retentionDays : 365),
        legal_hold: legalHold,
        reviewed_at: now,
        reviewed_by: user.id,
        created_by: user.id,
        updated_at: now,
      })
      .select("id")
      .single();

    if (documentError || !document?.id) {
      throw new Error(documentError?.message ?? "Unable to store knowledge document.");
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
        content_hash: hash,
        extracted_text: content,
        metadata: { ingestionMode: "manual_text" },
        created_by: user.id,
      })
      .select("id")
      .single();

    if (versionError || !version?.id) {
      throw new Error(versionError?.message ?? "Unable to store document version.");
    }

    const chunks = chunkText(content);
    const chunkRows = chunks.map((chunk, index) => ({
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
      metadata: { contentHash: hash, sourceType: "manual_text" },
      embedding_status: "queued",
    }));
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
