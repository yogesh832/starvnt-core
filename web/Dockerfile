FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/package.json
COPY server/package.json server/package.json
RUN npm ci -w web
COPY shared ./shared
COPY server/src/common ./server/src/common
COPY web ./web
WORKDIR /app/web
RUN npm run build:vendor

FROM nginx:1.27-alpine
COPY --from=build /app/web/dist-vendor /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
