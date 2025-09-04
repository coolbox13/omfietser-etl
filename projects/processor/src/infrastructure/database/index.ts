// Database infrastructure exports - PostgreSQL adapter and connection management
export * from './types';
export * from './connection';
export * from './postgres-adapter';

// Re-export key interfaces for convenience
export type {
  IDatabaseAdapter,
  DatabaseConfig,
  RawProduct,
  ProcessedProduct,
  ProcessingJob,
  ProcessingError,
  StagingProduct
} from './types';

// Connection factory
import { DatabaseConnection, initializeDatabaseConnection } from './connection';
import { PostgreSQLAdapter } from './postgres-adapter';
import { IDatabaseAdapter } from './types';

let databaseAdapterInstance: IDatabaseAdapter | null = null;

/**
 * Get singleton database adapter instance
 * Initializes connection if not already done
 */
export async function getDatabaseAdapter(): Promise<IDatabaseAdapter> {
  if (!databaseAdapterInstance) {
    const connection = await initializeDatabaseConnection();
    databaseAdapterInstance = new PostgreSQLAdapter(connection);
  }
  
  return databaseAdapterInstance;
}

/**
 * Initialize database adapter with custom configuration
 */
export async function initializeDatabaseAdapter(config?: any): Promise<IDatabaseAdapter> {
  const connection = await initializeDatabaseConnection(config);
  databaseAdapterInstance = new PostgreSQLAdapter(connection);
  return databaseAdapterInstance;
}

/**
 * Close database adapter and connections
 */
export async function closeDatabaseAdapter(): Promise<void> {
  if (databaseAdapterInstance) {
    // Close connections if needed
    databaseAdapterInstance = null;
  }
}

/**
 * Get synchronous database adapter (must be initialized first)
 */
export function getSyncDatabaseAdapter(): IDatabaseAdapter {
  if (!databaseAdapterInstance) {
    throw new Error('Database adapter not initialized. Call initializeDatabaseAdapter() first.');
  }
  return databaseAdapterInstance;
}

/**
 * Reset database adapter instance (useful for testing)
 */
export function resetDatabaseAdapter(): void {
  databaseAdapterInstance = null;
}

// Database health check utility
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  connectionStats?: any;
  error?: string;
}> {
  try {
    const adapter = await getDatabaseAdapter();
    const healthy = await adapter.healthCheck();
    const connectionStats = await adapter.getConnectionStats();
    
    return {
      healthy,
      connectionStats
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}