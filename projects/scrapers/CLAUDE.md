# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Scrapers Directory Context

This directory contains Python-based scrapers for Dutch supermarket chains, designed as N8N-compatible microservices. Each scraper is a containerized FastAPI application that provides REST endpoints for automated product data extraction.

## Architecture

### Scraper Components
- **ah-scraper/**: Albert Heijn scraper with product catalog and category extraction
- **jumbo-scraper/**: Jumbo supermarket scraper with advanced session management
- **aldi-scraper/**: Aldi scraper for discount product data
- **plus-scraper/**: Plus supermarket scraper
- **kruidvat-scraper/**: Kruidvat pharmacy/convenience store scraper with authentication

### Common Structure (per scraper)
```
[chain]-scraper/
├── scraper_api.py          # FastAPI REST API server
├── [chain]_scraper.py      # Core scraping logic
├── config_utils.py         # Configuration and environment handling
├── progress_monitor.py     # Job status tracking
├── requirements.txt        # Python dependencies
└── Dockerfile             # Container configuration
```

## Development Commands

### Individual Scraper Development
```bash
# Navigate to specific scraper
cd ah-scraper

# Install dependencies locally
pip install -r requirements.txt

# Run scraper API server
python scraper_api.py
# or
uvicorn scraper_api:app --host 0.0.0.0 --port 8000 --reload

# Test scraper directly (if standalone script exists)
python ah_scraper.py
```

### Docker Development
```bash
# Build specific scraper
docker build -t omfietser-ah-scraper ./ah-scraper

# Run individual scraper container
docker run -p 8000:8000 omfietser-ah-scraper

# View container logs
docker logs [container-id]
```

### API Testing
```bash
# Health check
curl http://localhost:8000/health

# Start scraping job
curl -X POST http://localhost:8000/scrape \
  -H "Content-Type: application/json" \
  -d '{"max_products": 100, "categories_limit": 5}'

# Check job status
curl http://localhost:8000/jobs/[job-id]

# Get results
curl http://localhost:8000/jobs/[job-id]/results
```

## Key Features

### FastAPI REST API
- **Asynchronous Processing**: Background job execution with job tracking
- **N8N Integration**: Webhook support for workflow automation
- **Health Monitoring**: Built-in health checks and status endpoints
- **Job Management**: Create, monitor, and retrieve scraping jobs
- **Results Export**: JSON output with structured product data

### Shared Utilities
- **progress_monitor.py**: Standardized job status tracking across all scrapers
- **config_utils.py**: Environment variable management and configuration loading
- **Common Dependencies**: FastAPI, aiohttp, pydantic for consistent API behavior

### Containerization
- **Production-Ready**: Multi-stage Docker builds with security best practices
- **Non-root User**: Security-hardened containers running as unprivileged user
- **Health Checks**: Built-in container health monitoring
- **Resource Optimization**: Slim base images and optimized dependency installation

## API Endpoints (Standard across scrapers)

### Core Endpoints
- `GET /health` - Health check and service status
- `POST /scrape` - Start new scraping job
- `GET /jobs` - List all jobs
- `GET /jobs/{job_id}` - Get specific job status
- `GET /jobs/{job_id}/results` - Download job results
- `DELETE /jobs/{job_id}` - Cancel/delete job

### Request Parameters
- `max_products`: Maximum number of products to scrape (optional)
- `categories_limit`: Limit number of categories (optional)  
- `webhook_url`: N8N webhook for completion notification (optional)
- `priority`: Job priority level (low|normal|high)

## Development Notes

### Authentication Requirements
- **Kruidvat**: Requires working authentication cookies and sensor data (see `kruidvat_auth_config.json`)
- **Others**: Generally work with standard HTTP requests and session management

### Data Output Format
All scrapers output standardized JSON with fields:
- `id`: Unique product identifier
- `name`: Product name
- `price`: Current price information
- `category`: Product category
- `brand`: Brand name
- `description`: Product description
- `image_url`: Product image URL
- `url`: Product page URL

### Error Handling
- Robust session management with automatic retry logic
- Rate limiting to respect website terms of service
- Progress tracking for long-running scraping jobs
- Comprehensive error logging and status reporting

## Integration with N8N

Each scraper is designed to work seamlessly with N8N workflows:
- REST API endpoints for triggering scrapes
- Webhook callbacks for job completion notifications
- Standardized response formats for workflow integration
- Docker containers ready for N8N deployment

Use the root-level `docker-compose.yml` to run scrapers as part of the full ETL pipeline, or run individual scrapers for development and testing.