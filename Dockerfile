# The background worker, for Cloud Run (the web app runs on Vercel). See docs/deploy.md.
FROM node:24-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Runtime dependencies only (tsx, which runs the worker from source, is one of them).
RUN CI=1 pnpm install --frozen-lockfile --prod
COPY . .
ENV NODE_ENV=production
# The embedding model downloads here on first start (about 35 MB).
ENV MODEL_CACHE_DIR=/tmp/models
CMD ["pnpm", "worker:start"]
