FROM oven/bun:1.2.18-alpine

WORKDIR /app

COPY package*.json bun.lock ./

RUN bun install --frozen-lockfile

COPY . .

CMD ["sh", "-c", "bun run src/index.ts"]