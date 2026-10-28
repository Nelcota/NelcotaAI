# Production image: builds the TanStack Start app and serves it with Bun.
#
# VITE_* variables are compiled into the browser bundle, so they are build arguments. Server
# secrets (NELCOTA_SERVICE_ROLE_TOKEN, MERCADO_PAGO_*, APP_URL) are read at runtime from the
# environment; see .env.example.
FROM oven/bun:1.4.4-slim AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
ARG VITE_NELCOTA_URL
ARG VITE_MERCADO_PAGO_PUBLIC_KEY
RUN bun run build

FROM oven/bun:1.4.4-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY --from=build /app/dist ./dist
USER bun
EXPOSE 3000
ENV PORT=3000
CMD ["bun", "run", "start"]
