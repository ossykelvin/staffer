import { existsSync, readFileSync } from "node:fs";

const files = ["src/lib/email/provider.ts", "src/lib/env.ts", "src/app/integrations/page.tsx", ".env.local.example"];

for (const file of files) {
  if (!existsSync(file)) {
    throw new Error(`Missing email delivery file: ${file}`);
  }
}

const env = readFileSync("src/lib/env.ts", "utf8");
for (const phrase of ["emailEnvSchema", "EMAIL_PROVIDER", "BREVO_API_KEY", "BREVO_SMTP_HOST", "EMAIL_DEFAULT_FROM_EMAIL", "getEmailEnv"]) {
  if (!env.includes(phrase)) {
    throw new Error(`Missing email env phrase: ${phrase}`);
  }
}

const provider = readFileSync("src/lib/email/provider.ts", "utf8");
for (const phrase of ["import \"server-only\"", "sendTransactionalEmail", "https://api.brevo.com/v3/smtp/email", "api-key", "getEmailConfigurationStatus"]) {
  if (!provider.includes(phrase)) {
    throw new Error(`Missing email provider phrase: ${phrase}`);
  }
}

const envExample = readFileSync(".env.local.example", "utf8");
for (const phrase of ["EMAIL_PROVIDER=brevo", "BREVO_API_KEY=", "BREVO_SMTP_HOST=smtp-relay.brevo.com", "BREVO_SMTP_PORT=587"]) {
  if (!envExample.includes(phrase)) {
    throw new Error(`Missing email env example phrase: ${phrase}`);
  }
}

console.log("Email delivery static verification passed.");
