# Imagen de la aplicación web.
#
# Se construye desde la raíz del monorepo:
#
#   docker build -f apps/mobile/Dockerfile -t social-network-web .
#
# Compila la aplicación y la sirve con nginx. Las direcciones de la API no van
# dentro de la compilación: al arrancar, `40-app-env.sh` escribe `env.js` con
# las variables `APP_*` del contenedor, de modo que la misma imagen vale para
# cualquier despliegue.

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/

RUN npm ci --workspace @social-network/shared --workspace @social-network/mobile --include-workspace-root

COPY packages/shared packages/shared
COPY apps/mobile apps/mobile

RUN npm run build --workspace @social-network/shared \
 && npm run build:prod --workspace @social-network/mobile

FROM nginx:1.31-alpine AS runtime

COPY apps/mobile/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/mobile/docker/app-headers.conf /etc/nginx/snippets/app-headers.conf
COPY apps/mobile/docker/40-app-env.sh /docker-entrypoint.d/40-app-env.sh
COPY --from=build /app/apps/mobile/www /usr/share/nginx/html

RUN chmod +x /docker-entrypoint.d/40-app-env.sh

EXPOSE 80

# La comprobación necesita un intérprete: convierte cualquier fallo en el
# código 1, que es el único que Docker entiende como «no está sano».
# hadolint ignore=DL3025
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/healthz || exit 1
