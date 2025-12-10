import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, SESSION_DURATION_MS, verifyPassword } from "@/lib/auth";
import { createSession, getUserByUsername } from "@/lib/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { username, password } = body;

        if (!username || !password) {
            return NextResponse.json(
                { error: "Username and password are required" },
                { status: 400 },
            );
        }

        const user = getUserByUsername(username);
        if (!user) {
            return NextResponse.json(
                { error: "Invalid username or password" },
                { status: 401 },
            );
        }

        if (!verifyPassword(password, user.passwordHash)) {
            return NextResponse.json(
                { error: "Invalid username or password" },
                { status: 401 },
            );
        }

        // Create session
        const sessionToken = createSession(user.id);

        // Set cookie - only use secure if explicitly using HTTPS
        const isHttps = process.env.APP_ORIGIN?.startsWith("https://") || false;
        const cookieStore = await cookies();
        cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
            httpOnly: true,
            secure: isHttps,
            sameSite: "lax",
            maxAge: SESSION_DURATION_MS / 1000,
            path: "/",
        });

        return NextResponse.json({
            ok: true,
            user: {
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin,
            },
        });
    } catch (error) {
        console.error("[auth/login] error:", error);
        return NextResponse.json(
            { error: "Login failed", details: (error as Error).message },
            { status: 500 },
        );
    }
}
