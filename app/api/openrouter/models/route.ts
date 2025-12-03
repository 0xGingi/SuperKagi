import { NextResponse } from "next/server";
import { env } from "@/lib/env";

type CacheKey = string;
type CacheEntry = { data: any; fetchedAt: number };
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const openrouterModelCache = new Map<CacheKey, CacheEntry>();

function cacheKey(apiKey: string) {
  return `${apiKey || "none"}`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const apiKey = (body.apiKey as string | undefined)?.trim() || env.openrouterApiKey;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OpenRouter API key" },
      { status: 400 },
    );
  }

  const url = "https://openrouter.ai/api/v1/models";
  const key = cacheKey(apiKey);

  const cached = openrouterModelCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": env.appOrigin,
        "X-Title": "SuperKagi",
      },
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
          error: "OpenRouter model fetch failed",
          status: resp.status,
          body: data,
        },
        { status: resp.status },
      );
    }

    // OpenRouter returns { data: [...] } format
    const models = Array.isArray(data?.data) ? data.data : [];

    const payload = { models, raw: data };
    openrouterModelCache.set(key, { data: payload, fetchedAt: Date.now() });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: "Request to OpenRouter failed", details: (error as Error).message },
      { status: 502 },
    );
  }
}