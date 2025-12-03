import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import {
  env,
  type NormalizedChatConfig,
  type Provider,
  withDefaults,
} from "./env";
import { callMcpTool, getMcpTools } from "./mcp";
import { recordOpenrouterCost, type UsageRecord } from "./pricing";

type IncomingMessage = {
  role: "user" | "assistant" | "tool";
  content:
    | string
    | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  pending?: boolean;
  tool_call_id?: string;
};

type ChatPayload = {
  messages: IncomingMessage[];
  provider?: Provider;
  model?: string;
  apiKey?: string;
  apiKeyOpenrouter?: string;
  apiKeyNanogpt?: string;
  localUrl?: string;
  systemPrompt?: string;
  deepSearch?: boolean;
};

export type ChatResult = {
  content: string;
  cost?: number | null;
  model?: string;
  usage?: UsageRecord;
};

export type ChatMeta = Pick<ChatResult, "cost" | "model" | "usage">;

function normalizeContent(content: any): any {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part: any) => {
      if (part == null) return { type: "text", text: "" };
      if (typeof part === "string") return { type: "text", text: part };
      if (typeof part !== "object") return { type: "text", text: String(part) };
      const type = part.type || (part.image_url ? "image_url" : "text");
      if (type === "image_url") {
        const url = part.image_url?.url || part.url || "";
        return { type: "image_url", image_url: { url } };
      }
      if (type === "input_text" || type === "text") {
        return { type: "text", text: String(part.text ?? "") };
      }
      return part;
    });
  }
  if (typeof content === "object") return content;
  return String(content);
}

function sanitizeMessages(
  messages: IncomingMessage[] | undefined,
  systemPrompt?: string,
): ChatCompletionMessageParam[] {
  console.log("[chat] sanitizeMessages start", {
    count: messages?.length,
    hasSystem: !!systemPrompt,
  });
  let sanitized = (messages || [])
    .filter((m) => !m.pending)
    .map((m) => ({
      role: m.role,
      content: normalizeContent(m.content),
    })) as ChatCompletionMessageParam[];

  if (systemPrompt?.trim().length) {
    sanitized = [{ role: "system", content: systemPrompt }, ...sanitized];
  }
  return sanitized;
}

function buildClient(config: NormalizedChatConfig) {
  const isOpenRouter = config.provider === "openrouter";
  const isNano = config.provider === "nanogpt";
  const baseURL = isOpenRouter
    ? "https://openrouter.ai/api/v1"
    : isNano
      ? config.nanoBaseUrl || env.nanogptBaseUrl
      : config.localUrl;
  const apiKey = isOpenRouter || isNano ? config.apiKey : "no-key-needed";
  const defaultHeaders = isOpenRouter
    ? {
        "HTTP-Referer": env.appOrigin,
        "X-Title": "SuperKagi",
      }
    : undefined;

  const client = new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders,
  });
  console.log("[chat] buildClient", {
    provider: config.provider,
    model: config.model,
    baseURL,
    hasApiKey: !!apiKey,
    hasHeaders: !!defaultHeaders,
  });
  return client;
}

export async function runChat(payload: ChatPayload): Promise<ChatResult> {
  const resolved = withDefaults(payload);
  const messages = sanitizeMessages(payload.messages, payload.systemPrompt);
  const client = buildClient(resolved);
  let usage: UsageRecord | undefined;
  let modelUsed: string = resolved.model;
  let cost: number | null = null;

  let tools: ChatCompletionTool[] = [];
  if (payload.deepSearch) {
    try {
      tools = await getMcpTools();
      console.log(
        "[MCP] tools loaded:",
        tools.map((t) =>
          "function" in t
            ? t.function.name
            : (t as any).custom?.name || "unknown",
        ),
      );
    } catch (err) {
      console.warn("MCP tools unavailable:", (err as Error).message);
    }
  }

  console.log("[chat] runChat start", {
    provider: resolved.provider,
    model: resolved.model,
    messages: messages.length,
    tools: tools.length,
  });

  let response = await client.chat.completions.create({
    model: resolved.model,
    messages,
    tools: tools.length ? tools : undefined,
    tool_choice: tools.length ? "auto" : undefined,
  } as any);

  let choice = response.choices[0];
  const workingMessages = [...messages];

  while (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
    workingMessages.push(choice.message as any);
    for (const toolCall of choice.message.tool_calls) {
      if (toolCall.type === "function") {
        const funcName = toolCall.function.name;
        const args = safeJsonParse(toolCall.function.arguments || "{}");
        try {
          console.log("[MCP] call", funcName, args);
          const result = await callMcpTool(funcName, args);
          console.log("[MCP] result", result);
          workingMessages.push({
            role: "tool",
            content: JSON.stringify(result.content),
            tool_call_id: toolCall.id,
          } as any);
        } catch (error) {
          console.error("[MCP] error", error);
          workingMessages.push({
            role: "tool",
            content: `Error: ${(error as Error).message}`,
            tool_call_id: toolCall.id,
          } as any);
        }
      }
    }

    console.log("[chat] runChat post-tool call", {
      pendingTools: choice.message.tool_calls?.length,
      workingMessages: workingMessages.length,
    });

    response = await client.chat.completions.create({
      model: resolved.model,
      messages: workingMessages,
      tools: tools.length ? tools : undefined,
    } as any);
    choice = response.choices[0];
  }

  usage = (response as any)?.usage as UsageRecord | undefined;
  modelUsed = ((response as any)?.model as string | undefined) || resolved.model;

  if (resolved.provider === "openrouter" && usage) {
    const record = await recordOpenrouterCost({
      model: modelUsed,
      usage,
      pricing: (response as any)?.pricing,
      apiKey: resolved.apiKey,
    });
    cost = record?.cost ?? null;
  }

  return {
    content: choice?.message?.content ?? "[No content returned]",
    cost,
    model: modelUsed,
    usage,
  };
}

export async function streamChat(
  payload: ChatPayload,
  onChunk: (text: string) => void,
): Promise<ChatMeta> {
  const resolved = withDefaults(payload);
  const baseMessages = sanitizeMessages(payload.messages, payload.systemPrompt);
  const client = buildClient(resolved);
  let latestUsage: UsageRecord | undefined;
  let streamedModel: string | undefined;
  let cost: number | null = null;

  let tools: ChatCompletionTool[] = [];
  if (payload.deepSearch) {
    try {
      tools = await getMcpTools();
      console.log(
        "[MCP] tools loaded (stream):",
        tools.map((t) =>
          "function" in t
            ? t.function.name
            : (t as any).custom?.name || "unknown",
        ),
      );
    } catch (err) {
      console.warn("MCP tools unavailable (stream):", (err as Error).message);
      tools = [];
    }
  }

  const messages = baseMessages;

  async function streamOnce() {
    const toolCalls: any[] = [];
    let finishReason: string | undefined;
    console.log("[chat] streamOnce start", {
      provider: resolved.provider,
      model: resolved.model,
      messages: messages.length,
      tools: tools.length,
    });
    const s = await client.chat.completions.create({
      model: resolved.model,
      messages,
      tools: tools.length ? tools : undefined,
      tool_choice: tools.length ? "auto" : undefined,
      stream: true,
      stream_options: { include_usage: true } as any,
    } as any);

    for await (const chunk of s as any) {
      if (chunk?.model) streamedModel = chunk.model;
      if (chunk?.usage) latestUsage = chunk.usage as UsageRecord;
      const choice = chunk?.choices?.[0];
      if (!choice) continue;
      finishReason = choice.finish_reason || finishReason;
      const delta: any = choice.delta || {};
      if (typeof delta.content === "string" && delta.content.length) {
        onChunk(delta.content);
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = typeof tc.index === "number" ? tc.index : 0;
          if (!toolCalls[idx])
            toolCalls[idx] = {
              id: tc.id,
              type: "function",
              function: { name: "", arguments: "" },
            };
          const tgt = toolCalls[idx];
          if (tc.id) tgt.id = tc.id;
          if (tc.function?.name)
            tgt.function.name = (tgt.function.name || "") + tc.function.name;
          if (tc.function?.arguments)
            tgt.function.arguments =
              (tgt.function.arguments || "") + tc.function.arguments;
        }
      }
    }
    console.log("[chat] streamOnce complete", {
      finishReason,
      toolCalls: toolCalls.length,
    });
    return { finishReason, toolCalls };
  }

  while (true) {
    const { finishReason, toolCalls } = await streamOnce();
    if (finishReason === "tool_calls" && toolCalls && toolCalls.length) {
      (messages as any).push({
        role: "assistant",
        content: "",
        tool_calls: toolCalls,
      });
      for (const call of toolCalls) {
        if (call?.type === "function") {
          let args: any = {};
          try {
            args = call.function?.arguments
              ? JSON.parse(call.function.arguments)
              : {};
          } catch {
            args = {};
          }
          try {
            console.log("[MCP] call (stream)", call.function?.name, args);
            const result = await callMcpTool(call.function?.name, args);
            console.log("[MCP] result (stream)", result);
            (messages as any).push({
              role: "tool",
              content: JSON.stringify(result.content),
              tool_call_id: call.id,
            });
          } catch (err) {
            console.error("[MCP] error (stream)", err);
            (messages as any).push({
              role: "tool",
              content: `Error: ${(err as Error).message}`,
              tool_call_id: call.id,
            });
          }
        }
      }
      continue;
    }
    break;
  }

  if (resolved.provider === "openrouter" && latestUsage) {
    const record = await recordOpenrouterCost({
      model: streamedModel || resolved.model,
      usage: latestUsage,
      apiKey: resolved.apiKey,
    });
    cost = record?.cost ?? null;
  }

  return {
    cost,
    model: streamedModel || resolved.model,
    usage: latestUsage,
  };
}

function safeJsonParse(input: string) {
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}
