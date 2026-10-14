FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_NO_UPDATE_CHECK=1 HYPERFRAMES_SKIP_SKILLS=1
RUN npm install --global pnpm@11.17.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY src ./src
COPY public ./public
COPY next.config.ts tsconfig.json postcss.config.mjs ./
RUN PROVIDER_MODE=dryrun BRAIN_MODE=mock pnpm build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg chromium ca-certificates fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 \
    HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_NO_UPDATE_CHECK=1 HYPERFRAMES_NO_AUTO_INSTALL=1 \
    HYPERFRAMES_SKIP_SKILLS=1 HYPERFRAMES_BROWSER_PATH=/usr/bin/chromium
# The pinned renderer and migration tools are runtime dependencies, including tsx.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node package.json tsconfig.json next.config.ts ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node deploy/start.sh ./deploy/start.sh
RUN mkdir -p storage .secrets && chown node:node storage .secrets
USER node
EXPOSE 3000
CMD ["sh", "deploy/start.sh"]
