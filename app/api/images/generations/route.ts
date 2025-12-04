import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getNanoApiBase } from "@/lib/nanogpt";
import { recordGenericCost } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type ImageGenRequest = {
  prompt: string;
  model?: string;
  n?: number;
  size?: string;
  response_format?: "url" | "b64_json";
  imageDataUrl?: string;
  guidance_scale?: number;
  num_inference_steps?: number;
  seed?: number;
  kontext_max_mode?: boolean;
  apiKey?: string;
};

type NanoGPTImageResponse = {
  created: number;
  data: Array<{ url?: string; b64_json?: string }>;
  cost?: number;
  paymentSource?: string;
  remainingBalance?: number;
};

const buildGenerateImageUrl = () =>
  `${getNanoApiBase(env.nanogptBaseUrl)}/images/generations`;

export async function POST(request: Request) {
  let body: ImageGenRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { prompt, apiKey: clientApiKey, ...options } = body;

  if (!prompt?.trim()) {
    return NextResponse.json(
      { error: "Missing required parameter: prompt" },
      { status: 400 },
    );
  }

  const apiKey = clientApiKey?.trim() || env.nanogptApiKey;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing NanoGPT API key" },
      { status: 400 },
    );
  }

  const model = options.model || env.imageModelNanogpt || "chroma";
  const url = buildGenerateImageUrl();

  const payload: Record<string, unknown> = {
    prompt: prompt.trim(),
    model,
    n: options.n || 1,
    response_format: options.response_format || "b64_json",
  };

  if (options.size) payload.size = options.size;
  if (options.imageDataUrl) payload.imageDataUrl = options.imageDataUrl;
  if (options.guidance_scale) payload.guidance_scale = options.guidance_scale;
  if (options.num_inference_steps)
    payload.num_inference_steps = options.num_inference_steps;
  if (options.seed) payload.seed = options.seed;
  if (options.kontext_max_mode !== undefined)
    payload.kontext_max_mode = options.kontext_max_mode;

  try {
    console.log("[ImageGen] Calling NanoGPT:", url, {
      model,
      prompt: `${prompt.slice(0, 50)}...`,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const text = await response.text();
    let data: NanoGPTImageResponse;

    try {
      data = JSON.parse(text);
    } catch {
      console.error("[ImageGen] Failed to parse response:", text.slice(0, 500));
      return NextResponse.json(
        { error: "Invalid response from NanoGPT", details: text.slice(0, 500) },
        { status: 502 },
      );
    }

    if (!response.ok) {
      console.error("[ImageGen] NanoGPT error:", response.status, data);
      return NextResponse.json(
        {
          error: "NanoGPT image generation failed",
          status: response.status,
          details: data,
        },
        { status: response.status },
      );
    }

    if (!data.data || data.data.length === 0) {
      return NextResponse.json(
        { error: "No image returned from NanoGPT", details: data },
        { status: 502 },
      );
    }

    const images = data.data.map((img) => {
      if (img.url) {
        return { url: img.url };
      }
      if (img.b64_json) {
        return { url: `data:image/png;base64,${img.b64_json}` };
      }
      return { url: "" };
    });

    console.log(
      "[ImageGen] Success, cost:",
      data.cost,
      "remaining balance:",
      data.remainingBalance,
    );

    if (typeof data.cost === "number") {
      try {
        recordGenericCost({
          provider: "nanogpt",
          model,
          cost: data.cost,
          currency: "USD",
          metadata: { type: "image" },
        });
      } catch (err) {
        console.warn("[ImageGen] failed to record cost", err);
      }
    }

    return NextResponse.json({
      images,
      model,
      cost: data.cost,
      remainingBalance: data.remainingBalance,
    });
  } catch (error) {
    console.error("[ImageGen] Request failed:", error);
    return NextResponse.json(
      { error: "Request to NanoGPT failed", details: (error as Error).message },
      { status: 502 },
    );
  }
}
