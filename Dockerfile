FROM oven/bun:1.2.18-alpine AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1.2.18-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

CMD ["bun", "run", "start"]
