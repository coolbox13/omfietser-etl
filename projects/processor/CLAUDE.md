# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is a TypeScript application that processes supermarket product data from multiple chains (AH, Jumbo, Aldi, Plus). The system features parallel processing, ML-powered category prediction, comprehensive validation, and monitoring with issue tracking.

### Entry Points

The application has three main entry points:
- `src/index.ts`: Main CLI processor with parallel processing and monitoring dashboard
- `src/api/index.ts`: HTTP API server for job management and webhooks  
- `src/cli/index.ts`: CLI interface for job management and debugging

### Core Architecture

- **Shop-Specific Processors** (`src/processors/`): AH, Jumbo, Aldi, Plus processors extending base processor with unified product templates
- **Core Services** (`src/core/services/`): Category normalization with ML fallback, validation, issue tracking, progress monitoring
- **Infrastructure** (`src/infrastructure/`): Winston logging with daily rotation, monitoring dashboard, database adapters, error handling
- **API Services** (`src/api/services/`): Job management, webhook handling, monitoring services

### Data Flow

1. **Input**: Raw scraped data in `data_in/` (JSON files per shop: `ah_products.json`, `jumbo_products.json`, etc.)
2. **Processing**: Validation, normalization, category prediction, duplicate detection with parallel batch processing
3. **Output**: Processed products in `data_out/` (JSON files per shop)
4. **Monitoring**: Progress tracking, issue detection, ML fallback analysis in `processed_data/` and `logs/`

## Development Commands

### Build and Development
```bash
# Build TypeScript (copies config files to dist/)
npm run build

# Development servers with file watching
npm run start:dev          # Main processor
npm run start:api:dev      # HTTP API server

# Production builds
npm run process            # Build + run main processor
npm run api               # Build + run API server  
npm run cli               # Build + run CLI interface
```

### Processing Options
```bash
# Direct execution with TypeScript
npm run start             # Main processor
npm run start:api         # HTTP API server
npm run start:cli         # CLI interface

# Process specific shops
npm run start -- --shop ah,jumbo    # Comma-separated shop selection
```

### Testing and Quality
```bash
npm run test              # Run Jest tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report
npm run lint              # ESLint check
```

### Data Utilities  
```bash
npm run validate          # Validate processed data
npm run visualize         # Generate data visualizations
```

## Configuration

### Main Configuration
Configuration is managed through `src/config/default.json`:
- **Directories**: Input (`data_in`), output (`data_out`), intermediate (`processed_data`), logs (`logs`)
- **Shop Settings**: Input files and webshop IDs for AH, Jumbo, Aldi, Plus
- **Processing**: Batch size (100), parallel processing, retry attempts
- **Logging**: Level, console/file output, cleanup settings, retention days

### Environment Variables
Key environment variables for API server:
- `PORT`: Server port (default: 4000)
- `NODE_ENV`: Environment (development/production)
- `LOG_LEVEL`: Logging level
- `LOG_DIR`: Log directory path

## Key Features

### Processing Features
- **Parallel Processing**: Configurable batch processing with worker coordination
- **ML Category Prediction**: Fallback system for unknown product categories with detailed reporting
- **Issue Tracking**: Comprehensive monitoring of parsing failures, validation errors, performance warnings
- **Progress Monitoring**: Real-time CLI dashboard showing memory usage, processing speed, issue counts
- **Data Validation**: Schema validation with Zod, detailed error reporting

### API Features  
- **Job Management**: Create, monitor, cancel processing jobs with database persistence
- **Webhook Support**: Configurable webhooks for job status notifications
- **Progress Tracking**: Real-time job progress with detailed metrics
- **CLI Integration**: Command-line interface for job control and statistics

### CLI Commands
```bash
# Process products
supermarket-processor process -s ah --batch-size 50

# Job management  
supermarket-processor status --job-id <id>
supermarket-processor cancel --job-id <id> --reason "reason"
supermarket-processor stats
```

## Testing

Jest configuration supports:
- TypeScript with ts-jest preset
- Test files in `**/__tests__/**/*.(test|spec).(ts|tsx|js)` pattern
- Setup file: `jest.setup.js`
- Force exit and open handle detection for reliability

Always run tests and linting before commits:
```bash
npm run test && npm run lint
```

## TypeScript Configuration

- **Target**: ES2020 with CommonJS modules
- **Path Mapping**: `@services/*` maps to `core/services/*`
- **Output**: Compiled to `dist/` with source maps and declarations
- **Strict Mode**: Enabled with consistent casing enforcement