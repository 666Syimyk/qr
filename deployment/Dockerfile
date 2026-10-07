# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app

# Each package keeps its own lockfile; this project does not use workspaces.
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm --prefix frontend ci --include=dev
COPY backend/package.json backend/package-lock.json ./backend/
RUN npm --prefix backend ci --include=dev
COPY database/package.json database/package-lock.json ./database/
RUN npm --prefix database ci --include=dev

COPY frontend/ ./frontend/
COPY backend/ ./backend/
COPY database/ ./database/

ARG EXPO_PUBLIC_API_URL=
ARG EXPO_BASE_URL=/
ENV EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL} EXPO_BASE_URL=${EXPO_BASE_URL}
RUN if [ -n "$EXPO_PUBLIC_API_URL" ]; then node -e "const u=new URL(process.env.EXPO_PUBLIC_API_URL); if(u.protocol!=='https:' || u.username || u.password || u.search || u.hash || u.pathname!=='/api/v1') throw new Error('EXPO_PUBLIC_API_URL must be an HTTPS /api/v1 URL');"; fi
RUN npm --prefix frontend run typecheck && npm --prefix backend run typecheck && npm --prefix database run typecheck
RUN npm --prefix frontend run build:web

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app/backend

# tsx is intentionally retained from devDependencies: it runs the TypeScript API.
COPY --from=build /app/backend/package.json /app/backend/package-lock.json ./
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/src ./src
COPY --from=build /app/database/package.json /app/database/package-lock.json /app/database/
COPY --from=build /app/database/src /app/database/src
COPY --from=build /app/database/migrations /app/database/migrations
COPY --from=build /app/frontend/dist /app/frontend/dist

# A fresh named volume inherits this directory's ownership on first creation.
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/v1/health',{signal:AbortSignal.timeout(3000)}).then(async r=>{const b=await r.json();process.exit(r.ok&&b.ok===true&&b.contractVersion==='emergency-qr-v1'?0:1)}).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/index.ts"]
