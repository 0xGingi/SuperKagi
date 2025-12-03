import { env } from "@/lib/env";

type CacheKey = string;
type CacheEntry = { data: { models: any[]; raw: any }; fetchedAt: number };

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const openrouterModelCache = new Map<CacheKey, CacheEntry>();

function cacheKey(apiKey: string) {
  return `${apiKey || "none"}`;
}

function buildHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": env.appOrigin,
    "X-Title": "SuperKagi",
  };
}

export async function fetchOpenrouterModels(apiKey?: string) {
  const key = apiKey?.trim() || env.openrouterApiKey;

  if (!key) {
    throw new Error("Missing OpenRouter API key");
  }

  const cacheToken = cacheKey(key);
  const cached = openrouterModelCache.get(cacheToken);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = "https://openrouter.ai/api/v1/models";
  const resp = await fetch(url, {
    headers: buildHeaders(key),
    cache: "no-store",
  });

  const text = await resp.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!resp.ok) {
    throw new Error(
      `OpenRouter model fetch failed (${resp.status}): ${JSON.stringify(data)}`,
    );
  }

  const models = Array.isArray(data?.data) ? data.data : [];
  const payload = { models, raw: data };
  openrouterModelCache.set(cacheToken, {
    data: payload,
    fetchedAt: Date.now(),
  });
  return payload;
}

export async function findOpenrouterModel(modelId: string, apiKey?: string) {
  if (!modelId) return null;
  const { models } = await fetchOpenrouterModels(apiKey);
  const target = modelId.toLowerCase();
  return (
    models.find(
      (m: any) =>
        m?.id?.toLowerCase() === target ||
        m?.model?.toLowerCase() === target ||
        m?.name?.toLowerCase() === target ||
        m?.canonical_slug?.toLowerCase() === target,
    ) || null
  );
}

export async function getOpenrouterPricing(modelId: string, apiKey?: string) {
  const model = await findOpenrouterModel(modelId, apiKey);
  return model?.pricing || null;
}
