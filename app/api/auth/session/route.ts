import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const user = await getCurrentUser();

        if (!user) {
            return NextResponse.json({ user: null });
        }

        return NextResponse.json({
            user: {
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin,
            },
        });
    } catch (error) {
        console.error("[auth/session] error:", error);
        return NextResponse.json({ user: null });
    }
}
