import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-middleware";
import { loadConfig, type StoredConfig, saveConfig } from "@/lib/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const config = loadConfig(user.id);
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
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = (await request.json()) as { config?: StoredConfig };
    if (!body?.config) {
      return NextResponse.json({ error: "Missing config" }, { status: 400 });
    }
    saveConfig(body.config, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[persistence/config] POST error", error);
    return NextResponse.json(
      { error: "Persistence error", details: (error as Error).message },
      { status: 500 },
    );
  }
}
