import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { deleteSession } from "@/lib/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
    try {
        const cookieStore = await cookies();
        const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

        if (sessionToken) {
            deleteSession(sessionToken);
        }

        // Clear cookie
        cookieStore.delete(SESSION_COOKIE_NAME);

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[auth/logout] error:", error);
        return NextResponse.json(
            { error: "Logout failed", details: (error as Error).message },
            { status: 500 },
        );
    }
}
