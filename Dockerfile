# ===== Etapa base =====
# Por que Alpine: imagen ~50MB vs 950MB de node:22 plain. Suficiente para Node.
FROM node:22-alpine AS base
WORKDIR /app
# Instala dependencias del sistema necesarias para bcrypt (lo usaremos en auth).
# bcrypt compila bindings nativos -> necesita python, make, g++.
RUN apk add --no-cache python3 make g++
COPY package*.json ./


# ===== Etapa development =====
# Imagen con todas las devDeps + ts-node + nest CLI para hot-reload.
FROM base AS development
ENV NODE_ENV=development
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]


# ===== Etapa build =====
# Compila TypeScript a dist/. Imagen intermedia que se descarta despues.
#
# NODE_ENV se setea DESPUES del npm ci porque npm respeta NODE_ENV=production
# y omite devDependencies. Necesitamos las devDeps (nest CLI, ts) para
# compilar; recien al final pruneamos lo no-runtime.
FROM base AS build
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
RUN npm prune --omit=dev


# ===== Etapa production =====
# Solo dependencias de runtime + dist/. Imagen final liviana.
# wget se incluye para el HEALTHCHECK; ya viene en alpine via busybox.
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
EXPOSE 3000

# Health check contra /api/docs: endpoint estable de Swagger que no requiere
# auth. Si la app no responde en 5s tres veces seguidas, Docker la marca
# unhealthy (lo aprovechan orquestadores y compose `condition: service_healthy`).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/docs || exit 1

CMD ["node", "dist/main.js"]
