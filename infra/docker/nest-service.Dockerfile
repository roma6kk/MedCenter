# syntax=docker/dockerfile:1
# Generic image for every NestJS BFF in apps/* (NFR-001: one image per service).
#
#   docker build -f infra/docker/nest-service.Dockerfile \
#     --build-arg APP=notification-service --build-arg PORT=3006 .
#
# APP  — Nx project name (apps/<APP>/project.json "name"); required.
# PORT — port the service listens on; documentation default for EXPOSE/ENV,
#        docker-compose.yml sets the runtime value explicitly.
# Context is the repository root; .dockerignore allowlists the Nx workspace.
#
# Layer sharing: everything above `ARG APP` in the `build` stage is APP-independent,
# so `docker compose build` runs `npm ci` once and reuses the layer for every image.
# Declaring `ARG APP` earlier would make BuildKit re-run every later RUN per value.

# Pinned by tag AND digest (node 22 LTS, alpine 3.24): reproducible builds; bump both
# together when updating (`docker buildx imagetools inspect node:<tag>` prints the digest).
ARG NODE_IMAGE=node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402

FROM ${NODE_IMAGE} AS base
RUN apk add --no-cache tini
WORKDIR /app
# Flaky registry links: retry tarball fetches instead of failing the build.
ENV npm_config_fetch_retries=5 \
    npm_config_fetch_retry_maxtimeout=120000

# Production dependencies only — copied into the runtime stage.
FROM base AS deps
COPY package.json package-lock.json ./
# Shared, locked npm cache: the deps and build stages download each tarball once.
RUN --mount=type=cache,id=medcenter-npm,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM base AS build
# Full install on purpose: nx, @nx/* executors and typescript are devDependencies.
# No ARG before this point: the layer must not depend on which app is built.
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=medcenter-npm,target=/root/.npm,sharing=locked \
    npm ci --ignore-scripts --no-audit --no-fund
ENV NX_DAEMON=false \
    NX_NO_CLOUD=true
COPY nx.json tsconfig.base.json ./
COPY libs ./libs
ARG APP
RUN test -n "$APP" || { echo "build-arg APP (Nx project name) is required" >&2; exit 1; }
# Only the requested app: a sibling app that is mid-edit cannot break this build,
# and edits to other apps do not invalidate this layer.
COPY apps/${APP} ./apps/${APP}
RUN npx nx build "$APP" --skip-nx-cache

FROM base AS runtime
ARG APP
ARG PORT=3000
ENV NODE_ENV=production \
    APP=${APP} \
    PORT=${PORT}
COPY --from=deps /app/node_modules ./node_modules
# dist/apps/<APP> (entry point) + dist/libs/* (only the libs <APP> depends on).
COPY --from=build /app/dist ./dist
# @nx/js:tsc keeps the `@medcenter/*` specifiers as-is; map them to the built
# libs so plain `node` resolves them inside the container.
RUN mkdir -p node_modules/@medcenter && \
    for lib in dist/libs/*; do \
      ln -s "../../dist/libs/$(basename "$lib")" "node_modules/@medcenter/$(basename "$lib")"; \
    done
USER node
EXPOSE ${PORT}
ENTRYPOINT ["/sbin/tini", "--"]
# @nx/js:tsc preserves the source layout: src/main.ts -> dist/apps/<APP>/src/main.js.
# `exec` hands PID 2 to node so tini forwards SIGTERM straight to Nest's shutdown hooks.
CMD ["sh", "-c", "exec node \"dist/apps/${APP}/src/main.js\""]
