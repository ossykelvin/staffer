import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const blankAsUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};
const optionalString = z.preprocess(blankAsUndefined, nonEmptyString.optional());
const optionalUrl = z.preprocess(blankAsUndefined, z.string().url().optional());
const optionalEmail = z.preprocess(blankAsUndefined, z.string().email().optional());
const positiveIntegerWithDefault = (defaultValue: number) =>
  z.preprocess(blankAsUndefined, z.coerce.number().int().positive().default(defaultValue));
const nonNegativeNumberWithDefault = (defaultValue: number) =>
  z.preprocess(blankAsUndefined, z.coerce.number().min(0).default(defaultValue));
const ratioWithDefault = (defaultValue: number) =>
  z.preprocess(blankAsUndefined, z.coerce.number().min(0).max(1).default(defaultValue));

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: nonEmptyString,
  NEXT_PUBLIC_COMPANY_NAME: nonEmptyString,
  NEXT_PUBLIC_APP_TAGLINE: nonEmptyString,
  NEXT_PUBLIC_PRIMARY_COLOR: nonEmptyString,
  NEXT_PUBLIC_SECONDARY_COLOR: nonEmptyString,
  NEXT_PUBLIC_ACCENT_COLOR: nonEmptyString,
  NEXT_PUBLIC_DEMO_MODE: z.enum(["true", "false"]),
  NEXT_PUBLIC_APP_URL: optionalUrl,
});

export const publicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_COMPANY_NAME: process.env.NEXT_PUBLIC_COMPANY_NAME,
  NEXT_PUBLIC_APP_TAGLINE: process.env.NEXT_PUBLIC_APP_TAGLINE,
  NEXT_PUBLIC_PRIMARY_COLOR: process.env.NEXT_PUBLIC_PRIMARY_COLOR,
  NEXT_PUBLIC_SECONDARY_COLOR: process.env.NEXT_PUBLIC_SECONDARY_COLOR,
  NEXT_PUBLIC_ACCENT_COLOR: process.env.NEXT_PUBLIC_ACCENT_COLOR,
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

const aiProviderSchema = z.enum(["google", "openrouter"]);

export const aiEnvSchema = z
  .object({
    NEXT_PUBLIC_DEMO_MODE: z.enum(["true", "false"]).optional(),
    AI_PRIMARY_PROVIDER: aiProviderSchema,
    AI_FALLBACK_PROVIDER: aiProviderSchema,
    AI_PRIMARY_MODEL: nonEmptyString,
    AI_FALLBACK_MODEL: nonEmptyString,
    GOOGLE_GENERATIVE_AI_API_KEY: optionalString,
    OPENROUTER_API_KEY: optionalString,
    OPENROUTER_BASE_URL: optionalUrl,
    OPENROUTER_PROVIDER_NAME: optionalString,
    AI_DEFAULT_MAX_STEPS: positiveIntegerWithDefault(8),
    AI_DEFAULT_TIMEOUT_MS: positiveIntegerWithDefault(30_000),
    AI_DEFAULT_MAX_OUTPUT_TOKENS: positiveIntegerWithDefault(1_200),
    AI_CONFIDENCE_THRESHOLD: ratioWithDefault(0.75),
    AI_MAX_COST_PER_RUN_USD: nonNegativeNumberWithDefault(1),
    AI_COST_PER_1K_INPUT_TOKENS_USD: nonNegativeNumberWithDefault(0),
    AI_COST_PER_1K_OUTPUT_TOKENS_USD: nonNegativeNumberWithDefault(0),
  })
  .superRefine((env, ctx) => {
    if (env.NEXT_PUBLIC_DEMO_MODE === "true") {
      return;
    }

    const configuredProviders = new Set([env.AI_PRIMARY_PROVIDER, env.AI_FALLBACK_PROVIDER]);

    if (configuredProviders.has("google") && !env.GOOGLE_GENERATIVE_AI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_GENERATIVE_AI_API_KEY"],
        message: "Google is configured as an AI provider, but GOOGLE_GENERATIVE_AI_API_KEY is missing.",
      });
    }

    if (configuredProviders.has("openrouter")) {
      if (!env.OPENROUTER_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["OPENROUTER_API_KEY"],
          message: "OpenRouter is configured as an AI provider, but OPENROUTER_API_KEY is missing.",
        });
      }

      if (!env.OPENROUTER_BASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["OPENROUTER_BASE_URL"],
          message: "OpenRouter is configured as an AI provider, but OPENROUTER_BASE_URL is missing.",
        });
      }

      if (!env.OPENROUTER_PROVIDER_NAME) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["OPENROUTER_PROVIDER_NAME"],
          message: "OpenRouter is configured as an AI provider, but OPENROUTER_PROVIDER_NAME is missing.",
        });
      }
    }
  });

export type AiProvider = z.infer<typeof aiProviderSchema>;

export function getAiEnv(environment: NodeJS.ProcessEnv = process.env) {
  return aiEnvSchema.parse(environment);
}

export const supabaseEnvSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString,
    SUPABASE_SECRET_KEY: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.NEXT_PUBLIC_SUPABASE_URL && !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
        message: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required when NEXT_PUBLIC_SUPABASE_URL is set.",
      });
    }

    if (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !env.NEXT_PUBLIC_SUPABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NEXT_PUBLIC_SUPABASE_URL"],
        message: "NEXT_PUBLIC_SUPABASE_URL is required when NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is set.",
      });
    }
  });

export function getSupabaseEnv(environment: NodeJS.ProcessEnv = process.env) {
  return supabaseEnvSchema.parse(environment);
}

export const governanceEnvSchema = z.object({
  INTEGRATION_ENCRYPTION_KEY: optionalString,
});

export function getGovernanceEnv(environment: NodeJS.ProcessEnv = process.env) {
  return governanceEnvSchema.parse(environment);
}

const normalizeProviderValue = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  const unquoted = trimmed.match(/^["'](.+)["']$/)?.[1] ?? trimmed;

  return unquoted.trim().toLowerCase();
};

const emailProviderSchema = z.preprocess(normalizeProviderValue, z.enum(["brevo"]));

export const emailEnvSchema = z
  .object({
    NEXT_PUBLIC_DEMO_MODE: z.enum(["true", "false"]).optional(),
    EMAIL_PROVIDER: emailProviderSchema.default("brevo"),
    EMAIL_DEFAULT_FROM_EMAIL: optionalEmail,
    EMAIL_DEFAULT_FROM_NAME: optionalString,
    EMAIL_REPLY_TO_EMAIL: optionalEmail,
    BREVO_API_KEY: optionalString,
    BREVO_SMTP_HOST: optionalString,
    BREVO_SMTP_PORT: positiveIntegerWithDefault(587),
    BREVO_SMTP_USER: optionalString,
    BREVO_SMTP_PASSWORD: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.NEXT_PUBLIC_DEMO_MODE === "true") {
      return;
    }

    if (env.EMAIL_PROVIDER === "brevo" && !env.BREVO_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BREVO_API_KEY"],
        message: "Brevo is configured as the email provider, but BREVO_API_KEY is missing.",
      });
    }

    if (!env.EMAIL_DEFAULT_FROM_EMAIL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["EMAIL_DEFAULT_FROM_EMAIL"],
        message: "EMAIL_DEFAULT_FROM_EMAIL is required before live email can be sent.",
      });
    }
  });

export type EmailProvider = z.infer<typeof emailProviderSchema>;

export function getEmailEnv(environment: NodeJS.ProcessEnv = process.env) {
  return emailEnvSchema.parse(environment);
}

export const gmailEnvSchema = z
  .object({
    NEXT_PUBLIC_DEMO_MODE: z.enum(["true", "false"]).optional(),
    GMAIL_CLIENT_ID: optionalString,
    GMAIL_CLIENT_SECRET: optionalString,
    GMAIL_REFRESH_TOKEN: optionalString,
    GMAIL_SUPPORT_USER_ID: optionalString,
    GMAIL_WEBHOOK_TOKEN: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.NEXT_PUBLIC_DEMO_MODE === "true") {
      return;
    }

    const configured = Boolean(env.GMAIL_CLIENT_ID || env.GMAIL_CLIENT_SECRET || env.GMAIL_REFRESH_TOKEN);
    if (!configured) {
      return;
    }

    for (const key of ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when Gmail integration is configured.`,
        });
      }
    }
  });

export function getGmailEnv(environment: NodeJS.ProcessEnv = process.env) {
  return gmailEnvSchema.parse(environment);
}

export const githubIssueEnvSchema = z.object({
  GITHUB_API_BASE_URL: optionalUrl,
  GITHUB_ISSUE_TOKEN: optionalString,
  GITHUB_ISSUE_USER_AGENT: optionalString,
});

export function getGitHubIssueEnv(environment: NodeJS.ProcessEnv = process.env) {
  return githubIssueEnvSchema.parse(environment);
}
