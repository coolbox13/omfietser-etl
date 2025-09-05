# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is a monorepo containing the Omfietser ETL ecosystem for automated supermarket product processing and N8N workflow orchestration. The system follows a clean separation approach with specialized development contexts:

### Core Components

- **Processor** (`projects/processor/`): Containerized TypeScript application that processes supermarket product data from multiple chains (AH, Jumbo, Aldi, Plus, Kruidvat). Features parallel processing, ML-powered category prediction, validation, and comprehensive monitoring with issue tracking.
- **Scrapers** (`projects/scrapers/`): Python-based scrapers for each supermarket chain, designed to be N8N-compatible with API endpoints for workflow integration.
- **Infrastructure** (`infrastructure/`): Shared PostgreSQL database and monitoring components.
- **N8N Workflows** (`n8n-workflows/`): Automated ETL orchestration workflow definitions.

### Processor Architecture

The processor (`projects/processor/`) is the main TypeScript application with:
- **Entry Points**: `src/index.ts` (CLI processing), `src/api/index.ts` (HTTP API), `src/cli/index.ts` (CLI interface)
- **Shop-Specific Processors**: AH, Jumbo, Aldi, Plus processors with unified product templates
- **Core Services**: Category normalization with ML fallback, validation, issue tracking, progress monitoring
- **Infrastructure**: Logging with Winston, monitoring dashboard, error handling, parallel processing

## Development Context Strategy

### Root Level Development (Docker orchestration, deployment, cross-project integration)
```bash
claude code .  # Use root-level Claude Code instance
```

### Project-Specific Development  
```bash
# For processor development (TypeScript/Node.js focus)
cd projects/processor && claude code .

# For scraper development (Python focus)  
cd projects/scrapers/[scraper-name] && claude code .
```

## Common Development Commands

### Environment Setup
```bash
# Copy and configure environment
cp .env.example .env

# Start full stack with Docker
docker-compose up -d

# Development mode (DB + N8N only)
docker-compose up -d postgres n8n
```

### Processor Development (`projects/processor/`)
```bash
# Build TypeScript
npm run build

# Development servers
npm run start:dev          # Main processor (with file watching)
npm run start:api:dev      # HTTP API server (with file watching)  

# Production commands
npm run start              # Main processor
npm run start:api          # HTTP API server
npm run start:cli          # CLI interface

# Processing with options
npm run start -- --shop ah,jumbo    # Process specific shops

# Testing and Quality
npm run test               # Run Jest tests
npm run test:watch         # Watch mode
npm run test:coverage      # With coverage
npm run lint               # ESLint check

# Data utilities
npm run validate           # Validate processed data
npm run visualize          # Generate data visualizations
```

### Infrastructure Operations
```bash
# Database access
docker-compose exec postgres psql -U etl_user -d omfietser_etl

# View logs
docker-compose logs -f [service-name]

# Service management  
docker-compose restart [service-name]
docker-compose stop [service-name]
```

## File Structure Context

### Processor Key Directories
- `src/processors/`: Shop-specific processing logic (AH, Jumbo, Aldi, Plus)
- `src/core/`: Shared business logic, models, services
- `src/infrastructure/`: Logging, monitoring, database connections
- `src/api/`: HTTP API implementation with webhooks and job management
- `src/cli/`: Command-line interface
- `src/types/`: TypeScript type definitions
- `src/config/`: Configuration management

### Data Flow
1. **Input**: Raw scraped data in `data/input/` (JSON files per shop)
2. **Processing**: Validation, normalization, category prediction, duplicate detection
3. **Output**: Processed products in `data/output/` (JSON files per shop)
4. **Monitoring**: Progress tracking, issue detection, ML fallback analysis
5. **Reports**: Quality reports, issue summaries, processing statistics

### Configuration
- Main config: `projects/processor/src/config/default.json`
- Environment: `.env` (copied from `.env.example`)
- Docker: `docker-compose.yml` for full stack orchestration

## Development Notes

### Processor Features
- **Parallel Processing**: Configurable batch processing with worker threads
- **ML Category Prediction**: Fallback system for unknown product categories
- **Issue Tracking**: Comprehensive monitoring of parsing failures, validation errors
- **Multiple Entry Points**: CLI processing, HTTP API, or direct CLI commands
- **Data Validation**: Schema validation with detailed error reporting
- **Progress Monitoring**: Real-time dashboard with memory usage, processing speed

### Testing
- Jest configuration in `projects/processor/`
- Run tests before commits: `npm run test && npm run lint`
- Coverage reports available: `npm run test:coverage`

### Docker Services
- **postgres**: Database (port 5432)
- **n8n**: Workflow engine (port 5678)  
- **processor**: Main processing application
- **scrapers**: Individual scraper services

When working with the processor, always run `npm run build` before production commands, and use `npm run lint` to maintain code quality.