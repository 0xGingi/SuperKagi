import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-middleware";
import { deleteUser, getUserById, updateUserPassword } from "@/lib/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function DELETE(_request: Request, { params }: { params: Params }) {
    try {
        const currentUser = await requireAdmin();
        const { id } = await params;

        // Prevent self-deletion
        if (currentUser.id === id) {
            return NextResponse.json(
                { error: "Cannot delete your own account" },
                { status: 400 },
            );
        }

        const user = getUserById(id);
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        deleteUser(id);
        return NextResponse.json({ ok: true });
    } catch (error) {
        const message = (error as Error).message;
        if (message.includes("Authentication") || message.includes("Admin")) {
            return NextResponse.json({ error: message }, { status: 403 });
        }
        console.error("[admin/users/[id]] DELETE error:", error);
        return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
    }
}

export async function PATCH(request: Request, { params }: { params: Params }) {
    try {
        await requireAdmin();
        const { id } = await params;

        const body = await request.json();
        const { password } = body;

        if (!password) {
            return NextResponse.json(
                { error: "Password is required" },
                { status: 400 },
            );
        }

        if (password.length < 4) {
            return NextResponse.json(
                { error: "Password must be at least 4 characters" },
                { status: 400 },
            );
        }

        const user = getUserById(id);
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const passwordHash = hashPassword(password);
        updateUserPassword(id, passwordHash);

        return NextResponse.json({ ok: true });
    } catch (error) {
        const message = (error as Error).message;
        if (message.includes("Authentication") || message.includes("Admin")) {
            return NextResponse.json({ error: message }, { status: 403 });
        }
        console.error("[admin/users/[id]] PATCH error:", error);
        return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
    }
}
