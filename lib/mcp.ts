import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { env } from "./env";

let mcpClientPromise: Promise<Client> | null = null;
let cachedTools: ChatCompletionTool[] | null = null;
let toolsFetchedAt = 0;
let toolsPromise: Promise<ChatCompletionTool[]> | null = null;
const TOOLS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let warmupStarted = false;

async function connectMcp(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: "uvx",
    args: ["kagimcp"],
    env: {
      KAGI_API_KEY: env.kagiApiKey,
      KAGI_SUMMARIZER_ENGINE: env.kagiEngine,
    },
  });

  const client = new Client({
    name: "super-kagi",
    version: "1.0.0",
  });

  await client.connect(transport);
  return client;
}

async function getMcpClient(): Promise<Client> {
  if (!mcpClientPromise) {
    mcpClientPromise = connectMcp().catch((error) => {
      mcpClientPromise = null;
      throw error;
    });
  }
  return mcpClientPromise;
}

export async function getMcpTools(): Promise<ChatCompletionTool[]> {
  const now = Date.now();
  if (cachedTools && now - toolsFetchedAt < TOOLS_CACHE_TTL) return cachedTools;
  if (toolsPromise) return toolsPromise;

  toolsPromise = (async () => {
    try {
      const client = await getMcpClient();
      const res = await client.listTools();
      const tools = (res as any).tools ?? [];

      const mapped = tools.map((tool: any) => {
        const schema = tool.inputSchema ||
          tool.input_schema || { type: "object", properties: {} };
        return {
          type: "function" as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: {
              type: schema.type || "object",
              properties: schema.properties || {},
              required: schema.required || [],
              additionalProperties: schema.additionalProperties ?? false,
              description: schema.description || undefined,
            },
          },
        } satisfies ChatCompletionTool;
      });

      cachedTools = mapped;
      toolsFetchedAt = Date.now();
      return mapped;
    } finally {
      toolsPromise = null;
    }
  })();

  return toolsPromise;
}

export async function callMcpTool(name: string, args: Record<string, unknown>) {
  const client = await getMcpClient();
  return client.callTool({ name, arguments: args }, undefined, {
    timeout: 300000,
  });
}

export function warmMcpClient() {
  if (warmupStarted || !env.kagiApiKey) return;
  warmupStarted = true;
  void getMcpTools().catch((error) => {
    // Non-fatal; we'll try again on the next deep-search request.
    console.warn("MCP warmup failed:", (error as Error).message);
    warmupStarted = false;
  });
}
