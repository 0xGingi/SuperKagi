import { NextResponse } from "next/server";
import { backupAll, restoreAll } from "@/lib/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = backupAll();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[persistence/backup] GET error", error);
    return NextResponse.json(
      { error: "Persistence error", details: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    restoreAll(body || {});
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[persistence/backup] POST error", error);
    return NextResponse.json(
      { error: "Persistence error", details: (error as Error).message },
      { status: 500 },
    );
  }
}
