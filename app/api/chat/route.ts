import { NextResponse } from 'next/server';
import { runChat } from '@/lib/chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const content = await runChat(body);
    return NextResponse.json({ content });
  } catch (err) {
    console.error('Chat error:', err);
    return NextResponse.json({ content: `Error: ${(err as Error).message}` });
  }
}
