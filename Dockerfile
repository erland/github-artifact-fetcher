FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm install --no-audit --no-fund --save-dev typescript@~5.9.0 && npm run build
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app
RUN useradd --system --create-home app
COPY --from=builder /app/dist ./dist
COPY package.json ./
USER app
EXPOSE 3000
CMD ["node","dist/server.js"]
