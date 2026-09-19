FROM oven/bun:1.4.2-slim AS base
WORKDIR /app

# Install dependencies into container
COPY package.json bun.lock* ./
COPY packages/ ./packages/
COPY apps/ ./apps/

RUN bun install --frozen-lockfile --production

# Default server configuration
ENV CONQUEST_PORT=4000 \
    CONQUEST_SERVER_NAME="conquest.sh-server" \
    CONQUEST_DB_PATH="/data/conquest.sqlite" \
    CONQUEST_MAX_PLAYERS=4

# Persistent storage for SQLite database
VOLUME /data

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e 'fetch("http://localhost:" + (process.env.CONQUEST_PORT || 4000) + "/health").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'

CMD ["bun", "run", "apps/server/src/index.ts"]
