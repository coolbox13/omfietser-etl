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

## Additional Context
- System: TypeScript application in Docker container
- Database: PostgreSQL with NOT NULL constraints
- Framework: Express.js API with job management
- Architecture: Async initialization pattern with Promise caching