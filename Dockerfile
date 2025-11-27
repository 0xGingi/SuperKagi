FROM oven/bun:1

RUN apt-get update && apt-get install -y \
  curl \
  python3 \
  python3-venv \
  build-essential \
  && rm -rf /var/lib/apt/lists/*
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:/root/.cargo/bin:$PATH"
ENV NEXT_USE_WASM=1

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install
RUN bun update

RUN printf '#!/bin/sh\nif [ "$1" = "config" ] && [ "$2" = "get" ] && [ "$3" = "registry" ]; then echo https://registry.npmjs.org; exit 0; fi\nexec bun \"$@\"\n' > /usr/local/bin/npm && chmod +x /usr/local/bin/npm

COPY . .
RUN bun run build

EXPOSE 3000
CMD ["bun", "run", "start"]
