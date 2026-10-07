# Market engine. Build from the repo root: docker build -f apps/engine/Dockerfile .
FROM node:22-slim
WORKDIR /app

# Install only what the engine (and the shared packages it uses) needs.
COPY package.json package-lock.json ./
COPY apps/engine/package.json apps/engine/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/sim/package.json packages/sim/
RUN npm ci --workspace=@ruggedfun/engine --include-workspace-root

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/engine ./apps/engine

ENV NODE_ENV=production
EXPOSE 3001
# Node is PID 1 (not npx), so SIGTERM reaches the engine and it flushes before exiting.
CMD ["node", "--import", "tsx", "apps/engine/src/index.ts"]
