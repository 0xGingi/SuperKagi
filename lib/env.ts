import { z } from "zod";

export type Provider = "local" | "openrouter" | "nanogpt";

const envSchema = z.object({
  APP_PROVIDER: z.enum(["local", "openrouter", "nanogpt"]).optional(),
  MODEL_LOCAL: z.string().optional(),
  MODEL_OPENROUTER: z.string().optional(),
  MODEL_NANOGPT: z.string().optional(),
  IMAGE_MODEL_NANOGPT: z.string().optional(),
  LOCAL_URL: z.string().optional(),
  SYSTEM_PROMPT: z.string().optional(),
  DEEP_SEARCH: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  NANOGPT_API_KEY: z.string().optional(),
  NANOGPT_BASE_URL: z.string().optional(),
  KAGI_API_KEY: z.string().optional(),
  KAGI_SUMMARIZER_ENGINE: z.string().optional(),
  APP_ORIGIN: z.string().optional(),
});

const parsed = envSchema.parse(process.env);

const provider: Provider =
  parsed.APP_PROVIDER === "openrouter" || parsed.APP_PROVIDER === "nanogpt"
    ? parsed.APP_PROVIDER
    : "local";
const modelLocal = parsed.MODEL_LOCAL || "llama3";
const modelOpenrouter = parsed.MODEL_OPENROUTER || "openrouter/auto";
const modelNanogpt = parsed.MODEL_NANOGPT || "moonshotai/kimi-k2-thinking";
const localUrl =
  parsed.LOCAL_URL || "http://host.docker.internal:11434/api/chat";
const systemPrompt = parsed.SYSTEM_PROMPT || "";
const deepSearch = parsed.DEEP_SEARCH
  ? /^1|true|yes$/i.test(parsed.DEEP_SEARCH)
  : false;
const openrouterApiKey = parsed.OPENROUTER_API_KEY || "";
const nanogptApiKey = parsed.NANOGPT_API_KEY || "";
const nanogptBaseUrl = parsed.NANOGPT_BASE_URL || "https://nano-gpt.com/v1";
const imageModelNanogpt = parsed.IMAGE_MODEL_NANOGPT || "chroma";
const kagiApiKey = parsed.KAGI_API_KEY || "";
const kagiEngine = parsed.KAGI_SUMMARIZER_ENGINE || "cecil";
const appOrigin = parsed.APP_ORIGIN || "http://localhost:3545";

export const serverDefaults = {
  provider,
  modelLocal,
  modelOpenrouter,
  modelNanogpt,
  imageModelNanogpt,
  hasApiKey: !!openrouterApiKey,
  hasNanoApiKey: !!nanogptApiKey,
  localUrl,
  systemPrompt,
  deepSearch,
};

export const env = {
  provider,
  modelLocal,
  modelOpenrouter,
  modelNanogpt,
  imageModelNanogpt,
  localUrl,
  systemPrompt,
  deepSearch,
  openrouterApiKey,
  nanogptApiKey,
  nanogptBaseUrl,
  kagiApiKey,
  kagiEngine,
  appOrigin,
};

export type NormalizedChatConfig = {
  provider: Provider;
  model: string;
  apiKey?: string;
  localUrl: string;
  systemPrompt: string;
  nanoBaseUrl?: string;
};

export function resolveProvider(value?: string): Provider {
  if (value === "openrouter" || value === "nanogpt") return value;
  return "local";
}

export function withDefaults(
  input: Partial<NormalizedChatConfig & { provider: Provider | string }>,
): NormalizedChatConfig {
  const provider = resolveProvider(input.provider as Provider);
  let model = input.model;
  if (!model) {
    model =
      provider === "openrouter"
        ? env.modelOpenrouter
        : provider === "nanogpt"
          ? env.modelNanogpt
          : env.modelLocal;
  }

  return {
    provider,
    model,
    apiKey:
      provider === "openrouter"
        ? input.apiKey || env.openrouterApiKey
        : provider === "nanogpt"
          ? input.apiKey || env.nanogptApiKey
          : undefined,
    localUrl: input.localUrl || env.localUrl,
    nanoBaseUrl: env.nanogptBaseUrl,
    systemPrompt:
      typeof input.systemPrompt === "string"
        ? input.systemPrompt
        : env.systemPrompt,
  };
}
