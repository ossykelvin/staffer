import "server-only";

import { createHash } from "node:crypto";

export const KNOWLEDGE_UPLOAD_BUCKET = "staffer-knowledge";
export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 64;
export const KNOWLEDGE_EMBEDDING_MODEL_KEY = "local-token-fingerprint-v1";

export type KnowledgeMemoryScope = "task" | "customer" | "project" | "company";

export type KnowledgeUploadScan = {
  status: "clean" | "flagged" | "failed" | "not_required";
  summary: string;
};

export function slugifyKnowledgeValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "knowledge";
}

export function contentHash(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export function chunkKnowledgeText(content: string, maxLength = 1_200) {
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

export function normaliseMemoryScope(value: string): KnowledgeMemoryScope {
  return value === "task" || value === "customer" || value === "project" || value === "company" ? value : "company";
}

export function safeKnowledgeFileName(value: string) {
  const fallback = "upload.txt";
  const trimmed = value.trim() || fallback;
  const [base, ...extensionParts] = trimmed.split(".");
  const extension = extensionParts.length ? `.${extensionParts.pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "txt"}` : "";
  const safeBase = slugifyKnowledgeValue(base || "upload").slice(0, 80);

  return `${safeBase}${extension || ".txt"}`;
}

export function isExtractableTextMime(mimeType: string, fileName: string) {
  const normalised = mimeType.toLowerCase();
  const lowerName = fileName.toLowerCase();

  return (
    normalised.startsWith("text/") ||
    normalised === "application/json" ||
    normalised === "application/xml" ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".markdown") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".json")
  );
}

export function scanKnowledgeUpload(buffer: Buffer, mimeType: string, fileName: string): KnowledgeUploadScan {
  if (!buffer.length) {
    return { status: "failed", summary: "Uploaded file was empty." };
  }

  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  if (/\.(exe|dll|bat|cmd|ps1|sh|com|scr|jar)$/i.test(lowerName)) {
    return { status: "flagged", summary: "Executable or script uploads are blocked from the knowledge base." };
  }

  const preview = buffer.subarray(0, Math.min(buffer.length, 16_384)).toString("utf8");
  if (preview.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")) {
    return { status: "flagged", summary: "Upload matched the standard antivirus test signature." };
  }

  if (lowerMime.startsWith("text/") || isExtractableTextMime(lowerMime, lowerName)) {
    const controlCharacters = [...preview].filter((char) => {
      const code = char.charCodeAt(0);
      return code < 32 && ![9, 10, 13].includes(code);
    }).length;

    if (controlCharacters > 24) {
      return { status: "flagged", summary: "Text upload contained unusual control characters and needs manual review." };
    }
  }

  return { status: "clean", summary: "Upload passed Staffer's built-in file safety checks." };
}

export function extractKnowledgeText(buffer: Buffer, mimeType: string, fileName: string) {
  if (!isExtractableTextMime(mimeType, fileName)) {
    return {
      status: "failed" as const,
      text: "",
      summary: "Automatic extraction currently supports plain text, Markdown, CSV, JSON and XML uploads. This file was retained for manual review.",
    };
  }

  const text = buffer.toString("utf8").replace(/\u0000/g, "").trim();
  if (!text) {
    return {
      status: "failed" as const,
      text: "",
      summary: "No readable text could be extracted from the upload.",
    };
  }

  return {
    status: "completed" as const,
    text,
    summary: "Text extracted from uploaded source.",
  };
}

export function createKnowledgeEmbedding(text: string, dimensions = KNOWLEDGE_EMBEDDING_DIMENSIONS) {
  const tokens = text.toLowerCase().match(/[a-z0-9][a-z0-9-]{1,}/g) ?? [];
  const vector = Array.from({ length: dimensions }, () => 0);

  for (const token of tokens.slice(0, 4_000)) {
    const digest = createHash("sha256").update(token).digest();
    const index = digest[0] % dimensions;
    const sign = digest[1] % 2 === 0 ? 1 : -1;
    vector[index] += sign * (1 + Math.log1p(token.length));
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) {
    return vector;
  }

  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}
