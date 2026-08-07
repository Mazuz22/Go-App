# Two stages: build the frontend, then bundle it with the server + GNU Go
# into one deployable image. One service, one URL — no CORS/env wiring
# between a separately-hosted frontend and backend.

FROM node:20-bookworm-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends gnugo \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix server ci --omit=dev
COPY server ./server
COPY --from=frontend /app/dist ./dist

ENV PORT=3001
EXPOSE 3001
CMD ["node", "server/index.js"]
