# Railway builds this image instead of using Railpack/mise (no GitHub download at build time).
# Node 22 matches .nvmrc and engines (>=22.6, needed for --experimental-strip-types in `pnpm demo-db`).
# The full (non-slim) image keeps python3/make/g++ so better-sqlite3 can compile if no prebuilt binary is fetched.
FROM node:22-bookworm

ENV NEXT_TELEMETRY_DISABLED=1 \
    CI=true

# pnpm version pinned to "packageManager" in package.json
RUN npm install -g pnpm@10.16.1

WORKDIR /app

# Dependencies first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/ai/package.json packages/ai/
COPY packages/db/package.json packages/db/
COPY packages/engine/package.json packages/engine/
COPY packages/seed/package.json packages/seed/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV NODE_ENV=production
# The volume is mounted at /data by Railway; scripts/railway-start.sh builds the demo DB there on first boot.
ENV DB_PATH=/data/app.db

# Railway injects PORT; the start script falls back to 3000.
EXPOSE 3000
CMD ["bash", "scripts/railway-start.sh"]
