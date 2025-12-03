import { NextResponse } from "next/server";
import { listRecentCosts } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit"));
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(Math.max(Math.floor(limitParam), 1), 500)
        : 50;
    const costs = listRecentCosts(limit);
    return NextResponse.json({ costs });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load pricing costs",
        details: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
