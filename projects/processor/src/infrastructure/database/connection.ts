// Database connection manager for PostgreSQL with enhanced monitoring and health checks
import { Pool, PoolClient, PoolConfig } from 'pg';
import { getLogger } from '../logging';
import { DatabaseConfig, DatabaseConnectionStats } from './types';

/**
 * Singleton database connection manager for PostgreSQL
 * Provides connection pooling, transactions, health checks, and monitoring
 */
export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private pool: Pool | null = null;
  private config: DatabaseConfig;
  private logger = getLogger();
  private isInitialized = false;

  private constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * Get singleton instance of database connection
   */
  public static getInstance(config?: DatabaseConfig): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      if (!config) {
        throw new Error('Database configuration is required for first initialization');
      }
      DatabaseConnection.instance = new DatabaseConnection(config);
    }
    return DatabaseConnection.instance;
  }

  /**
   * Initialize database connection pool
   */
  public async initialize(): Promise<void> {
    if (this.pool && this.isInitialized) {
      this.logger.warn('Database connection already initialized');
      return;
    }

    const poolConfig: PoolConfig = {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      max: this.config.poolSize || 20,
      min: 2,
      connectionTimeoutMillis: this.config.connectionTimeoutMs || 5000,
      idleTimeoutMillis: this.config.idleTimeoutMs || 30000,
    };

    try {
      this.pool = new Pool(poolConfig);
      
      // Test connection and validate database schema
      const client = await this.pool.connect();
      await this.validateConnection(client);
      client.release();
      
      this.isInitialized = true;
      
      this.logger.info('Database connection initialized successfully', {
        context: {
          host: this.config.host,
          database: this.config.database,
          poolSize: poolConfig.max,
          ssl: !!this.config.ssl
        }
      });

      // Handle pool errors
      this.pool.on('error', (err: Error) => {
        this.logger.error('PostgreSQL pool error', { error: err });
        this.isInitialized = false;
      });

      // Handle pool connection events
      this.pool.on('connect', () => {
        this.logger.debug('New client connected to PostgreSQL pool');
      });

      this.pool.on('remove', () => {
        this.logger.debug('Client removed from PostgreSQL pool');
      });

    } catch (error) {
      this.logger.error('Failed to initialize database connection', { error });
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * Validate database connection and required tables
   */
  private async validateConnection(client: PoolClient): Promise<void> {
    // Test basic connectivity
    await client.query('SELECT 1 as test');
    
    // Validate required schemas exist (processor uses public schema)
    const schemaQuery = `
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name IN ('public')
    `;
    
    const schemaResult = await client.query(schemaQuery);
    const schemas = schemaResult.rows.map(row => row.schema_name);
    
    this.logger.debug('Found database schemas', { schemas });
    
    // Validate key processor tables exist in public schema
    const tablesQuery = `
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_name IN ('products', 'processing_jobs', 'processing_errors', 'staging_products')
    `;
    
    const tablesResult = await client.query(tablesQuery);
    const tables = tablesResult.rows.map(row => `${row.table_schema}.${row.table_name}`);
    
    this.logger.debug('Found database tables', { tables });
    
    // Check that all required processor tables exist
    const requiredTables = ['products', 'processing_jobs', 'processing_errors', 'staging_products'];
    const foundTableNames = tablesResult.rows.map(row => row.table_name);
    const missingTables = requiredTables.filter(table => !foundTableNames.includes(table));
    
    if (missingTables.length > 0) {
      throw new Error(`Missing required processor tables: ${missingTables.join(', ')}. Run database schema initialization.`);
    }
    
    this.logger.info('Database validation completed successfully', { 
      foundTables: tables,
      requiredTables 
    });
  }

  /**
   * Get database client from pool
   */
  public async getClient(): Promise<PoolClient> {
    if (!this.pool || !this.isInitialized) {
      throw new Error('Database connection not initialized. Call initialize() first.');
    }
    
    try {
      const client = await this.pool.connect();
      return client;
    } catch (error) {
      this.logger.error('Failed to get database client', { error });
      throw error;
    }
  }

  /**
   * Execute query with automatic client management
   */
  public async query(text: string, params?: any[]): Promise<any> {
    const client = await this.getClient();
    
    try {
      const start = Date.now();
      const result = await client.query(text, params);
      const duration = Date.now() - start;
      
      this.logger.debug('Database query executed', {
        context: {
          query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
          duration,
          rowCount: result.rowCount,
          paramCount: params?.length || 0
        }
      });
      
      return result;
    } catch (error) {
      this.logger.error('Database query failed', {
        context: { 
          query: text.substring(0, 200),
          paramCount: params?.length || 0 
        },
        error
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    const transactionId = Math.random().toString(36).substring(7);
    
    try {
      await client.query('BEGIN');
      this.logger.debug('Database transaction started', { transactionId });
      
      const result = await callback(client);
      
      await client.query('COMMIT');
      this.logger.debug('Database transaction committed', { transactionId });
      
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Database transaction rolled back', { 
        transactionId,
        error 
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute batch operations in transaction
   */
  public async batchTransaction<T>(
    operations: ((client: PoolClient) => Promise<T>)[]
  ): Promise<T[]> {
    return await this.transaction(async (client) => {
      const results: T[] = [];
      
      for (const operation of operations) {
        const result = await operation(client);
        results.push(result);
      }
      
      return results;
    });
  }

  /**
   * Health check with detailed diagnostics
   */
  public async healthCheck(): Promise<boolean> {
    try {
      if (!this.pool || !this.isInitialized) {
        this.logger.warn('Database health check failed: not initialized');
        return false;
      }
      
      const client = await this.pool.connect();
      
      // Test basic query
      await client.query('SELECT 1 as health_check');
      
      // Test transaction capability
      await client.query('BEGIN');
      await client.query('SELECT 1 as transaction_test');
      await client.query('ROLLBACK');
      
      client.release();
      
      this.logger.debug('Database health check passed');
      return true;
    } catch (error) {
      this.logger.error('Database health check failed', { error });
      return false;
    }
  }

  /**
   * Get detailed connection pool statistics
   */
  public async getConnectionStats(): Promise<DatabaseConnectionStats | null> {
    if (!this.pool) {
      return null;
    }

    try {
      return {
        totalConnections: this.pool.totalCount,
        idleConnections: this.pool.idleCount,
        waitingClients: this.pool.waitingCount,
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount
      };
    } catch (error) {
      this.logger.error('Failed to get connection stats', { error });
      return null;
    }
  }

  /**
   * Check if connection is ready
   */
  public isReady(): boolean {
    return !!(this.pool && this.isInitialized);
  }

  /**
   * Gracefully close all connections
   */
  public async close(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.end();
        this.pool = null;
        this.isInitialized = false;
        this.logger.info('Database connection pool closed successfully');
      } catch (error) {
        this.logger.error('Error closing database connection pool', { error });
        throw error;
      }
    }
  }

  /**
   * Get current configuration (without sensitive data)
   */
  public getConfig(): Omit<DatabaseConfig, 'password'> {
    const { password, ...safeConfig } = this.config;
    return safeConfig;
  }

  /**
   * Create database configuration from environment variables
   */
  public static createConfigFromEnv(): DatabaseConfig {
    const requiredEnvVars = ['POSTGRES_HOST', 'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD'];
    const missing = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    return {
      host: process.env.POSTGRES_HOST!,
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_DB!,
      username: process.env.POSTGRES_USER!,
      password: process.env.POSTGRES_PASSWORD!,
      ssl: process.env.POSTGRES_SSL === 'true',
      poolSize: parseInt(process.env.POSTGRES_POOL_SIZE || '20', 10),
      connectionTimeoutMs: parseInt(process.env.POSTGRES_CONNECTION_TIMEOUT || '5000', 10),
      idleTimeoutMs: parseInt(process.env.POSTGRES_IDLE_TIMEOUT || '30000', 10)
    };
  }

  /**
   * Create test configuration for unit tests
   */
  public static createTestConfig(): DatabaseConfig {
    return {
      host: process.env.TEST_POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.TEST_POSTGRES_PORT || '5432', 10),
      database: process.env.TEST_POSTGRES_DB || 'scraper_test',
      username: process.env.TEST_POSTGRES_USER || 'scraper_test',
      password: process.env.TEST_POSTGRES_PASSWORD || 'scraper_test',
      ssl: false,
      poolSize: 5,
      connectionTimeoutMs: 3000,
      idleTimeoutMs: 10000
    };
  }
}

/**
 * Global cleanup function for graceful shutdown
 */
export async function closeDatabaseConnection(): Promise<void> {
  try {
    const instance = DatabaseConnection.getInstance();
    await instance.close();
  } catch (error) {
    // Instance might not exist, which is fine during shutdown
    console.error('Error during database connection cleanup:', error);
  }
}

/**
 * Initialize database connection with configuration
 */
export async function initializeDatabaseConnection(config?: DatabaseConfig): Promise<DatabaseConnection> {
  const dbConfig = config || DatabaseConnection.createConfigFromEnv();
  const connection = DatabaseConnection.getInstance(dbConfig);
  await connection.initialize();
  return connection;
}