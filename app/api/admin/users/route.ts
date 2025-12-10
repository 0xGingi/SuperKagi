import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-middleware";
import { createUser, listUsers } from "@/lib/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        await requireAdmin();
        const users = listUsers();
        return NextResponse.json({ users });
    } catch (error) {
        const message = (error as Error).message;
        if (message.includes("Authentication") || message.includes("Admin")) {
            return NextResponse.json({ error: message }, { status: 403 });
        }
        console.error("[admin/users] GET error:", error);
        return NextResponse.json({ error: "Failed to list users" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        await requireAdmin();

        const body = await request.json();
        const { username, password, isAdmin } = body;

        if (!username || !password) {
            return NextResponse.json(
                { error: "Username and password are required" },
                { status: 400 },
            );
        }

        if (username.length < 2) {
            return NextResponse.json(
                { error: "Username must be at least 2 characters" },
                { status: 400 },
            );
        }

        if (password.length < 4) {
            return NextResponse.json(
                { error: "Password must be at least 4 characters" },
                { status: 400 },
            );
        }

        const passwordHash = hashPassword(password);
        const user = createUser(username, passwordHash, !!isAdmin);

        return NextResponse.json({
            ok: true,
            user: {
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin,
            },
        });
    } catch (error) {
        const message = (error as Error).message;
        if (message.includes("Authentication") || message.includes("Admin")) {
            return NextResponse.json({ error: message }, { status: 403 });
        }
        if (message.includes("UNIQUE constraint")) {
            return NextResponse.json({ error: "Username already exists" }, { status: 409 });
        }
        console.error("[admin/users] POST error:", error);
        return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
    }
}
