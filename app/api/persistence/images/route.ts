import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-middleware";
import { listImages, saveImage, type StoredImage } from "@/lib/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const images = listImages(user.id);
        return NextResponse.json({ images });
    } catch (error) {
        console.error("[persistence/images] GET error", error);
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

        const body = await request.json();
        const image = body as StoredImage;

        if (!image?.id || !image?.url) {
            return NextResponse.json(
                { error: "Missing required fields: id and url" },
                { status: 400 },
            );
        }

        saveImage(image, user.id);
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[persistence/images] POST error", error);
        return NextResponse.json(
            { error: "Persistence error", details: (error as Error).message },
            { status: 500 },
        );
    }
}
