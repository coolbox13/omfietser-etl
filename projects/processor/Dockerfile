# Multi-stage Docker build for Supermarket Processor
# Optimized for production deployment with health checks

# ================================
# Build stage
# ================================
FROM node:18-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci --only=production=false

# Copy source code
COPY src/ src/

# Build TypeScript to JavaScript
RUN npm run build

# ================================
# Production stage
# ================================
FROM node:18-alpine AS production

# Create non-root user for security
RUN addgroup -g 1001 -S processor && \
    adduser -S processor -u 1001 -G processor

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy any necessary config files
COPY --from=builder /app/src/config/default.json ./dist/config/

# Create required directories
RUN mkdir -p logs input output intermediate && \
    chown -R processor:processor /app

# Switch to non-root user
USER processor

# Expose API port
EXPOSE 4000

# Environment variables with defaults
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0
ENV LOG_LEVEL=info
ENV API_PREFIX=/api/v1
ENV ENABLE_CORS=true
ENV REQUEST_TIMEOUT=30000
ENV MAX_REQUEST_SIZE=10mb
ENV ENABLE_REQUEST_LOGGING=true

# Database configuration
ENV DB_HOST=localhost
ENV DB_PORT=5432
ENV DB_NAME=supermarket_processor
ENV DB_USER=processor
ENV DB_PASSWORD=
ENV DB_SSL=false
ENV DB_POOL_MIN=2
ENV DB_POOL_MAX=10

# Webhook configuration  
ENV WEBHOOK_BASE_URL=http://n8n:5678
ENV WEBHOOK_TIMEOUT=5000
ENV WEBHOOK_RETRY_ATTEMPTS=3

# Output control
ENV OUTPUT_TARGET=both
ENV BATCH_SIZE=100

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node dist/cli/index.js stats || exit 1

# Default command - start API server
CMD ["node", "dist/api/index.js"]

# Labels for metadata
LABEL maintainer="supermarket-processor"
LABEL version="5.0"
LABEL description="Supermarket Product Processor with dual entry points"
LABEL architecture="containerized"

# ================================
# Development stage (optional)
# ================================
FROM node:18-alpine AS development

WORKDIR /app

# Install all dependencies including dev
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci

# Copy source code
COPY src/ src/

# Create directories
RUN mkdir -p logs input output intermediate

# Expose port for development
EXPOSE 4000

# Default to development API server with hot reload
CMD ["npm", "run", "start:api:dev"]