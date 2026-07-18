# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:22-alpine

WORKDIR /usr/src/app

COPY --from=builder --chown=node:nodejs /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:nodejs /usr/src/app/dist ./dist
COPY --from=builder --chown=node:nodejs /usr/src/app/public ./public
COPY --from=builder --chown=node:nodejs /usr/src/app/start.sh ./start.sh
COPY --from=builder --chown=node:nodejs /usr/src/app/ecosystem.config.js ./ecosystem.config.js

USER node

EXPOSE 3000

CMD ["sh", "start.sh"]
