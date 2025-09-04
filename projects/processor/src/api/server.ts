// HTTP API server for Supermarket Processor
import express, { Request, Response, NextFunction } from 'express';
import { getLogger } from '../infrastructure/logging';
import { initializeDatabaseAdapter, closeDatabaseAdapter, getSyncDatabaseAdapter } from '../infrastructure/database';
import { initializeJobManager, getJobManager } from './services/job-manager';
import { createApiRoutes } from './routes';
import { createMiddleware } from './middleware';
import { WebhookService } from './services/webhook-service';
import { createMonitoringService, createDefaultMonitoringConfig } from './services/monitoring-service';

export interface ServerConfig {
  port: number;
  host: string;
  apiPrefix: string;
  enableCors: boolean;
  requestTimeoutMs: number;
  maxRequestSizeBytes: string;
  enableRequestLogging: boolean;
}

export class ApiServer {
  private app: express.Application;
  private server: any;
  private config: ServerConfig;
  private logger = getLogger();
  private webhookService: WebhookService | null = null;
  private monitoringService: any = null;

  constructor(config: ServerConfig) {
    this.config = config;
    this.app = express();
    this.setupApplication();
  }

  private setupApplication(): void {
    // Basic middleware
    this.app.use(express.json({ limit: this.config.maxRequestSizeBytes }));
    this.app.use(express.urlencoded({ extended: true, limit: this.config.maxRequestSizeBytes }));

    // Custom middleware
    const middleware = createMiddleware({
      enableCors: this.config.enableCors,
      requestTimeoutMs: this.config.requestTimeoutMs,
      enableRequestLogging: this.config.enableRequestLogging
    });

    this.app.use(middleware.cors);
    this.app.use(middleware.timeout);
    this.app.use(middleware.requestLogging);
    this.app.use(middleware.errorHandler);

    // API routes
    const apiRoutes = createApiRoutes();
    this.app.use(this.config.apiPrefix, apiRoutes);

    // Health check endpoint (outside of API prefix for load balancers)
    this.app.get('/health', this.healthCheck.bind(this));
    this.app.get('/ready', this.readinessCheck.bind(this));

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl,
        timestamp: new Date().toISOString()
      });
    });
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing API server...', {
        context: {
          port: this.config.port,
          host: this.config.host,
          apiPrefix: this.config.apiPrefix
        }
      });

      // Initialize database adapter
      await initializeDatabaseAdapter();
      this.logger.info('Database adapter initialized');

      // Initialize job manager
      const jobManager = await initializeJobManager();
      this.logger.info('Job manager initialized');

      // Initialize webhook service
      this.webhookService = new WebhookService({
        baseUrl: process.env.WEBHOOK_BASE_URL || 'http://n8n:5678',
        timeout: 5000,
        retryAttempts: 3
      });

      // Connect webhook service to job manager
      jobManager.setWebhookService(this.webhookService);
      this.logger.info('Webhook service connected to job manager');

      // Initialize monitoring service
      const monitoringConfig = createDefaultMonitoringConfig();
      this.monitoringService = createMonitoringService(monitoringConfig);
      this.monitoringService.setWebhookService(this.webhookService);
      await this.monitoringService.startMonitoring();
      this.logger.info('Monitoring service initialized and started');

      this.logger.info('API server initialization completed');

    } catch (error) {
      this.logger.critical('Failed to initialize API server', error);
      throw error;
    }
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, this.config.host, () => {
          this.logger.info('API server started successfully', {
            context: {
              host: this.config.host,
              port: this.config.port,
              url: `http://${this.config.host}:${this.config.port}${this.config.apiPrefix}`
            }
          });
          resolve();
        });

        this.server.on('error', (error: Error) => {
          this.logger.critical('Server error', error);
          reject(error);
        });

      } catch (error) {
        this.logger.critical('Failed to start API server', error);
        reject(error);
      }
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close(async (error: Error) => {
        if (error) {
          this.logger.critical('Error stopping server', error);
          reject(error);
          return;
        }

        try {
          // Cleanup resources
          const jobManager = getJobManager();
          await jobManager.cleanup();

          // Stop monitoring service
          if (this.monitoringService) {
            await this.monitoringService.cleanup();
            this.logger.info('Monitoring service stopped');
          }

          await closeDatabaseAdapter();

          this.logger.info('API server stopped successfully');
          resolve();

        } catch (cleanupError) {
          this.logger.critical('Error during cleanup', cleanupError);
          reject(cleanupError);
        }
      });
    });
  }

  private async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const dbAdapter = getSyncDatabaseAdapter();
      const jobManager = getJobManager();

      // Check database health
      const dbHealthy = await dbAdapter.healthCheck();
      const dbStats = await dbAdapter.getConnectionStats();

      // Check job manager health
      const jobManagerStats = jobManager.getInstanceStats();

      // Get system info
      const systemInfo = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        version: process.version,
        platform: process.platform
      };

      const healthStatus = {
        status: dbHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        database: {
          connected: dbHealthy,
          stats: dbStats
        },
        jobManager: jobManagerStats,
        system: systemInfo
      };

      res.status(dbHealthy ? 200 : 503).json(healthStatus);

    } catch (error) {
      this.logger.critical('Health check failed', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed'
      });
    }
  }

  private async readinessCheck(req: Request, res: Response): Promise<void> {
    try {
      // Check if all critical services are ready
      const dbAdapter = getSyncDatabaseAdapter();
      const jobManager = getJobManager();

      const dbReady = await dbAdapter.healthCheck();
      const jobManagerReady = jobManager.isReady();

      const ready = dbReady && jobManagerReady;

      const readinessStatus = {
        status: ready ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: dbReady,
          jobManager: jobManagerReady
        }
      };

      res.status(ready ? 200 : 503).json(readinessStatus);

    } catch (error) {
      this.logger.critical('Readiness check failed', error);
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: 'Readiness check failed'
      });
    }
  }

  public getApp(): express.Application {
    return this.app;
  }

  public getWebhookService(): WebhookService | null {
    return this.webhookService;
  }
}

// Helper function to create server configuration from environment
export function createServerConfig(): ServerConfig {
  return {
    port: parseInt(process.env.PORT || '4000', 10),
    host: process.env.HOST || '0.0.0.0',
    apiPrefix: process.env.API_PREFIX || '/api/v1',
    enableCors: process.env.ENABLE_CORS !== 'false',
    requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT || '30000', 10),
    maxRequestSizeBytes: process.env.MAX_REQUEST_SIZE || '10mb',
    enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== 'false'
  };
}

// Graceful shutdown handling
export function setupGracefulShutdown(server: ApiServer): void {
  const logger = getLogger();

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);
    
    try {
      await server.stop();
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.critical('Error during graceful shutdown', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  process.on('uncaughtException', (error: Error) => {
    logger.critical('Uncaught exception', error);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled rejection', { reason: String(reason), promise: String(promise) });
    shutdown('unhandledRejection');
  });
}