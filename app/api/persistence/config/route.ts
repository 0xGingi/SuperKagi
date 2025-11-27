import { NextResponse } from "next/server";
import { loadConfig, type StoredConfig, saveConfig } from "@/lib/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = loadConfig();
    return NextResponse.json({ config });
  } catch (error) {
    console.error("[persistence/config] GET error", error);
    return NextResponse.json(
      { error: "Persistence error", details: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { config?: StoredConfig };
    if (!body?.config) {
      return NextResponse.json({ error: "Missing config" }, { status: 400 });
    }
    saveConfig(body.config);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[persistence/config] POST error", error);
    return NextResponse.json(
      { error: "Persistence error", details: (error as Error).message },
      { status: 500 },
    );
  }
}
