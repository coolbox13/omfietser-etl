# Plus Scraper API - Production Dockerfile
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p /app/jobs /app/results /app/logs /app/shared-data

# Set permissions
RUN chmod +x /app/*.py

# Create non-root user for security
RUN useradd -m -u 1000 scraperuser && \
    chown -R scraperuser:scraperuser /app
USER scraperuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["uvicorn", "scraper_api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
