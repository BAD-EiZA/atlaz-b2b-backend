# syntax=docker/dockerfile:1

##########
# deps & build (pnpm)
##########
FROM node:22-alpine AS builder
WORKDIR /app

# Prisma needs these on Alpine
RUN apk add --no-cache openssl libc6-compat
# If you’re on an older Prisma that needs OpenSSL 1.1, also add:
# RUN apk add --no-cache openssl1.1-compat

# Enable pnpm via corepack
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

# Cache-friendly copies
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

# Install all deps for build
RUN pnpm install --frozen-lockfile

# Generate Prisma Client (linux-musl)
ENV PRISMA_GENERATE_SKIP_ENV_CHECK=1
RUN pnpm prisma generate

# Build Nest
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN pnpm build

# Prune to production deps only
RUN pnpm prune --prod


################
# runtime
################
FROM node:22-alpine AS runner
WORKDIR /app

# Tiny init + needed libs
RUN apk add --no-cache tini openssl libc6-compat
# If old Prisma needs it:
# RUN apk add --no-cache openssl1.1-compat

# Copy runtime artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# ---- Keep env inside the image (as requested) ----
ENV NODE_ENV=production
ENV PORT=3026
ENV DATABASE_URL="mysql://atlazlms:asm9SPL%21%25%3Fu-@wordpress.c8l8jk9wq1bf.ap-southeast-1.rds.amazonaws.com:3306/db_atlaz_v3_prod"
ENV REDIS_URL="redis://:HerrscherOfVoidAtlaz@31.97.66.222:6379"
ENV REDIS_PREFIX="toefl:"
ENV REDIS_TTL_MS=60000
# Optional: help avoid OOM kills (tune as needed)
ENV NODE_OPTIONS=--max-old-space-size=512

# Run as non-root
USER node

EXPOSE 3026

# Optional healthcheck — change the path if your app differs
HEALTHCHECK --interval=10s --timeout=3s --retries=5 --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3026/health || exit 1

# Use tini so Node gets proper signals and doesn’t “die” on restarts
ENTRYPOINT ["/sbin/tini","--"]

# Prisma client was generated at build time; just start the app
CMD ["node","dist/main.js"]
