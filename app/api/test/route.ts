import { NextResponse } from 'next/server';
import { env, resolveProvider } from '@/lib/env';
import { getMcpTools } from '@/lib/mcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json();
  let { provider, apiKey, localUrl } = body as { provider?: string; apiKey?: string; localUrl?: string };
  const resolvedProvider = resolveProvider(provider);
  apiKey = apiKey || (resolvedProvider === 'openrouter' ? env.openrouterApiKey : env.nanogptApiKey);
  localUrl = localUrl || env.localUrl;

  const result: any = { mcp: { ok: false }, provider: { ok: false } };

  try {
    const tools = await getMcpTools();
    result.mcp.ok = true;
    result.mcp.tools = tools.map((t: any) => t?.function?.name);
  } catch (e) {
    result.mcp.error = (e as Error).message;
  }

  try {
    if (resolvedProvider === 'openrouter') {
      if (!apiKey) throw new Error('Missing OpenRouter API key');
      const resp = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': env.appOrigin,
          'X-Title': 'SuperKagi',
        },
      });
      result.provider.ok = resp.ok;
      result.provider.status = resp.status;
      if (!resp.ok) result.provider.error = await resp.text();
    } else if (resolvedProvider === 'nanogpt') {
      if (!apiKey) throw new Error('Missing NanoGPT API key');
      const base = env.nanogptBaseUrl.replace(/\/$/, '');
      const resp = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      result.provider.ok = resp.ok;
      result.provider.status = resp.status;
      if (!resp.ok) result.provider.error = await resp.text();
    } else {
      const url = new URL(localUrl);
      const base = `${url.protocol}//${url.host}`;
      const ping = await fetch(base + '/api/tags', { method: 'GET' });
      result.provider.ok = ping.ok;
      result.provider.status = ping.status;
      if (!ping.ok) result.provider.error = await ping.text();
    }
  } catch (e) {
    result.provider.error = (e as Error).message;
  }

  return NextResponse.json(result);
}
