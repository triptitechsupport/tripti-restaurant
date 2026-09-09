FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/pocketbase/package.json apps/pocketbase/package.json
RUN npm ci
COPY apps/web/ apps/web/
RUN npm run build --workspace=web

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends nginx gettext-base curl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/pocketbase/package.json apps/pocketbase/package.json
RUN npm ci --omit=dev
COPY apps/api/src/ apps/api/src/
COPY apps/pocketbase/pocketbase apps/pocketbase/pocketbase
COPY apps/pocketbase/pb_migrations/ apps/pocketbase/pb_migrations/
COPY apps/pocketbase/pb_hooks/ apps/pocketbase/pb_hooks/
COPY --from=build /app/dist/apps/web/ /app/dist/apps/web/
COPY deploy/ deploy/
RUN chmod +x apps/pocketbase/pocketbase && sed -i 's/\r$//' deploy/start.sh \
    && chmod +x deploy/start.sh && mkdir -p /data
ENV NODE_ENV=production PORT=10000 FISKALY_ENVIRONMENT=TEST FISKALY_ENABLED=false
EXPOSE 10000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/deploy/start.sh"]
