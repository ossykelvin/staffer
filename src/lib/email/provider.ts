import "server-only";

import { z } from "zod";
import { publicEnv, getEmailEnv } from "@/lib/env";

const emailAddressSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).optional(),
});

export const transactionalEmailInputSchema = z.object({
  to: z.array(emailAddressSchema).min(1),
  subject: z.string().trim().min(1),
  textContent: z.string().trim().min(1),
  htmlContent: z.string().trim().min(1).optional(),
  replyTo: emailAddressSchema.optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export type TransactionalEmailInput = z.infer<typeof transactionalEmailInputSchema>;

export type TransactionalEmailResult = {
  provider: "brevo";
  mode: "demo" | "live";
  messageId?: string;
};

function getDefaultSender() {
  const env = getEmailEnv();

  if (!env.EMAIL_DEFAULT_FROM_EMAIL) {
    throw new Error("EMAIL_DEFAULT_FROM_EMAIL is required before live email can be sent.");
  }

  return {
    email: env.EMAIL_DEFAULT_FROM_EMAIL,
    name: env.EMAIL_DEFAULT_FROM_NAME || undefined,
  };
}

function textToHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export async function sendTransactionalEmail(input: TransactionalEmailInput): Promise<TransactionalEmailResult> {
  const parsed = transactionalEmailInputSchema.parse(input);

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    return {
      provider: "brevo",
      mode: "demo",
      messageId: `demo-${Date.now()}`,
    };
  }

  const env = getEmailEnv();
  if (!env.BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY is required before live email can be sent.");
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": env.BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: getDefaultSender(),
      to: parsed.to,
      replyTo: parsed.replyTo ?? (env.EMAIL_REPLY_TO_EMAIL ? { email: env.EMAIL_REPLY_TO_EMAIL } : undefined),
      subject: parsed.subject,
      textContent: parsed.textContent,
      htmlContent: parsed.htmlContent ?? textToHtml(parsed.textContent),
      tags: parsed.tags,
      params: parsed.params,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as { messageId?: string; message?: string; code?: string };

  if (!response.ok) {
    throw new Error(payload.message || payload.code || `Brevo email request failed with status ${response.status}.`);
  }

  return {
    provider: "brevo",
    mode: "live",
    messageId: payload.messageId,
  };
}

export function getEmailConfigurationStatus() {
  return {
    provider: process.env.EMAIL_PROVIDER || "brevo",
    apiConfigured: Boolean(process.env.BREVO_API_KEY),
    smtpConfigured: Boolean(process.env.BREVO_SMTP_HOST && process.env.BREVO_SMTP_USER && process.env.BREVO_SMTP_PASSWORD),
    fromConfigured: Boolean(process.env.EMAIL_DEFAULT_FROM_EMAIL),
  };
}
