# The backend on the Playwright image, whose Chromium matches the pinned playwright package (backend.md 1.9).
# Build from the repository root, since the backend runs Core from src/core:
#   docker build -f src/app/backend/Dockerfile .
FROM node:22.23.2-bookworm-slim AS node

FROM mcr.microsoft.com/playwright:v1.64.1-noble
# The Playwright image ships a newer Node; the project runs on Node 22 (.nvmrc), so Node 22 and its corepack go
# first on PATH. COREPACK_HOME is shared, so pwuser runs the pnpm that the build downloaded.
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/corepack
ENV COREPACK_HOME=/opt/corepack COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN ln -s ../lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack && corepack enable

WORKDIR /app
COPY . .
# Scripts are skipped because the root prepare script needs git; the Prisma Client is generated explicitly instead.
# Dev dependencies stay: the backend runs from source with tsx, and prisma migrate deploy runs at start.
RUN pnpm install --frozen-lockfile --ignore-scripts \
  && pnpm --filter @jevwright/backend exec prisma generate \
  && chmod -R a+rX "$COREPACK_HOME" \
  && mkdir -p /data/runs \
  && chown pwuser:pwuser /data/runs

USER pwuser
ENV RUNS_DIR=/data/runs PORT=4000
EXPOSE 4000
CMD ["sh", "-c", "pnpm --filter @jevwright/backend exec prisma migrate deploy && exec pnpm --filter @jevwright/backend start"]
