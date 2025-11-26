import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { env } from "./env";

let mcpClientPromise: Promise<Client> | null = null;

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
  const client = await getMcpClient();
  const res = await client.listTools();
  const tools = (res as any).tools ?? [];

  return tools.map((tool: any) => {
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
}

export async function callMcpTool(name: string, args: Record<string, unknown>) {
  const client = await getMcpClient();
  return client.callTool({ name, arguments: args }, undefined, {
    timeout: 300000,
  });
}
