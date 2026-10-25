# ---- build: compila TypeScript ----
FROM node:24-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:24-slim
ENV NODE_ENV=production TZ=Europe/Madrid DATA_DIR=/app/data CONFIG_DIR=/app/config
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY config ./config-default
RUN mkdir -p /app/data /app/config && chown -R node:node /app
USER node
# Si el volumen config está vacío, se copia la configuración por defecto
CMD ["sh", "-c", "[ -f /app/config/pickem-sources.json ] || cp /app/config-default/* /app/config/; exec node dist/index.js"]
