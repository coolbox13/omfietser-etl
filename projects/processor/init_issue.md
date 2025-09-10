# DatabaseProcessorAdapter Initialization Issue

## Problem Summary

The processor is experiencing 100% job failure rates due to "Adapter not fully initialized" errors in the `DatabaseProcessorAdapter`. This causes PostgreSQL constraint violations because error records are being inserted with `shop_type = null`.

## Root Cause Analysis

### Primary Issue
The `DatabaseProcessorAdapter.waitForInitialization()` method is not properly waiting for adapter initialization to complete before `processBatch()` is called, resulting in the adapter being in an uninitialized state.

### Error Sequence
1. Job manager creates `DatabaseProcessorAdapter` instance
2. Constructor calls `this.initializeAdapter()` (not awaited)
3. Job manager calls `adapter.waitForInitialization()`
4. Job manager immediately calls `adapter.processBatch(rawProducts)`
5. `processBatch()` fails with "Adapter not fully initialized"
6. Error records are created with `shop_type = null` (because `this.config.shopType` is undefined)
7. PostgreSQL throws constraint violation (code 23502) on NOT NULL `shop_type` column

### Evidence from Logs
```
"Failing row contains (..., null, BATCH_PROCESSING_FAILURE, null, high, Adapter not fully initialized, null, ...)"
"code":"23502","column":"shop_type" - PostgreSQL NOT NULL constraint violation
```

### Initialization Flow Analysis
```typescript
// Constructor (src/adapters/database-processor-adapter.ts:78)
this.initializeAdapter(); // Called synchronously, not awaited

// waitForInitialization method
public async waitForInitialization(): Promise<void> {
  return this.initializeAdapter(); // Returns existing promise or creates new one
}

// processBatch validation (lines 164-179)
if (!this.initialized || !this.processorInstance || !this.dbAdapter) {
  throw new Error('Adapter not fully initialized');
}
```

## Files Involved

### Primary Files
- `/Users/hermanhello/Documents/a_omfietser/omfietser-etl/projects/processor/src/adapters/database-processor-adapter.ts`
  - Lines 78, 83-111 (initialization logic)
  - Lines 164-179 (validation that's failing)

- `/Users/hermanhello/Documents/a_omfietser/omfietser-etl/projects/processor/src/api/services/job-manager.ts`  
  - Adapter creation and `waitForInitialization()` call in `processProductBatch` method

### Supporting Files
- `/Users/hermanhello/Documents/a_omfietser/omfietser-etl/projects/processor/src/infrastructure/database/postgres-adapter.ts`
  - Contains SQL operator errors that compound the issue

## Investigation Findings

### What's Working
- Adapter constructor completes without throwing
- `getDatabaseAdapter()` function exists and is callable
- Shop type validation passes ("ah" is valid)
- Job creation and management works properly

### What's Failing
- One or more of these conditions in `processBatch()`:
  - `this.initialized` is false
  - `this.processorInstance` is null  
  - `this.dbAdapter` is null

### Debugging Attempts
- Added comprehensive TRACE logging to initialization flow
- TRACE logs are not appearing, suggesting:
  - Initialization fails before reaching log statements, OR
  - Logger configuration issue, OR
  - Race condition where logs are lost

## Possible Root Causes

### 1. Async Initialization Race Condition
The `initializationPromise` pattern may have a timing issue where `waitForInitialization()` returns before actual initialization completes.

### 2. getDatabaseAdapter() Failure
The `await getDatabaseAdapter()` call in `initializeAdapter()` may be throwing an exception that's not being properly logged.

### 3. initializeProcessor() Failure
The `getProcessorClass()` or processor instantiation may be failing silently.

### 4. Promise Handling Issue
The Promise-based initialization may not be properly awaited in the job manager.

## Recommended Investigation Steps

1. **Fix Promise Handling**: Ensure `waitForInitialization()` actually waits for initialization to complete
2. **Add Error Handling**: Wrap `getDatabaseAdapter()` and `initializeProcessor()` calls with explicit error logging
3. **Debug State Values**: Log the exact values of `initialized`, `processorInstance`, and `dbAdapter` when validation fails
4. **Check Database Connection**: Verify that `getDatabaseAdapter()` can successfully connect to PostgreSQL
5. **Verify Processor Classes**: Ensure AH processor class can be instantiated without errors

## Expected Behavior
After initialization, the adapter should have:
- `this.initialized = true`
- `this.processorInstance` = valid AHProcessor instance
- `this.dbAdapter` = valid database adapter instance

## Test Case
Create a minimal test that:
1. Creates DatabaseProcessorAdapter with valid config
2. Calls `waitForInitialization()`
3. Verifies all three state variables are properly set
4. Calls `processBatch()` with minimal raw product data

## Resolution Summary

- Ensured the adapter always awaits initialization at the start of processing to eliminate race conditions.
- Fixed database inserts for processing_errors to include the NOT NULL shop_type column, removing 23502 constraint violations.

### Code Changes

1) Defensive initialization inside processing
- File: src/adapters/database-processor-adapter.ts
- Change: processBatch now calls await this.waitForInitialization() before any validation or processing.

2) Include shop_type in processing_errors inserts (single and batch)
- File: src/infrastructure/database/postgres-adapter.ts
- Change: Updated INSERT columns to include shop_type and mapped parameters accordingly in:
  - insertProcessingError
  - insertProcessingErrors

### Why this fixes the issue
- The implicit await in processBatch prevents any timing gap between construction and first use, even if the caller forgets to await waitForInitialization().
- The processing_errors table declares shop_type NOT NULL; inserts now explicitly provide it, preventing 23502 violations and allowing proper error recording.

## Verification

### 1) Smoke test (CLI)
Attempted: npm run cli -- process --shop-type ah --batch-size 5

- Result on this machine: Failed early due to missing DB environment variables.
- To run locally, set the following env vars and retry:
  - POSTGRES_HOST, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD

Example (replace placeholders):
- POSTGRES_HOST={{POSTGRES_HOST}}
- POSTGRES_DB={{POSTGRES_DB}}
- POSTGRES_USER={{POSTGRES_USER}}
- POSTGRES_PASSWORD={{POSTGRES_PASSWORD}}

Command:
- npm run cli -- process --shop-type ah --batch-size 5

Expected:
- No "Adapter not fully initialized" errors
- Any batch errors are recorded successfully without NOT NULL violations on processing_errors.shop_type

Attempt notes:
- Tried an override with POSTGRES_HOST=localhost to reach a locally exposed DB port. Result: connection refused (ECONNREFUSED). Ensure the PostgreSQL service is running and accessible on the host/port defined in .env (or use docker compose to start services and verify port mappings).

### 2) Unit tests added
- src/__tests__/adapters/database-processor-adapter.init-flow.test.ts
  - Validates processBatch works even without explicitly awaiting waitForInitialization().

- src/__tests__/infrastructure/database/postgres-adapter-processing-errors.test.ts
  - Verifies SQL and params for processing_errors inserts include shop_type for both single and batch inserts.

Run:
- npm test -- database-processor-adapter.init-flow
- npm test -- postgres-adapter-processing-errors

Note: Running the entire test suite currently shows 1 failing spec in existing tests (structure validation rejection expectation). This pre-existing test expects processBatch to throw, but current processBatch returns a result with errors after catching. If you want, I can align that test with the implemented behavior.

## Next Steps
- Provide DB env variables to run the CLI/API smoke test against a real PostgreSQL instance.
- Optionally update the failing legacy test to assert returned error results instead of expecting a thrown error.

## Additional Context
- System: TypeScript application in Docker container
- Database: PostgreSQL with NOT NULL constraints
- Framework: Express.js API with job management
- Architecture: Async initialization pattern with Promise caching