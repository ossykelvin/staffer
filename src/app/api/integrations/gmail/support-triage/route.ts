import { NextResponse } from "next/server";
import { getConfiguredGmailWebhookToken } from "@/lib/gmail/client";
import { ingestGmailSupportMessage } from "@/lib/gmail/support-triage";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function decodePubSubData(value: string) {
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as JsonRecord;
  } catch {
    return {};
  }
}

function requestToken(request: Request, url: URL) {
  return request.headers.get("x-staffer-gmail-token")?.trim() || url.searchParams.get("token")?.trim() || "";
}

export async function POST(request: Request) {
  const configuredToken = getConfiguredGmailWebhookToken();
  const url = new URL(request.url);
  if (!configuredToken) {
    return NextResponse.json({ error: "Gmail webhook token is not configured." }, { status: 503 });
  }
  if (requestToken(request, url) !== configuredToken) {
    return NextResponse.json({ error: "Invalid Gmail webhook token." }, { status: 401 });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service client is not configured for Gmail ingestion." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as JsonRecord;
  const pubSubMessage = asRecord(body.message);
  const pubSubData = asString(pubSubMessage.data) ? decodePubSubData(asString(pubSubMessage.data)) : {};
  const attributes = asRecord(pubSubMessage.attributes);

  const organisationId = asString(body.organisationId) || url.searchParams.get("organisationId") || asString(attributes.organisationId);
  if (!organisationId) {
    return NextResponse.json({ error: "organisationId is required for tenant-scoped Gmail ingestion." }, { status: 400 });
  }

  const messageId = asString(body.messageId) || asString(body.gmailMessageId) || asString(attributes.gmailMessageId);
  const historyId = asString(body.historyId) || asString(pubSubData.historyId) || asString(attributes.historyId);
  const emailAddress = asString(pubSubData.emailAddress) || asString(body.emailAddress) || asString(attributes.emailAddress);
  const sourceEventId = asString(pubSubMessage.messageId) || asString(body.sourceEventId) || (messageId ? `gmail-message:${messageId}` : historyId ? `gmail-history:${historyId}` : "");

  if (!messageId) {
    if (!historyId) {
      return NextResponse.json({ error: "A Gmail messageId or Pub/Sub historyId is required." }, { status: 400 });
    }

    await supabase.schema("staffer").from("gmail_ingestion_events").upsert(
      {
        organisation_id: organisationId,
        gmail_history_id: historyId,
        source_event_id: sourceEventId || `gmail-history:${historyId}`,
        status: "queued",
        event_payload: {
          source: "gmail_pubsub",
          historyId,
          emailAddress,
          note: "Gmail Pub/Sub provides a history id. Resolve to message ids before processing support triage.",
        },
      },
      { onConflict: "organisation_id,source_event_id" },
    );

    return NextResponse.json({
      status: "queued",
      historyId,
      message: "Gmail history event recorded. A messageId is required before Staffer can create a Support Triage case.",
    });
  }

  const result = await ingestGmailSupportMessage({
    supabase,
    organisationId,
    messageId,
    sourceEventId: sourceEventId || `gmail-message:${messageId}`,
  });

  return NextResponse.json({
    status: result.status,
    taskId: result.taskId,
    supportCaseId: result.supportCaseId,
    approvalId: result.approvalId ?? null,
  });
}
