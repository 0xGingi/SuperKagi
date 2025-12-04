import { streamChat } from "@/lib/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (obj: any) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      // Keep-alive pings to prevent client-side stall watchdogs from aborting
      send({ meta: { status: "started" } });
      const keepAlive = setInterval(() => {
        try {
          send({ meta: { ping: Date.now() } });
        } catch {
          // Ignore enqueue errors if stream already closed
        }
      }, 10000);

      streamChat(body, (chunk) => {
        if (chunk?.content) send({ content: chunk.content });
        if (chunk?.reasoning) send({ reasoning: chunk.reasoning });
        if (chunk?.reasoning_details)
          send({ reasoning_details: chunk.reasoning_details });
      })
        .then((meta) => {
          if (
            meta &&
            (meta.cost != null || meta.model || meta.usage !== undefined)
          ) {
            send({ meta });
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        })
        .catch((error) => {
          send({ error: (error as Error).message });
          controller.close();
        })
        .finally(() => clearInterval(keepAlive));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
