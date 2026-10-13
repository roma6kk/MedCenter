# syntax=docker/dockerfile:1
# Next.js 15 client (frontend/) as a standalone server image.
#
#   docker build -f infra/docker/web.Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=http://traefik:8081 frontend
#
# Context is frontend/ (own package.json + package-lock.json); the ignore file
# is infra/docker/web.Dockerfile.dockerignore.
#
# NEXT_PUBLIC_API_URL is a BUILD-time value: Next inlines NEXT_PUBLIC_* into the
# server bundle (src/lib/server-fetch.ts) and compiles the /api/v1 rewrite of
# next.config.mjs into routes-manifest.json. Changing it needs a rebuild.
# Pinned by tag and digest, same base as nest-service.Dockerfile.
ARG NODE_IMAGE=node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402

FROM ${NODE_IMAGE} AS base
RUN apk add --no-cache tini
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_maxtimeout=120000

FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=medcenter-web-npm,target=/root/.npm,sharing=locked \
    npm ci --no-audit --no-fund

FROM base AS build
ARG NEXT_PUBLIC_API_URL=http://traefik:8081
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# public/ is optional in the source tree; create it so the runtime COPY never fails.
RUN mkdir -p public && npm run build

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# server.js + traced node_modules; owned by `node` because ISR writes .next/cache.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
