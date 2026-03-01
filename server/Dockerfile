# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Copy shared source code (types, engine, reports)
COPY ../src/types ./shared/src/types
COPY ../src/lib/engine ./shared/src/lib/engine
COPY ../src/lib/reports ./shared/src/lib/reports
COPY ../src/lib/db/pg-schema.ts ./shared/src/lib/db/pg-schema.ts

# Copy server source
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/shared ./shared

USER nestjs
EXPOSE 4000

CMD ["node", "dist/main"]
