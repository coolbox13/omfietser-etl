# Changelog

All notable changes to the Omfietser ETL Ecosystem will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Complete N8N-Processor integration with end-to-end workflow automation
- Comprehensive processor test workflows covering all 4 API endpoints
- N8N HTTP request node configuration documentation with working patterns
- Processor database schema validation and automatic table creation
- N8N API programmatic workflow management capabilities
- Comprehensive Claude Code agent ecosystem with 17 specialized agents
- N8N workflow synchronization tools (`sync-workflows.sh`, `backup-workflows.sh`)
- PostgreSQL 18rc1 upgrade for latest database features
- KG-Memory integration for cross-project coordination
- Infrastructure monitoring setup with Prometheus/Grafana
- Database initialization scripts for PostgreSQL
- Agent-specific Claude Code instances in all project directories
- Production-ready AH Scraper workflow with complete error handling

### Changed
- **BREAKING**: N8N port standardized from 5679 to 5678 for consistency
- **BREAKING**: Upgraded PostgreSQL from version 15 to 18rc1-alpine
- N8N workflow parameter passing to use `bodyParameters` instead of `sendJson`
- Processor database schema validation to check `public` schema
- Docker Compose service configuration for improved health checks
- N8N workflow persistence to PostgreSQL backend
- Processor Dockerfile optimization (removed non-existent research/ directory references)
- Port mappings: PostgreSQL (5433), N8N (5678), Processor (4000), Scrapers (8001-8005)

### Fixed
- N8N HTTP request node parameter passing with working `bodyParameters` pattern
- Processor database connection and schema validation errors
- Missing processor database tables (processing_jobs, processing_errors, products, staging_products)
- N8N-Processor webhook integration parameter transmission issues
- Raw products table creation and data insertion for processor workflows
- Claude Code settings validation errors with proper autoApprove patterns
- Docker volume mount issues for N8N exports directory
- N8N workflow synchronization between local JSON files and live workflows
- API key authentication for N8N workflow management
- Container networking and service dependencies
- AH Scraper N8N workflow service endpoint mismatches (ah-scraper-api → ah-scraper)
- N8N webhook routing and completion notification handling
- PostgreSQL credential integration in N8N workflows
- Workflow progress monitoring and email notification system

### Removed
- Outdated N8N workflow JSON files (corrupted during PostgreSQL upgrade)
- Obsolete settings.local.json file
- Unused research/ directory references in Dockerfile

### Infrastructure
- Full Docker stack orchestration with 8 services
- Shared data patterns for inter-service communication
- Environment-based configuration management
- Health check monitoring across all services

### Security
- N8N API key-based authentication
- PostgreSQL user isolation and access controls
- Container network isolation
- Secure credential management in environment variables

## [2024-09-04] - Initial Monorepo Setup

### Added
- Monorepo structure with specialized development contexts
- Processor project (TypeScript) with comprehensive ETL capabilities
- Scrapers project (Python FastAPI) for 5 supermarket chains
- Infrastructure project with shared PostgreSQL and monitoring
- N8N workflows project for ETL orchestration
- Root-level Docker Compose orchestration
- Comprehensive documentation and development guidelines

### Migration
- Clean migration from separate repositories
- Processor migrated from `supermarket-processor/feature/phase-1-structure-template-alignment`
- Scrapers migrated from `n8n_scrapers/one` branch
- Preserved historical archives for reference

---

## Migration Notes

This project was created as a unified monorepo from previously separate components:

1. **Processor**: Previously a standalone TypeScript application
2. **Scrapers**: Previously individual Python services
3. **Workflows**: Previously managed separately in N8N UI

The monorepo approach enables:
- Unified development experience with Claude Code integration
- Shared infrastructure and database schemas
- Coordinated deployment and testing
- Cross-project dependency management through KG-Memory