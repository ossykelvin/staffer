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
    AI_PRIMARY_PROVIDER: aiProviderSchema,
    AI_FALLBACK_PROVIDER: aiProviderSchema,
    AI_PRIMARY_MODEL: nonEmptyString,
    AI_FALLBACK_MODEL: nonEmptyString,
    GOOGLE_GENERATIVE_AI_API_KEY: optionalString,
    OPENROUTER_API_KEY: optionalString,
    OPENROUTER_BASE_URL: optionalUrl,
    OPENROUTER_PROVIDER_NAME: optionalString,
    AI_DEFAULT_MAX_STEPS: z.coerce.number().int().positive(),
    AI_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1),
  })
  .superRefine((env, ctx) => {
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
