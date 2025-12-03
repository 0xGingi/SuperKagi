import { NextResponse } from "next/server";
import { getOpenrouterPricing } from "@/lib/openrouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const modelId = (body.model || body.id || "").trim();
  const apiKey = (body.apiKey as string | undefined)?.trim();

  if (!modelId) {
    return NextResponse.json({ error: "Missing model id" }, { status: 400 });
  }

  try {
    const pricing = await getOpenrouterPricing(modelId, apiKey);
    if (!pricing) {
      return NextResponse.json(
        { error: "Model not found", model: modelId },
        { status: 404 },
      );
    }
    return NextResponse.json({ model: modelId, pricing });
  } catch (error) {
    if ((error as Error).message?.includes("Missing OpenRouter API key")) {
      return NextResponse.json(
        { error: "Missing OpenRouter API key" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: "Failed to fetch OpenRouter pricing",
        details: (error as Error).message,
      },
      { status: 502 },
    );
  }
}
