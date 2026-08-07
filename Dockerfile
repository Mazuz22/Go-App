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
# Debian installs game packages to /usr/games, which isn't on the default
# PATH for a non-interactive process (only for login shells) — without this,
# Node's spawn('gnugo', ...) in server/gtp.js fails with ENOENT.
ENV PATH="/usr/games:${PATH}"
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix server ci --omit=dev
COPY server ./server
COPY --from=frontend /app/dist ./dist

ENV PORT=3001
EXPOSE 3001
CMD ["node", "server/index.js"]
