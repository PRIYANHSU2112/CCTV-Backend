# ---------- API Container (Default Fallback to Dockerfile.api) ----------
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies first for layer caching
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application source code
COPY src ./src

# Security: Run as non-root user
RUN addgroup -S app && adduser -S app -G app \
    && chown -R app:app /app

USER app

ENV NODE_ENV=production

EXPOSE 5000

CMD ["node", "src/main.js"]