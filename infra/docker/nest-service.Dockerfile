# syntax=docker/dockerfile:1
# Nothing above `ARG APP` in the build stage may depend on APP: `npm ci` runs once and is reused by every image.

ARG NODE_IMAGE=node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402

FROM ${NODE_IMAGE} AS base
RUN apk add --no-cache tini
WORKDIR /app
ENV npm_config_fetch_retries=5 \
    npm_config_fetch_retry_maxtimeout=120000

FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=medcenter-npm,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM base AS build
# Full install: nx, @nx/* executors and typescript are devDependencies.
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=medcenter-npm,target=/root/.npm,sharing=locked \
    npm ci --ignore-scripts --no-audit --no-fund
ENV NX_DAEMON=false \
    NX_NO_CLOUD=true
COPY nx.json tsconfig.base.json ./
COPY libs ./libs
ARG APP
RUN test -n "$APP" || { echo "build-arg APP (Nx project name) is required" >&2; exit 1; }
COPY apps/${APP} ./apps/${APP}
RUN npx nx build "$APP" --skip-nx-cache

FROM base AS runtime
ARG APP
ARG PORT=3000
ENV NODE_ENV=production \
    APP=${APP} \
    PORT=${PORT}
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# @nx/js:tsc keeps the `@medcenter/*` specifiers; link them to the built libs for plain `node`.
RUN mkdir -p node_modules/@medcenter && \
    for lib in dist/libs/*; do \
      ln -s "../../dist/libs/$(basename "$lib")" "node_modules/@medcenter/$(basename "$lib")"; \
    done
USER node
EXPOSE ${PORT}
ENTRYPOINT ["/sbin/tini", "--"]
# `exec` makes node the direct child of tini, so SIGTERM reaches Nest's shutdown hooks.
CMD ["sh", "-c", "exec node \"dist/apps/${APP}/src/main.js\""]
