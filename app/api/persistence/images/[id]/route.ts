import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-middleware";
import { deleteImage } from "@/lib/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const { id } = await params;
        const deleted = deleteImage(id, user.id);

        if (!deleted) {
            return NextResponse.json(
                { error: "Image not found or not owned by user" },
                { status: 404 },
            );
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[persistence/images/[id]] DELETE error", error);
        return NextResponse.json(
            { error: "Persistence error", details: (error as Error).message },
            { status: 500 },
        );
    }
}
