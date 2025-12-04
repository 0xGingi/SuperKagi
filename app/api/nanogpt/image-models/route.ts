import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
  getNanoPaidImageModelsUrl,
  getNanoSubscriptionImageModelsUrl,
} from "@/lib/nanogpt";

type CacheKey = string;
type CacheEntry = { data: any; fetchedAt: number };
const CACHE_TTL_MS = 5 * 60 * 1000;
const nanoImageModelCache = new Map<CacheKey, CacheEntry>();

function cacheKey(
  credential: string,
  detailed: boolean,
  scope: "subscription" | "paid",
) {
  return `${scope}::${credential || "none"}::${detailed ? "detailed" : "basic"}`;
}

function extractModels(data: any, scope: "subscription" | "paid") {
  if (!data) return [];

  if (scope === "paid") {
    if (Array.isArray(data?.models)) return data.models;
    if (Array.isArray(data?.data)) return data.data;
    if (data?.models?.image && typeof data.models.image === "object") {
      return Object.values(data.models.image);
    }
    if (data?.models && typeof data.models === "object") {
      return Object.values(data.models);
    }
    if (Array.isArray(data)) return data;
  }

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray((data as any)?.models)) return (data as any).models;
  return [];
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

  const apiKey =
    (body.apiKey as string | undefined)?.trim() || env.nanogptApiKey;
  const detailed = !!body.detailed;
  const scope: "subscription" | "paid" =
    body.scope === "paid" ? "paid" : "subscription";
  const paidToken =
    (body.paidToken as string | undefined)?.trim() ||
    process.env.NANOGPT_PAID_TOKEN ||
    env.nanogptApiKey ||
    "aad912bb-8424-4d85-bdf5-beb78278d7c7";
  const requireApiKey = scope === "subscription";

  if (requireApiKey && !apiKey) {
    return NextResponse.json(
      { error: "Missing NanoGPT API key" },
      { status: 400 },
    );
  }

  const url =
    scope === "paid"
      ? getNanoPaidImageModelsUrl(detailed, env.nanogptBaseUrl)
      : getNanoSubscriptionImageModelsUrl(detailed, env.nanogptBaseUrl);

  const key = cacheKey(
    scope === "subscription" ? apiKey : paidToken,
    detailed,
    scope,
  );

  const cached = nanoImageModelCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const resp = await fetch(url, {
      headers:
        scope === "subscription"
          ? { "x-api-key": apiKey }
          : { Authorization: `Bearer ${paidToken}` },
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
          error: "NanoGPT image model fetch failed",
          status: resp.status,
          body: data,
        },
        { status: resp.status },
      );
    }

    const models = extractModels(data, scope);
    const payload = { models, raw: data };
    nanoImageModelCache.set(key, { data: payload, fetchedAt: Date.now() });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Request to NanoGPT failed",
        details: (error as Error).message,
      },
      { status: 502 },
    );
  }
}
