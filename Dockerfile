
FROM oven/bun:1.2.18-alpine AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

RUN bun run build

FROM oven/bun:1.2.18-alpine AS dev

WORKDIR /app

COPY --from=builder /app .

CMD ["bun", "run", "dev"]


FROM oven/bun:1.2.18-alpine AS prod

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

CMD ["bun", "run", "start"]
