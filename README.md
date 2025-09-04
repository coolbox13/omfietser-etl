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

3. **Development Mode**:
   ```bash
   # Start specific services
   docker-compose up -d postgres n8n
   
   # Develop individual components
   cd projects/processor && npm run dev
   ```

## Migration History

This monorepo was created as a clean migration from separate repositories:
- **Processor**: Migrated from `supermarket-processor/feature/phase-1-structure-template-alignment`
- **Scrapers**: Migrated from `n8n_scrapers/one` branch

Original repositories are preserved as historical archives for reference.

## Components

- **Processor**: Containerized TypeScript application for product data processing
- **Scrapers**: Python-based scrapers for each supermarket chain
- **N8N Workflows**: Automated ETL orchestration workflows
- **Infrastructure**: Shared database, monitoring, and networking components

---

**Migration completed**: $(date)  
**Development focus**: N8N automation ecosystem  
**Backup repositories**: Available for historical reference