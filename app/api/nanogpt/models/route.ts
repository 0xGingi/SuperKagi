import { NextResponse } from "next/server";
import { env } from "@/lib/env";

type CacheKey = string;
type CacheEntry = { data: any; fetchedAt: number };
const CACHE_TTL_MS = 5 * 60 * 1000;
const nanoModelCache = new Map<CacheKey, CacheEntry>();

function cacheKey(apiKey: string, detailed: boolean) {
  return `${apiKey || "none"}::${detailed ? "detailed" : "basic"}`;
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

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing NanoGPT API key" },
      { status: 400 },
    );
  }

  const url = buildModelsUrl() + (detailed ? "?detailed=true" : "");
  const key = cacheKey(apiKey, detailed);

  const cached = nanoModelCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const resp = await fetch(url, {
      headers: { "x-api-key": apiKey },
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

    const models = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray((data as any)?.models)
          ? (data as any).models
          : [];

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
