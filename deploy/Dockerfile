# collaborate.so — production image.
# Two stages: build everything, then ship only the bundled artifacts.
# The server is bundled into one file, so the runtime image carries no
# node_modules at all.

# ---- build stage ------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json build.mjs ./
COPY src ./src
COPY public ./public
RUN npm run build

# ---- runtime stage ----------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Bundled server, the static site (now including vendor/collab.js), and the
# editable room-name blocklist.
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY config ./config

EXPOSE 3000
USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.cjs"]
