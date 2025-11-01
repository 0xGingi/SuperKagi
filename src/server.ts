import { Elysia } from 'elysia';
import { staticPlugin } from '@elysiajs/static';
import OpenAI from 'openai';
import { Client } from '../node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

const app = new Elysia();

let mcpClient: Client;

async function initMCP() {
  const transport = new StdioClientTransport({
    command: 'uvx',
    args: ['kagimcp'],
    env: {
      KAGI_API_KEY: process.env.KAGI_API_KEY || '',
      KAGI_SUMMARIZER_ENGINE: process.env.KAGI_SUMMARIZER_ENGINE || 'cecil'
    }
  });

  mcpClient = new Client({
    name: 'super-kagi',
    version: '1.0.0'
  });

  await mcpClient.connect(transport);
  console.log('Kagi MCP connected');
}

initMCP().catch(console.error);

// Serve the main app at root
app.get('/', () => new Response(Bun.file('public/index.html'), {
  headers: { 'Content-Type': 'text/html; charset=utf-8' }
}));

// Explicitly serve stylesheet to avoid static prefix mismatches
app.get('/styles.css', () => new Response(Bun.file('public/styles.css'), {
  headers: { 'Content-Type': 'text/css; charset=utf-8' }
}));

// Expose server-side defaults from environment for the client UI
app.get('/api/config-defaults', () => {
  const provider = (process.env.APP_PROVIDER === 'openrouter') ? 'openrouter' : 'local';
  const modelLocal = process.env.MODEL_LOCAL || 'llama3';
  const modelOpenrouter = process.env.MODEL_OPENROUTER || 'openrouter/auto';
  const apiKey = process.env.OPENROUTER_API_KEY || '';
  const localUrl = process.env.LOCAL_URL || 'http://host.docker.internal:11434/api/chat';
  const systemPrompt = process.env.SYSTEM_PROMPT || '';
  const deepSearch = /^1|true|yes$/i.test(process.env.DEEP_SEARCH || '');

  return {
    provider,
    modelLocal,
    modelOpenrouter,
    hasApiKey: !!apiKey,
    localUrl,
    systemPrompt,
    deepSearch,
  };
});

app.post('/api/chat', async ({ body }) => {
  try {
    let { messages, provider, model, apiKey, localUrl, systemPrompt } = body as {
      messages: OpenAI.ChatCompletionMessageParam[];
      provider: 'local' | 'openrouter';
      model: string;
      apiKey?: string;
      localUrl?: string;
      systemPrompt?: string;
    };

    // Fallback to .env defaults when values are missing
    if (!provider) provider = (process.env.APP_PROVIDER === 'openrouter') ? 'openrouter' : 'local';
    if (!model) {
      model = provider === 'openrouter'
        ? (process.env.MODEL_OPENROUTER || 'openrouter/auto')
        : (process.env.MODEL_LOCAL || 'llama3');
    }
    if (!apiKey && provider === 'openrouter') apiKey = process.env.OPENROUTER_API_KEY || '';
    if (!localUrl) localUrl = process.env.LOCAL_URL || 'http://host.docker.internal:11434/api/chat';
    if (!systemPrompt) systemPrompt = process.env.SYSTEM_PROMPT || '';

    // Basic validation + sensible defaults for OpenRouter
    if (provider === 'openrouter') {
      if (!apiKey) {
        return { content: 'Error: OpenRouter API key is missing in Config.' };
      }
      if (!model || !model.includes('/')) {
        // Fall back to a broadly compatible default
        model = 'openrouter/auto';
      }
    }

    const normalizeContent = (content: any): any => {
      if (content == null) return '';
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content.map((part: any) => {
          if (part == null) return { type: 'text', text: '' };
          if (typeof part === 'string') return { type: 'text', text: part };
          if (typeof part !== 'object') return { type: 'text', text: String(part) };

          const type = part.type || (part.image_url ? 'image_url' : 'text');
          if (type === 'image_url') {
            const url = part.image_url?.url || part.url || '';
            return { type: 'image_url', image_url: { url } };
          }
          if (type === 'input_text' || type === 'text') {
            return { type: 'text', text: String(part.text ?? '') };
          }
          // Pass-through for any other structured parts (e.g., tool results)
          return part;
        });
      }
      if (typeof content === 'object') return content;
      return String(content);
    };

    // Sanitize messages: drop any temporary fields
    let sanitizedMessages = (messages || [])
      .filter((m: any) => !m.pending)
      .map((m: any) => ({ role: m.role, content: normalizeContent(m.content) })) as OpenAI.ChatCompletionMessageParam[];

    if (systemPrompt && String(systemPrompt).trim().length) {
      sanitizedMessages = [{ role: 'system', content: systemPrompt }, ...sanitizedMessages];
    }

    const openai = new OpenAI({
      apiKey: provider === 'openrouter' ? apiKey : 'no-key-needed',
      baseURL: provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : localUrl,
      defaultHeaders: provider === 'openrouter' ? {
        'HTTP-Referer': process.env.APP_ORIGIN || 'http://localhost:3545',
        'X-Title': 'SuperKagi',
      } : undefined,
    });

    // Tools are optional – if MCP is unavailable, continue without tools
    let tools: OpenAI.ChatCompletionTool[] = [];
    try {
      tools = await getMCPTools();
    } catch (err) {
      console.warn('MCP tools unavailable:', (err as Error).message);
    }

    let response = await openai.chat.completions.create({
      model,
      messages: sanitizedMessages,
      tools: tools.length ? tools : undefined,
      tool_choice: tools.length ? 'auto' : undefined,
    } as any);

    let choice = response.choices[0];

    while (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      sanitizedMessages.push(choice.message as any);

      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type === 'function') {
          const funcName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments || '{}');

          try {
            const result = await mcpClient.callTool({
              name: funcName,
              arguments: args,
            }, undefined, { timeout: 300000 });

            sanitizedMessages.push({
              role: 'tool',
              content: JSON.stringify(result.content),
              tool_call_id: toolCall.id,
            } as any);
          } catch (error) {
            sanitizedMessages.push({
              role: 'tool',
              content: `Error: ${(error as Error).message}`,
              tool_call_id: toolCall.id,
            } as any);
          }
        } else {
          sanitizedMessages.push({
            role: 'tool',
            content: `Unsupported tool call type: ${toolCall.type}`,
            tool_call_id: toolCall.id,
          } as any);
        }
      }

      response = await openai.chat.completions.create({
        model,
        messages: sanitizedMessages,
        tools: tools.length ? tools : undefined,
      } as any);

      choice = response.choices[0];
    }

    const content = choice?.message?.content ?? '[No content returned]';
    return { content };
  } catch (err) {
    console.error('Chat error:', err);
    return { content: `Error: ${(err as Error).message}` };
  }
});

// Streaming chat via Server-Sent Events. Tools are disabled to keep streaming simple.
app.post('/api/chat/stream', async ({ body }) => {
  try {
    let { messages, provider, model, apiKey, localUrl, systemPrompt } = body as {
      messages: OpenAI.ChatCompletionMessageParam[];
      provider: 'local' | 'openrouter';
      model: string;
      apiKey?: string;
      localUrl?: string;
      systemPrompt?: string;
    };

    if (!provider) provider = (process.env.APP_PROVIDER === 'openrouter') ? 'openrouter' : 'local';
    if (!model) {
      model = provider === 'openrouter'
        ? (process.env.MODEL_OPENROUTER || 'openrouter/auto')
        : (process.env.MODEL_LOCAL || 'llama3');
    }
    if (!apiKey && provider === 'openrouter') apiKey = process.env.OPENROUTER_API_KEY || '';
    if (!localUrl) localUrl = process.env.LOCAL_URL || 'http://host.docker.internal:11434/api/chat';
    if (!systemPrompt) systemPrompt = process.env.SYSTEM_PROMPT || '';

    if (provider === 'openrouter' && !apiKey) {
      return new Response('Missing API key', { status: 400 });
    }

    const normalizeContent = (content: any): any => {
      if (content == null) return '';
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content.map((part: any) => {
          if (part == null) return { type: 'text', text: '' };
          if (typeof part === 'string') return { type: 'text', text: part };
          if (typeof part !== 'object') return { type: 'text', text: String(part) };
          const type = part.type || (part.image_url ? 'image_url' : 'text');
          if (type === 'image_url') {
            const url = part.image_url?.url || part.url || '';
            return { type: 'image_url', image_url: { url } };
          }
          if (type === 'input_text' || type === 'text') {
            return { type: 'text', text: String(part.text ?? '') };
          }
          return part;
        });
      }
      if (typeof content === 'object') return content;
      return String(content);
    };

    let sanitizedMessages = (messages || [])
      .filter((m: any) => !m.pending)
      .map((m: any) => ({ role: m.role, content: normalizeContent(m.content) })) as OpenAI.ChatCompletionMessageParam[];

    if (systemPrompt && String(systemPrompt).trim().length) {
      sanitizedMessages = [{ role: 'system', content: systemPrompt }, ...sanitizedMessages];
    }

    const openai = new OpenAI({
      apiKey: provider === 'openrouter' ? apiKey : 'no-key-needed',
      baseURL: provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : localUrl,
      defaultHeaders: provider === 'openrouter' ? {
        'HTTP-Referer': process.env.APP_ORIGIN || 'http://localhost:3545',
        'X-Title': 'SuperKagi',
      } : undefined,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        try {
          let tools: OpenAI.ChatCompletionTool[] = [];
          try { tools = await getMCPTools(); } catch { tools = []; }

          async function streamOnce() {
            const toolCalls: any[] = [];
            let finishReason: string | undefined;
            let assistantContent = '';
            const s = await openai.chat.completions.create({
              model,
              messages: sanitizedMessages,
              tools: tools.length ? tools : undefined,
              tool_choice: tools.length ? 'auto' : undefined,
              stream: true,
            } as any);
            for await (const chunk of s as any) {
              const choice = chunk?.choices?.[0];
              if (!choice) continue;
              finishReason = choice.finish_reason || finishReason;
              const delta: any = choice.delta || {};
              if (typeof delta.content === 'string' && delta.content.length) {
                assistantContent += delta.content;
                send({ content: delta.content });
              }
              if (Array.isArray(delta.tool_calls)) {
                for (const tc of delta.tool_calls) {
                  const idx = typeof tc.index === 'number' ? tc.index : 0;
                  if (!toolCalls[idx]) toolCalls[idx] = { id: tc.id, type: 'function', function: { name: '', arguments: '' } };
                  const tgt = toolCalls[idx];
                  if (tc.id) tgt.id = tc.id;
                  if (tc.function?.name) tgt.function.name = (tgt.function.name || '') + tc.function.name;
                  if (tc.function?.arguments) tgt.function.arguments = (tgt.function.arguments || '') + tc.function.arguments;
                }
              }
            }
            return { finishReason, toolCalls, assistantContent };
          }

          while (true) {
            const { finishReason, toolCalls, assistantContent } = await streamOnce();
            if (finishReason === 'tool_calls' && toolCalls && toolCalls.length) {
              (sanitizedMessages as any).push({ role: 'assistant', content: assistantContent || '', tool_calls: toolCalls });
              for (const call of toolCalls) {
                if (call?.type === 'function') {
                  let args: any = {};
                  try { args = call.function?.arguments ? JSON.parse(call.function.arguments) : {}; } catch { args = {}; }
                  try {
                    const result = await mcpClient.callTool({ name: call.function?.name, arguments: args }, undefined, { timeout: 300000 });
                    (sanitizedMessages as any).push({ role: 'tool', content: JSON.stringify(result.content), tool_call_id: call.id });
                  } catch (err) {
                    (sanitizedMessages as any).push({ role: 'tool', content: `Error: ${(err as Error).message}`, tool_call_id: call.id });
                  }
                }
              }
              continue;
            }
            break;
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          send({ error: (error as Error).message });
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      }
    });
  } catch (err) {
    return new Response(String((err as Error).message || 'error'), { status: 500 });
  }
});

// Connection test endpoint for settings
app.post('/api/test', async ({ body }) => {
  let { provider, apiKey, localUrl } = body as { provider: 'local'|'openrouter', apiKey?: string, localUrl?: string };
  const result: any = { mcp: { ok: false }, provider: { ok: false } };

  // Fallback to .env defaults
  if (!provider) provider = (process.env.APP_PROVIDER === 'openrouter') ? 'openrouter' : 'local';
  if (!apiKey && provider === 'openrouter') apiKey = process.env.OPENROUTER_API_KEY || '';
  if (!localUrl) localUrl = process.env.LOCAL_URL || 'http://host.docker.internal:11434/api/chat';
  // Test MCP tools availability
  try {
    const tools = await getMCPTools();
    result.mcp.ok = true;
    result.mcp.tools = tools.map(t => (t as any).function?.name);
  } catch (e) {
    result.mcp.error = (e as Error).message;
  }

  // Test provider connectivity
  try {
    if (provider === 'openrouter') {
      if (!apiKey) throw new Error('Missing OpenRouter API key');
      const resp = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.APP_ORIGIN || 'http://localhost:3545',
          'X-Title': 'SuperKagi',
        }
      });
      result.provider.ok = resp.ok;
      result.provider.status = resp.status;
      if (!resp.ok) result.provider.error = await resp.text();
    } else {
      const url = new URL(localUrl || 'http://localhost:11434/api/chat');
      const base = `${url.protocol}//${url.host}`;
      const tags = base + '/api/tags';
      const ping = await fetch(tags, { method: 'GET' });
      result.provider.ok = ping.ok;
      result.provider.status = ping.status;
      if (!ping.ok) result.provider.error = await ping.text();
    }
  } catch (e) {
    result.provider.error = (e as Error).message;
  }

  return result;
});

// Serve static assets after primary routes to avoid catch-all precedence
app.use(staticPlugin());

async function getMCPTools(): Promise<OpenAI.ChatCompletionTool[]> {
  const res = await mcpClient.listTools();
  const tools = (res as any).tools ?? [];

  return (tools as any[]).map((tool: any) => {
    // MCP tools expose JSON Schema already. Use it directly.
    const schema = tool.inputSchema || tool.input_schema || { type: 'object', properties: {} };
    // Ensure minimal validity
    const parameters = {
      type: schema.type || 'object',
      properties: schema.properties || {},
      required: schema.required || [],
      additionalProperties: schema.additionalProperties ?? false,
      description: schema.description || undefined,
    };

    return {
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters,
      },
    };
  });
}

app.listen(3545);
console.log('App running at http://localhost:3545');
