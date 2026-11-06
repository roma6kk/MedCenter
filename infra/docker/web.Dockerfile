# syntax=docker/dockerfile:1
# NEXT_PUBLIC_API_URL is build-time: Next inlines it and compiles the /api/v1 rewrite, so changing it needs a rebuild.
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
RUN mkdir -p public && npm run build

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
