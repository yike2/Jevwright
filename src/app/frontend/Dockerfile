# The frontend: Next.js built with the API URL baked in, served by next start (docs/deploy/frontend-prod.md).
# Build from the repository root, since pnpm's workspace and lockfile live there:
#   docker build -f src/app/frontend/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 .
FROM node:22.23.2-bookworm-slim

# COREPACK_HOME is shared, so the node user runs the pnpm that the build downloaded (as in the backend image).
ENV COREPACK_HOME=/opt/corepack COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

WORKDIR /app
COPY . .
# Scripts are skipped because the root prepare script needs git.
RUN pnpm install --frozen-lockfile --ignore-scripts

# Next.js writes NEXT_PUBLIC_* into the JavaScript at build time, so the API URL is a build argument.
ARG NEXT_PUBLIC_API_URL
RUN test -n "$NEXT_PUBLIC_API_URL" \
  && pnpm --filter @jevwright/frontend build \
  && chmod -R a+rX "$COREPACK_HOME" \
  && chown -R node:node src/app/frontend/.next

USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "@jevwright/frontend", "start"]