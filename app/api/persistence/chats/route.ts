import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-middleware";
import {
  getChat,
  listChats,
  type StoredChat,
  saveChat,
} from "@/lib/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const summaries = listChats(user.id);
    const chats = summaries
      .map((c) => getChat(c.id, user.id))
      .filter(Boolean) as StoredChat[];
    return NextResponse.json({ chats });
  } catch (error) {
    console.error("[persistence/chats] GET error", error);
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

    const body = (await request.json()) as StoredChat;
    if (!body?.id || !Array.isArray(body.messages)) {
      return NextResponse.json(
        { error: "Missing id or messages array" },
        { status: 400 },
      );
    }
    saveChat(body, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[persistence/chats] POST error", error);
    return NextResponse.json(
      { error: "Persistence error", details: (error as Error).message },
      { status: 500 },
    );
  }
}
