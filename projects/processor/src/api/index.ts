// Main entry point for the Supermarket Processor HTTP API
import dotenv from 'dotenv';
import { initializeLogger, getLogger } from '../infrastructure/logging';
import { ApiServer, createServerConfig, setupGracefulShutdown } from './server';

// Load environment variables from .env file
dotenv.config();

async function main() {
  let server: ApiServer | null = null;

  try {
    // Initialize logging first
    initializeLogger({
      logDir: process.env.LOG_DIR || 'logs',
      level: (process.env.LOG_LEVEL as any) || 'info',
      consoleOutput: process.env.CONSOLE_OUTPUT !== 'false',
      fileOutput: process.env.FILE_OUTPUT !== 'false',
      applicationName: 'supermarket-processor-api'
    });

    const logger = getLogger();

    logger.info('Starting Supermarket Processor API', {
      context: {
        nodeEnv: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
        port: process.env.PORT || 4000
      }
    });

    // Create server configuration
    const config = createServerConfig();

    // Create and initialize server
    server = new ApiServer(config);
    await server.initialize();

    // Setup graceful shutdown handling
    setupGracefulShutdown(server);

    // Start the server
    await server.start();

    logger.info('Supermarket Processor API started successfully', {
      context: {
        port: config.port,
        host: config.host,
        apiPrefix: config.apiPrefix
      }
    });

  } catch (error) {
    const logger = getLogger();
    logger.critical('Failed to start Supermarket Processor API', error);
    
    if (server) {
      try {
        await server.stop();
      } catch (stopError) {
        logger.critical('Error stopping server during cleanup', stopError);
      }
    }

    process.exit(1);
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
export * from './server';
export * from './routes';
export * from './middleware';
export * from './services/webhook-service';
export * from './services/job-manager';
export * from './services/monitoring-service';