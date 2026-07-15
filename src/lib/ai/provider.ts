import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { AiProvider } from "@/lib/env";
import { getAiEnv } from "@/lib/env";

export function getConfiguredModels() {
  const env = getAiEnv();
  const google = env.GOOGLE_GENERATIVE_AI_API_KEY
    ? createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })
    : null;
  const openrouter =
    env.OPENROUTER_API_KEY && env.OPENROUTER_BASE_URL && env.OPENROUTER_PROVIDER_NAME
      ? createOpenAICompatible({
          name: env.OPENROUTER_PROVIDER_NAME,
          apiKey: env.OPENROUTER_API_KEY,
          baseURL: env.OPENROUTER_BASE_URL,
        })
      : null;

  const modelFor = (provider: AiProvider, modelId: string) => {
    if (provider === "google") {
      return google?.languageModel(modelId) ?? null;
    }

    return openrouter?.languageModel(modelId) ?? null;
  };

  return {
    primary: modelFor(env.AI_PRIMARY_PROVIDER, env.AI_PRIMARY_MODEL),
    fallback: modelFor(env.AI_FALLBACK_PROVIDER, env.AI_FALLBACK_MODEL),
    configuration: {
      primaryProvider: env.AI_PRIMARY_PROVIDER,
      fallbackProvider: env.AI_FALLBACK_PROVIDER,
      primaryModel: env.AI_PRIMARY_MODEL,
      fallbackModel: env.AI_FALLBACK_MODEL,
      maxSteps: env.AI_DEFAULT_MAX_STEPS,
      confidenceThreshold: env.AI_CONFIDENCE_THRESHOLD,
    },
  };
}
