# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
ENV AUTH_SECRET="build-placeholder"
ENV OPENAI_API_KEY="build-placeholder"
ENV OPENAI_AGENT_ID="build-placeholder"
ENV WP_URL="https://example.invalid"
ENV WP_USERNAME="build"
ENV WP_APP_PASSWORD="build-placeholder"
ENV ADMIN_EMAIL="build@example.invalid"
ENV ADMIN_PASSWORD_HASH="build-placeholder"
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NODE_PATH=/usr/local/lib/node_modules/prisma/node_modules:/usr/local/lib/node_modules

RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 \
  && npm install -g prisma@7.10.1 \
  && mkdir -p /app/storage/featured-images \
  && chown -R nextjs:nodejs /app/storage

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/scripts/docker-start.mjs ./scripts/docker-start.mjs
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/dotenv ./node_modules/dotenv

USER nextjs
EXPOSE 3000
ENTRYPOINT ["node", "scripts/docker-start.mjs"]
