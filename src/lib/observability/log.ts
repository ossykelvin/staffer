import "server-only";

type StructuredLogLevel = "info" | "warning" | "error";

export function maskEmail(value: string) {
  const [localPart = "", domain = ""] = value.trim().toLowerCase().split("@");
  if (!localPart || !domain) {
    return "invalid-email";
  }

  const visible = localPart.slice(0, Math.min(2, localPart.length));
  const masked = "*".repeat(Math.max(localPart.length - visible.length, 3));
  return `${visible}${masked}@${domain}`;
}

export function emailDomain(value: string) {
  const [, domain] = value.trim().toLowerCase().split("@");
  return domain || "unknown";
}

export function logStructured(level: StructuredLogLevel, msg: string, details: Record<string, unknown> = {}) {
  const payload = {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...details,
  };
  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warning") {
    console.warn(line);
    return;
  }

  console.log(line);
}
