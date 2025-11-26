# SuperKagi

A grok-inspired chat UI for local LLMs, OpenRouter, nano-gpt with Kagi Web Search via MCP.

- Local OpenAI-compatible LLM server (e.g., Ollama / LM Studio)
- <a href="https://openrouter.ai">OpenRouter</a>
- <a href="nano-gpt.com">Nano-gpt.com</a>
- <a href="https://help.kagi.com/kagi/api/search.html">Kagi Web Search</a> via <a href="https://github.com/kagisearch/kagimcp">KagiMCP</a> so the model can search, browse, and summarize the web during a chat.
- Grok-Inspired UI

<img width="1634" height="918" alt="image" src="https://github.com/user-attachments/assets/4e6715c3-ed8d-4bdc-a0df-6e2a27d55f94" />


## Setup via Docker Compose
- Copy the ```.example.env``` as ```.env``` and set the variables
- start the container: ```docker compose up -d --build```
- Runs on port 3545
