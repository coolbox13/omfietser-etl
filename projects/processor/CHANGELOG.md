# Changelog

All notable changes to this project will be documented in this file.

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

