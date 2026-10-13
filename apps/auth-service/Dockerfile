# MedCenter auth-service (Task 001, M0-M6).
FROM node:22-alpine AS base
RUN apk add --no-cache tini
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json nx.json tsconfig.base.json ./
RUN npm ci --omit=dev

FROM base AS build
# Full install on purpose: nx, @nx/* executors and typescript are devDependencies,
# and `npx nx build` (below) cannot run without them.
COPY package.json package-lock.json nx.json tsconfig.base.json ./
RUN npm ci
COPY . .
RUN npx nx build auth-service

FROM base AS run
COPY --from=deps /app/node_modules /app/node_modules
# Full dist: apps/* (entry point) + libs/* (the `@medcenter/*` aliases below).
COPY --from=build /app/dist /app/dist
# @nx/js:tsc keeps `@medcenter/*` specifiers as-is; map them to the built libs
# so plain `node` can resolve them inside the container.
RUN mkdir -p /app/node_modules/@medcenter && \
    for lib in /app/dist/libs/*; do \
      ln -s "../../dist/libs/$(basename "$lib")" "/app/node_modules/@medcenter/$(basename "$lib")"; \
    done
EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001
ENTRYPOINT ["/sbin/tini", "--"]
# @nx/js:tsc preserves the source layout: main.ts -> dist/apps/auth-service/src/main.js.
CMD ["node", "dist/apps/auth-service/src/main.js"]
