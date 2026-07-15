import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { getGovernanceEnv } from "@/lib/env";

function getEncryptionKey() {
  const { INTEGRATION_ENCRYPTION_KEY } = getGovernanceEnv();

  if (!INTEGRATION_ENCRYPTION_KEY) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY is required before live integration secrets can be stored.");
  }

  return createHash("sha256").update(INTEGRATION_ENCRYPTION_KEY).digest();
}

export function encryptIntegrationSecret(plaintext: string) {
  if (plaintext.trim().length === 0) {
    throw new Error("Secret value is required.");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    keyVersion: "v1",
  };
}
