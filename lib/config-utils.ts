import type { Provider, UiConfig } from "@/types/chat";

export const defaultModels = {
  local: "llama3",
  openrouter: "openrouter/auto",
  nanogpt: "moonshotai/kimi-k2-thinking",
};
export const defaultImageModel = "chroma";

export const fallbackDefaults = {
  provider: "local" as Provider,
  modelLocal: defaultModels.local,
  modelOpenrouter: defaultModels.openrouter,
  modelNanogpt: defaultModels.nanogpt,
  imageModelNanogpt: defaultImageModel,
  hasApiKey: false,
  hasNanoApiKey: false,
  localUrl: "http://host.docker.internal:11434/api/chat",
  systemPrompt: "",
  deepSearch: false,
};

export const defaultImageResolutions = [
  "256x256",
  "512x512",
  "768x1024",
  "576x1024",
  "1024x768",
  "1024x576",
  "1024x1024",
  "1920x1088",
  "1088x1920",
  "1408x1024",
  "1024x1408",
  "2048x2048",
];

export const deepSearchPrompt =
  "\nUse web search/browsing MCP tools to gather and verify up-to-date information. Prefer calling tools to fetch pages; summarize with concise bullet points and include source names.";

export const initialConfig: UiConfig = {
  provider: fallbackDefaults.provider,
  model:
    fallbackDefaults.provider === "openrouter"
      ? fallbackDefaults.modelOpenrouter
      : fallbackDefaults.modelLocal,
  models: {
    local: fallbackDefaults.modelLocal,
    openrouter: fallbackDefaults.modelOpenrouter,
    nanogpt: fallbackDefaults.modelNanogpt,
  },
  imageModel: fallbackDefaults.imageModelNanogpt,
  imageSize: "1024x1024",
  imageSteps: 30,
  imageGuidanceScale: 7.5,
  apiKeyOpenrouter: "",
  apiKeyNanogpt: "",
  apiKey: "",
  localUrl: fallbackDefaults.localUrl,
  systemPrompt: fallbackDefaults.systemPrompt,
  deepSearch: fallbackDefaults.deepSearch,
  userSet: { models: {} },
};

export function resolveProvider(value?: string): Provider {
  if (value === "openrouter" || value === "nanogpt") return value;
  return "local";
}

export function mergeEnvDefaults(
  _current: UiConfig,
  existing: UiConfig,
  env: typeof fallbackDefaults,
): UiConfig {
  const base = { ...initialConfig, ...existing } as UiConfig;
  if (!base.apiKeyOpenrouter && (existing as any).apiKey) {
    base.apiKeyOpenrouter = (existing as any).apiKey;
  }
  if (!base.apiKeyNanogpt && (existing as any).apiKey) {
    base.apiKeyNanogpt = (existing as any).apiKey;
  }
  const envModels = {
    local: env.modelLocal || fallbackDefaults.modelLocal,
    openrouter: env.modelOpenrouter || fallbackDefaults.modelOpenrouter,
    nanogpt: env.modelNanogpt || fallbackDefaults.modelNanogpt,
  };

  const userSet = base.userSet || { models: {} };
  if (!userSet.models) userSet.models = {};

  const models = { ...envModels };
  if (existing.models?.local && userSet.models.local)
    models.local = existing.models.local;
  if (existing.models?.openrouter && userSet.models.openrouter)
    models.openrouter = existing.models.openrouter;
  if (existing.models?.nanogpt && userSet.models.nanogpt)
    models.nanogpt = existing.models.nanogpt;

  const provider = resolveProvider(existing.provider || env.provider);
  const model =
    existing.model ||
    models[provider as keyof typeof models] ||
    (provider === "openrouter"
      ? models.openrouter
      : provider === "nanogpt"
        ? models.nanogpt
        : models.local);

  return {
    ...base,
    models,
    provider,
    model,
    imageModel:
      existing.imageModel || env.imageModelNanogpt || defaultImageModel,
    imageSize: existing.imageSize || "1024x1024",
    imageSteps: existing.imageSteps || 30,
    imageGuidanceScale: existing.imageGuidanceScale || 7.5,
    imageSeed: existing.imageSeed,
    localUrl: existing.localUrl || env.localUrl,
    systemPrompt: existing.systemPrompt ?? env.systemPrompt,
    deepSearch:
      typeof existing.deepSearch === "boolean"
        ? existing.deepSearch
        : env.deepSearch,
    userSet,
  };
}
