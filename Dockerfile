FROM oven/bun:1

# Install Python and uv for Kagi MCP
RUN apt-get update && apt-get install -y curl python3 python3-venv && rm -rf /var/lib/apt/lists/*
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# uv installs to ~/.local/bin by default; ensure it's on PATH for uv/uvx
ENV PATH="/root/.local/bin:/root/.cargo/bin:$PATH"

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install

COPY . .

CMD ["bun", "src/server.ts"]
