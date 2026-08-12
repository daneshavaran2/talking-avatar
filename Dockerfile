# ── مرحلهٔ وابستگی‌ها ────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* ./
RUN npm ci

# ── مرحلهٔ ساخت ──────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# ── مرحلهٔ اجرا ──────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next

RUN mkdir -p /app/storage && chown -R nextjs:nodejs /app/storage

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

# مهاجرت پایگاه داده پیش از بالا آمدن اپلیکیشن اجرا می‌شود.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
