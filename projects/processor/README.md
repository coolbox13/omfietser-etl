# Supermarket Processor (Database-driven)

This project processes supermarket product data with strict structure validation (32-field UnifiedProduct) and stores results in PostgreSQL. It exposes both a CLI and an HTTP API.

Key capabilities
- Strict structure enforcement for a unified product schema
- Database-backed batch processing with staging and processed tables
- Configurable acceptance of additional metadata fields alongside the strict schema
- Robust API request validation using Zod schemas with detailed error reporting

Configuration: structure validation and meta fields
- By default, the validator enforces EXACT structure compliance. However, you may choose to accept a whitelist of additional metadata fields (useful during ETL, debugging, or schema evolution).

Runtime environment variables (server/DB layer)
- STRUCTURE_ALLOW_META_FIELDS: "true" | "false" (default: true)
- STRUCTURE_ALLOWED_EXTRA_FIELDS: Comma-separated list of extra fields to allow (default: job_id,raw_product_id,external_id,schema_version)

Per-job adapter configuration (CLI/API job runs)
- allowExtraMetaFields?: boolean (default: true)
- allowedExtraFields?: string[] (default: ["job_id","raw_product_id","external_id","schema_version"])

Example: run CLI against local DB
- POSTGRES_HOST=localhost POSTGRES_PORT=5433 npm run -s cli -- process --shop-type ah --batch-size 5

Notes
- If STRUCTURE_ALLOW_META_FIELDS is set to false, extra fields will be flagged unless included in allowedExtraFields at the adapter layer.
- Structure validation still enforces all 32 UnifiedProduct fields.

## API Validation

The HTTP API features comprehensive request validation powered by Zod schemas:

### Validated Endpoints
- `POST /jobs` - Job creation with shop_type validation and optional batch_size/metadata
- `POST /jobs/:jobId/start` - Job start requests (empty body allowed)
- `POST /jobs/:jobId/cancel` - Job cancellation with optional reason
- `POST /process/:shopType` - Shop processing with optional parameters
- `POST /webhook/n8n` - N8N webhook integration with required action/shop_type

### Features
- **Type-safe validation**: Runtime validation with TypeScript inference
- **Detailed error responses**: Field-level error messages with validation context
- **Shop type enforcement**: Validates against supported shops (ah, jumbo, aldi, plus, kruidvat)
- **Numeric constraints**: Enforces valid ranges for batch_size (1-10000) and other numeric fields
- **Request logging**: Validation failures are logged for debugging and monitoring

Development scripts
- Build: npm run build
- API (build+run): npm run api
- CLI (build+run): npm run cli
- Tests: npm test
- Lint: npm run lint
