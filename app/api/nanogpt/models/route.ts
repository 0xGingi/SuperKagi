import { NextResponse } from "next/server";
import { env } from "@/lib/env";

type CacheKey = string;
type CacheEntry = { data: any; fetchedAt: number };
const CACHE_TTL_MS = 5 * 60 * 1000;
const nanoModelCache = new Map<CacheKey, CacheEntry>();

function cacheKey(
  apiKey: string,
  detailed: boolean,
  scope: "subscription" | "all",
) {
  return `${scope}::${apiKey || "none"}::${detailed ? "detailed" : "basic"}`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildModelsUrl() {
  const base = env.nanogptBaseUrl || "https://nano-gpt.com/v1";
  const trimmed = base.replace(/\/+$/, "");
  if (/\/api\/subscription\/v1$/i.test(trimmed)) return `${trimmed}/models`;
  const withoutV1 = trimmed.replace(/\/v1$/i, "");
  return `${withoutV1}/api/subscription/v1/models`;
}

function buildAllModelsUrl() {
  const base = env.nanogptBaseUrl || "https://nano-gpt.com/v1";
  const trimmed = base.replace(/\/+$/, "");
  const root = trimmed
    .replace(/\/api\/subscription\/v1$/i, "")
    .replace(/\/v1$/i, "");
  return `${root}/api/models/text`;
}

function extractModels(data: any, scope: "subscription" | "all") {
  if (scope === "all") {
    const textModels = data?.models?.text;
    if (textModels && typeof textModels === "object") {
      return Object.values(textModels);
    }
  }

  return Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray((data as any)?.models)
        ? (data as any).models
        : [];
}

export async function POST(request: Request) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const apiKey =
    (body.apiKey as string | undefined)?.trim() || env.nanogptApiKey;
  const detailed = !!body.detailed;
  const scope: "subscription" | "all" =
    body.scope === "all" ? "all" : "subscription";
  const requireApiKey = scope === "subscription";

  if (requireApiKey && !apiKey) {
    return NextResponse.json(
      { error: "Missing NanoGPT API key" },
      { status: 400 },
    );
  }

  const url =
    scope === "all"
      ? buildAllModelsUrl()
      : buildModelsUrl() + (detailed ? "?detailed=true" : "");
  const key = cacheKey(
    requireApiKey ? apiKey : "public",
    detailed,
    scope,
  );

  const cached = nanoModelCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const resp = await fetch(url, {
      headers: requireApiKey ? { "x-api-key": apiKey } : undefined,
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
      return NextResponse.json(
        {
          error: "NanoGPT model fetch failed",
          status: resp.status,
          body: data,
        },
        { status: resp.status },
      );
    }

    const models = extractModels(data, scope);

    const payload = { models, raw: data };
    nanoModelCache.set(key, { data: payload, fetchedAt: Date.now() });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: "Request to NanoGPT failed", details: (error as Error).message },
      { status: 502 },
    );
  }
}
