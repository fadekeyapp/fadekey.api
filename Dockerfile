FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 fadekey \
  && adduser --system --uid 1001 fadekey

COPY --from=builder /app/package*.json ./

RUN npm ci --include=dev \
  && npm prune --omit=dev \
  && npm cache clean --force

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production

USER fadekey

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
