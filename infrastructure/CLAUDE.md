# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This infrastructure directory is part of the Omfietser ETL monorepo, containing shared infrastructure components for the supermarket product processing ecosystem. The full system orchestrates automated ETL workflows across multiple supermarket chains (AH, Jumbo, Aldi, Plus, Kruidvat) using N8N, PostgreSQL, and containerized processors/scrapers.

### Infrastructure Components

- **PostgreSQL Database** (`postgres/`): Shared database initialization scripts and configuration
- **Shared Data** (`shared-data/`): Runtime data exchange between services including scrape results, job progress, and session management
- **Monitoring** (via docker-compose): Prometheus and Grafana stack for observability

### Data Flow Architecture

The infrastructure supports a complete ETL pipeline:
1. **Scrapers** (Python FastAPI services) collect product data from supermarket websites
2. **Shared Data Directory** acts as the data exchange layer with job management and progress tracking
3. **Processor** (TypeScript) processes raw scraped data with ML-powered categorization and validation
4. **PostgreSQL** stores both processed results and N8N workflow state
5. **N8N** orchestrates the entire pipeline with automated scheduling and webhooks

## Common Infrastructure Commands

### Full Stack Operations
```bash
# Start complete infrastructure stack
docker-compose up -d

# Development mode (database + N8N only)
docker-compose up -d postgres n8n

# Start with monitoring stack
docker-compose --profile monitoring up -d

# View service logs
docker-compose logs -f [service-name]

# Restart specific services
docker-compose restart [service-name]
```

### Database Operations
```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U etl_user -d omfietser_etl

# View database logs
docker-compose logs postgres

# Reset database (WARNING: destroys data)
docker-compose down -v && docker-compose up -d postgres
```

### Service Health Checks
```bash
# Check all service status
docker-compose ps

# View service health
docker-compose exec processor curl -f http://localhost:4000/health

# Monitor scraper APIs
curl http://localhost:8001/health  # AH
curl http://localhost:8002/health  # Jumbo
curl http://localhost:8003/health  # Plus
curl http://localhost:8004/health  # Aldi
curl http://localhost:8005/health  # Kruidvat
```

## Service Architecture

### Core Services Stack
- **PostgreSQL** (port 5432): Primary database for ETL data and N8N workflows
- **N8N** (port 5678): Workflow orchestration engine with PostgreSQL backend
- **Processor API** (port 4000): TypeScript processor with HTTP API and health checks
- **Scrapers** (ports 8001-8005): Python FastAPI services, one per supermarket chain

### Optional Monitoring Stack
- **Prometheus** (port 9090): Metrics collection (profile: monitoring)
- **Grafana** (port 3001): Visualization dashboard (profile: monitoring)

### Shared Data Management

The `shared-data/` directory provides real-time data exchange:
- `results/`: Scraped product data in JSON format per job
- `jobs/`: Job configuration, progress tracking, and status files
- Session management for scraper state persistence

## Environment Configuration

Copy `.env.example` to `.env` and configure:

### Database Settings
```bash
POSTGRES_DB=omfietser_etl
POSTGRES_USER=etl_user  
POSTGRES_PASSWORD=your_secure_password
```

### Service Ports
```bash
PROCESSOR_PORT=4000
SCRAPER_AH_PORT=8001
SCRAPER_JUMBO_PORT=8002
# ... additional scraper ports
```

### N8N Configuration
```bash
N8N_USER=admin
N8N_PASSWORD=your_n8n_password
N8N_WEBHOOK_URL=http://localhost:5678
```

## Development Context Strategy

This infrastructure directory focuses on orchestration and shared services. For component-specific development:

```bash
# Infrastructure orchestration (this context)
cd infrastructure && claude code .

# Processor development (TypeScript/Node.js)
cd projects/processor && claude code .

# Scraper development (Python/FastAPI)
cd projects/scrapers/[scraper-name] && claude code .
```

## Data Processing Workflow

1. **N8N Triggers**: Automated scheduling or webhook-based activation
2. **Scraper Execution**: Python services collect and standardize product data
3. **Data Exchange**: Results stored in `shared-data/` with progress tracking
4. **Processing**: TypeScript processor validates, enriches, and categorizes products
5. **Storage**: Final processed data stored in PostgreSQL with comprehensive logging

The infrastructure ensures reliable data flow between distributed services while maintaining observability and fault tolerance.