# Changelog

All notable changes to this project will be documented in this file.

## [5.2.0] - 2025-09-10
### Added
- **API Request Validation**: Comprehensive request validation using Zod schemas for all POST endpoints
  - Type-safe validation with runtime checking and TypeScript inference
  - Detailed error responses with field-level validation messages
  - Shop type validation against supported retailers (ah, jumbo, aldi, plus, kruidvat)
  - Numeric constraints for batch_size (1-10000) and other parameters
  - Request validation logging for debugging and monitoring
- **Validation Middleware**: Generic `validateRequest()` middleware function for reusable schema validation
- **Comprehensive Test Coverage**: 14 new test cases covering all validation schemas and edge cases

### Enhanced Endpoints
- `POST /jobs` - Job creation with validated shop_type, batch_size, and metadata
- `POST /jobs/:jobId/start` - Job start with optional empty body validation
- `POST /jobs/:jobId/cancel` - Job cancellation with optional reason validation
- `POST /process/:shopType` - Shop processing with parameter validation
- `POST /webhook/n8n` - N8N webhook with required action and shop_type validation

## [5.1.0] - 2025-09-10
### Added
- Configurable acceptance of meta fields during structure validation.
  - Adapter-level flags: `allowExtraMetaFields` (default true), `allowedExtraFields` (default `['job_id','raw_product_id','external_id','schema_version']`).
  - Env-level flags for DB layer: `STRUCTURE_ALLOW_META_FIELDS` (default true), `STRUCTURE_ALLOWED_EXTRA_FIELDS` (comma-separated list).
- Tests for adapter init flow and processing_errors shop_type handling.

### Fixed
- Insert of `processing_errors` now includes `shop_type` to satisfy NOT NULL constraint.
- `processBatch` now defensively waits for adapter initialization to prevent race conditions.

### Changed
- Structure validation flow can ignore whitelisted extra fields while maintaining strict checks on the 32-field UnifiedProduct schema.

