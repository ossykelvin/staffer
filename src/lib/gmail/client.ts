import "server-only";

import { getEmailEnv, getGmailEnv } from "@/lib/env";

type JsonRecord = Record<string, unknown>;

export type GmailMessageSummary = {
  id: string;
  threadId: string | null;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  textBody: string;
};

export type GmailDraftResult = {
  id: string;
  messageId: string | null;
  threadId: string | null;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function headerValue(message: JsonRecord, name: string) {
  const payload = asRecord(message.payload);
  const headers = asArray(payload.headers).map((header) => asRecord(header));
  const found = headers.find((header) => asString(header.name).toLowerCase() === name.toLowerCase());
  return asString(found?.value);
}

function extractTextFromPart(part: JsonRecord): string {
  const mimeType = asString(part.mimeType);
  const body = asRecord(part.body);
  const data = asString(body.data);

  if (mimeType === "text/plain" && data) {
    return base64UrlDecode(data);
  }

  const nested = asArray(part.parts)
    .map((item) => extractTextFromPart(asRecord(item)))
    .filter(Boolean)
    .join("\n\n");
  if (nested) {
    return nested;
  }

  return mimeType === "text/html" && data ? base64UrlDecode(data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
}

function requireGmailEnv() {
  const env = getGmailEnv();
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN) {
    throw new Error("Gmail integration is not configured. Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN.");
  }

  return {
    clientId: env.GMAIL_CLIENT_ID,
    clientSecret: env.GMAIL_CLIENT_SECRET,
    refreshToken: env.GMAIL_REFRESH_TOKEN,
    userId: env.GMAIL_SUPPORT_USER_ID ?? "me",
  };
}

async function getGmailAccessToken() {
  const env = requireGmailEnv();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      refresh_token: env.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as JsonRecord;
  if (!response.ok || typeof payload.access_token !== "string") {
    throw new Error(asString(payload.error_description) || asString(payload.error) || "Gmail access token refresh failed.");
  }

  return { accessToken: payload.access_token, userId: env.userId };
}

async function gmailFetch(path: string, init: RequestInit = {}) {
  const { accessToken, userId } = await getGmailAccessToken();
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userId)}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    throw new Error(asString(asRecord(payload.error).message) || `Gmail API request failed with status ${response.status}.`);
  }

  return payload;
}

export async function readGmailMessage(messageId: string): Promise<GmailMessageSummary> {
  const message = await gmailFetch(`/messages/${encodeURIComponent(messageId)}?format=full`);
  const payload = asRecord(message.payload);
  const textBody = extractTextFromPart(payload);

  return {
    id: asString(message.id) || messageId,
    threadId: asString(message.threadId) || null,
    subject: headerValue(message, "subject") || "(no subject)",
    from: headerValue(message, "from"),
    to: headerValue(message, "to"),
    date: headerValue(message, "date"),
    snippet: asString(message.snippet),
    textBody: textBody || asString(message.snippet),
  };
}

export async function createGmailDraft(input: {
  to: string;
  subject: string;
  textBody: string;
  threadId?: string | null;
  inReplyTo?: string | null;
}): Promise<GmailDraftResult> {
  const emailEnv = getEmailEnv();
  const fromEmail = emailEnv.EMAIL_DEFAULT_FROM_EMAIL;
  if (!fromEmail) {
    throw new Error("EMAIL_DEFAULT_FROM_EMAIL is required before Staffer can create a Gmail draft.");
  }

  const headers = [
    `From: ${emailEnv.EMAIL_DEFAULT_FROM_NAME ? `${emailEnv.EMAIL_DEFAULT_FROM_NAME} <${fromEmail}>` : fromEmail}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    input.inReplyTo ? `In-Reply-To: ${input.inReplyTo}` : "",
    "",
    input.textBody,
  ].filter((line, index, all) => line || index >= all.length - 2);

  const draft = await gmailFetch("/drafts", {
    method: "POST",
    body: JSON.stringify({
      message: {
        raw: base64UrlEncode(headers.join("\r\n")),
        ...(input.threadId ? { threadId: input.threadId } : {}),
      },
    }),
  });
  const message = asRecord(draft.message);

  return {
    id: asString(draft.id),
    messageId: asString(message.id) || null,
    threadId: asString(message.threadId) || input.threadId || null,
  };
}

export function parseGmailAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim();
}

export function getConfiguredGmailWebhookToken() {
  return getGmailEnv().GMAIL_WEBHOOK_TOKEN ?? "";
}
