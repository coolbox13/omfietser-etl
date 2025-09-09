# Omfietser ETL Ecosystem

A unified monorepo containing all components of the Omfietser ETL pipeline for automated supermarket product processing and N8N workflow orchestration.

## Architecture

This monorepo follows a clean separation approach with specialized development contexts:

```
omfietser-etl/
├── .claude/                    # Root Claude Code instance - orchestration focus
├── projects/
│   ├── processor/              # Containerized supermarket processor
│   │   └── .claude/           # Processor-specific Claude Code instance
│   └── scrapers/              # N8N-ready scrapers
│       ├── ah-scraper/
│       ├── jumbo-scraper/
│       ├── aldi-scraper/
│       ├── plus-scraper/
│       └── kruidvat-scraper/
├── infrastructure/            # Shared infrastructure components
│   ├── postgres/
│   ├── monitoring/
│   └── nginx/
├── n8n-workflows/            # N8N workflow definitions
├── docs/                     # Unified documentation
├── docker-compose.yml        # Master orchestration
└── .env.example             # Environment template
```

## Development Workflow

### Root Level (Docker orchestration, deployment, cross-project integration)
```bash
# Use root Claude Code instance
claude code .
```

### Project-Specific Development
```bash
# For processor development
cd projects/processor
claude code .

# For scraper development  
cd projects/scrapers/ah-scraper
claude code .
```

## Quick Start

1. **Environment Setup**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

2. **Start Full Stack**:
   ```bash
   docker-compose up -d
   ```
   **Services Available:**
   - N8N Workflow Engine: http://localhost:5679
   - Processor API: http://localhost:4000
   - PostgreSQL: localhost:5433
   - Scrapers: http://localhost:8001-8005

3. **Development Mode**:
   ```bash
   # Start core services only
   docker-compose up -d postgres n8n
   
   # Develop individual components
   cd projects/processor && npm run start:dev
   ```

## Migration History

This monorepo was created as a clean migration from separate repositories:
- **Processor**: Migrated from `supermarket-processor/feature/phase-1-structure-template-alignment`
- **Scrapers**: Migrated from `n8n_scrapers/one` branch

Original repositories are preserved as historical archives for reference.

## Components

### Core Services
- **Processor** (`projects/processor/`): Containerized TypeScript application with Express.js API, ML-powered categorization, and comprehensive validation
- **Scrapers** (`projects/scrapers/`): Python FastAPI services for 5 supermarket chains (AH, Jumbo, Aldi, Plus, Kruidvat)
- **N8N Workflows** (`n8n-workflows/`): Automated ETL orchestration with webhook integration and progress monitoring
- **Infrastructure** (`infrastructure/`): Shared PostgreSQL 18rc1, monitoring stack, and networking components

### New Features
- **Claude Code Integration**: 17 specialized agents for focused development contexts
- **KG-Memory Coordination**: Cross-project dependency management and knowledge sharing
- **Workflow Synchronization**: Tools for keeping local N8N workflow definitions in sync
- **Monitoring Stack**: Optional Prometheus/Grafana for observability

## Recent Updates

- ✅ **N8N Workflow Repair**: Fixed AH Scraper workflow with proper service endpoints and webhook handling
- ✅ **PostgreSQL 18rc1**: Upgraded to latest database version
- ✅ **Agent Ecosystem**: Complete Claude Code agent implementation
- ✅ **Workflow Tools**: N8N synchronization and backup scripts
- ✅ **Container Orchestration**: Full 8-service Docker stack
- ✅ **N8N Integration**: Tested end-to-end workflow execution with email notifications

## Documentation

- `CHANGELOG.md`: Detailed change history
- `KG_MEMORY_REFERENCE.md`: Knowledge graph initialization guide
- Project-specific `CLAUDE.md` files in each directory
- Docker Compose service documentation

---

**Latest Update**: September 2024  
**Development Focus**: Unified ETL automation with AI-powered development assistance  
**Database**: PostgreSQL 18rc1 with comprehensive schema management  
**Workflow Status**: Production-ready N8N workflows with automated scraping and processing