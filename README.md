# SuperKagi

A grok-inspired chat UI for local LLMs or OpenRouter with Kagi Web Search via MCP.

- Local OpenAI-compatible LLM server (e.g., Ollama / LM Studio)
- OpenRouter
- NanoGPT (OpenAI-compatible)
- Kagi Web Search via MCP (Model Context Protocol) so the model can search, browse, and summarize the web during a chat

## Prereqs
- Bun (package manager + runtime)
- uv (installed automatically in the container) for the `kagimcp` tool

## Running locally
```bash
bun install
bun run dev
```

## Docker
```bash
docker compose up -d --build
```