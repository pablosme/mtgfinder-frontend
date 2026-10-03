# Estágio 1: Build
FROM node:22-alpine AS build
WORKDIR /app

# Copia os arquivos de dependência e instala
COPY package*.json ./
RUN npm ci

# Copia o restante do código e faz o build (produção)
COPY . .
RUN npm run build

# Estágio 2: Servidor (Nginx)
FROM nginx:alpine

# ATENÇÃO: Substitua 'nome-do-seu-projeto' pelo nome que está no seu angular.json.
# A partir do Angular 17+, o build gera os arquivos dentro da subpasta /browser.
COPY --from=build /app/dist/mtgfinder-frontend/browser /usr/share/nginx/html

# Ajuste rápido no Nginx para o roteamento interno do Angular (SPA) não dar erro 404
RUN sed -i '/index  index.html index.htm;/a \        try_files $uri $uri/ /index.html;' /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
