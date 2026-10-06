# MedCenter auth-service (Task 001, M0-M6).
FROM node:22-alpine AS base
RUN apk add --no-cache tini
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json nx.json tsconfig.base.json ./
RUN npm ci --omit=dev

FROM base AS build
COPY --from=deps /app/node_modules /app/node_modules
COPY . .
RUN npx nx build auth-service

FROM base AS run
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=build /app/dist/apps/auth-service /app/dist
EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
