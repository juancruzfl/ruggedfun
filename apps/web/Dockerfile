# Website. Build from the repo root: docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_ENGINE_URL=... .
FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/engine/package.json apps/engine/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/sim/package.json packages/sim/
RUN npm ci --workspace=@ruggedfun/web --include-workspace-root

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web

# Browser-side settings are baked in at build time.
ARG NEXT_PUBLIC_ENGINE_URL
ENV NEXT_PUBLIC_ENGINE_URL=$NEXT_PUBLIC_ENGINE_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=@ruggedfun/web

ENV NODE_ENV=production
WORKDIR /app/apps/web
EXPOSE 3000
# `next start` listens on $PORT.
CMD ["node", "../../node_modules/next/dist/bin/next", "start"]
