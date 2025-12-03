import { NextResponse } from "next/server";
import { summarizeCosts } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const summary = summarizeCosts();
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load pricing summary",
        details: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
