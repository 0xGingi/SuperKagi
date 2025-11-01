# SuperKagi

A selfhosted frontend to use local LLMs or openrouter with the kagi search MCP:

- A local OpenAI-compatible LLM server (e.g., Ollama / LM Studio)
- OpenRouter
- Kagi Web Search via MCP (Model Context Protocol) so the model can search, browse, and summarize the web during a chat.
- Grok-Inspired UI

## Setup via Docker Compose
- Copy the ```.example.env``` as ```.env``` and set the variables
- start the container: ```docker compose up -d --build```
- Runs on port 3545