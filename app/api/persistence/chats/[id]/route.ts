import { type NextRequest, NextResponse } from "next/server";
import { deleteChat, getChat } from "@/lib/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const chat = getChat(id);
    if (!chat)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(chat);
  } catch (error) {
    console.error("[persistence/chat/:id] GET error", error);
    return NextResponse.json(
      { error: "Persistence error", details: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    deleteChat(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[persistence/chat/:id] DELETE error", error);
    return NextResponse.json(
      { error: "Persistence error", details: (error as Error).message },
      { status: 500 },
    );
  }
}
