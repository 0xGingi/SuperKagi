# SuperKagi

A selfhosted frontend to use local LLMs or openrouter with the kagi search MCP:

- A local OpenAI-compatible LLM server (e.g., Ollama / LM Studio)
- OpenRouter
- Kagi Web Search via MCP (Model Context Protocol) so the model can search, browse, and summarize the web during a chat.
- Grok-Inspired UI

<img width="1634" height="918" alt="image" src="https://github.com/user-attachments/assets/4e6715c3-ed8d-4bdc-a0df-6e2a27d55f94" />


## Setup via Docker Compose
- Copy the ```.example.env``` as ```.env``` and set the variables
- start the container: ```docker compose up -d --build```
- Runs on port 3545
