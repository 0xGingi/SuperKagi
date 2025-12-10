import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifyPassword, hashPassword } from "@/lib/auth";
import { cookies } from "next/headers";
import { getSession, updateUserPassword } from "@/lib/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    try {
        // Get current user from session
        const cookieStore = await cookies();
        const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

        if (!sessionToken) {
            return NextResponse.json(
                { error: "Not authenticated" },
                { status: 401 }
            );
        }

        const user = getSession(sessionToken);
        if (!user) {
            return NextResponse.json(
                { error: "Session expired" },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { currentPassword, newPassword } = body;

        if (!currentPassword || !newPassword) {
            return NextResponse.json(
                { error: "Current password and new password are required" },
                { status: 400 }
            );
        }

        if (newPassword.length < 4) {
            return NextResponse.json(
                { error: "New password must be at least 4 characters" },
                { status: 400 }
            );
        }

        // Verify current password
        if (!verifyPassword(currentPassword, user.passwordHash)) {
            return NextResponse.json(
                { error: "Current password is incorrect" },
                { status: 401 }
            );
        }

        // Hash and update new password
        const newPasswordHash = hashPassword(newPassword);
        updateUserPassword(user.id, newPasswordHash);

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[auth/change-password] error:", error);
        return NextResponse.json(
            { error: "Failed to change password" },
            { status: 500 }
        );
    }
}
