// src/infrastructure/logging/logger.ts
import fs from 'fs-extra';
import path from 'path';
import { createLogger, format, transports, Logger as WinstonLogger } from 'winston';
import { serializeError } from '../../utils/error';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export interface LoggerOptions {
  logDir: string;
  consoleOutput?: boolean;
  fileOutput?: boolean;
  level?: LogLevel;
  applicationName?: string;
}

export class Logger {
  private readonly logger: WinstonLogger;
  private readonly options: LoggerOptions;
  private readonly processId: string;

  constructor(options: LoggerOptions) {
    this.options = {
      consoleOutput: true,
      fileOutput: true,
      level: LogLevel.INFO,
      applicationName: 'product-processor',
      ...options
    };

    this.processId = this.generateProcessId();

    // Ensure log directory exists
    fs.ensureDirSync(options.logDir);

    // Create Winston logger with appropriate transports
    this.logger = this.createWinstonLogger();
  }

  private generateProcessId(): string {
    return `${this.options.applicationName}-${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private createWinstonLogger(): WinstonLogger {
    const logFormat = format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.json()
    );

    const loggerTransports = [];

    // Add console transport if enabled
    if (this.options.consoleOutput) {
      loggerTransports.push(
        new transports.Console({
          format: format.combine(
            format.colorize(),
            format.printf(({ timestamp, level, message, ...meta }) => {
              const context = meta.context ? `\n${JSON.stringify(meta.context, null, 2)}` : '';
              return `[${timestamp}] ${level}: ${message}${context}`;
            })
          )
        })
      );
    }

    // Add file transports if enabled
    if (this.options.fileOutput) {
      loggerTransports.push(
        new transports.File({
          filename: path.join(this.options.logDir, 'application.log'),
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
        new transports.File({
          filename: path.join(this.options.logDir, 'error.log'),
          level: 'error'
        })
      );
    }

    // Ensure we always have at least one transport to prevent Winston warnings
    if (loggerTransports.length === 0) {
      // Add a silent transport for test environments
      loggerTransports.push(
        new transports.Console({
          silent: true
        })
      );
    }

    return createLogger({
      level: this.options.level,
      format: logFormat,
      defaultMeta: {
        processId: this.processId,
        applicationName: this.options.applicationName
      },
      transports: loggerTransports
    });
  }

  debug(message: string, context?: Record<string, any>): void {
    this.logger.debug(message, { context });
  }

  info(message: string, context?: Record<string, any>): void {
    this.logger.info(message, { context });
  }

  warn(message: string, context?: Record<string, any>): void {
    this.logger.warn(message, { context });
  }

  error(message: string, context?: Record<string, any>): void {
    this.logger.error(message, { context });
  }

  /**
   * Log critical errors with detailed stack traces
   */
  critical(message: string, error: unknown, context?: Record<string, any>): void {
    this.logger.error(message, {
      error: serializeError(error),
      context,
      isCritical: true
    });
  }

  /**
   * Log processor events (product processed, skipped, etc.)
   */
  logProcessorEvent(shopType: string, action: string, productId: string, details?: Record<string, any>): void {
    this.info(`${shopType} product ${action}`, {
      context: {
        shopType,
        action,
        productId,
        ...details
      }
    });
  }

  /**
   * Log a summary of a processing batch
   */
  logBatchSummary(batch: {
    shop: string;
    totalProcessed: number;
    success: number;
    skipped: number;
    failed: number;
    duration: number;
  }): void {
    this.info(`Completed processing batch for ${batch.shop}`, {
      context: {
        ...batch,
        performanceMetrics: {
          processingRate: `${Math.round(batch.totalProcessed / (batch.duration / 1000))} products/second`,
          averageTimePerProduct: `${Math.round((batch.duration / batch.totalProcessed) * 100) / 100}ms`
        }
      }
    });
  }

  /**
   * Write a JSON report to the logs directory
   */
  async writeReport(reportName: string, data: any): Promise<string> {
    const reportFile = path.join(this.options.logDir, `${reportName}-${this.processId}.json`);

    try {
      await fs.writeJson(reportFile, data, { spaces: 2 });
      this.info(`Report generated: ${reportName}`, {
        context: { reportFile }
      });
      return reportFile;
    } catch (error) {
      this.error(`Failed to write report: ${reportName}`, {
        context: {
          reportFile,
          error: serializeError(error)
        }
      });
      throw error;
    }
  }

  /**
   * Get the process ID for this logger instance
   */
  getProcessId(): string {
    return this.processId;
  }

  /**
   * Close the logger and clean up resources
   */
  close(): void {
    if (this.logger && typeof this.logger.close === 'function') {
      this.logger.close();
    }
  }
}

// Singleton instance
let loggerInstance: Logger | null = null;

/**
 * Initialize the logger
 */
export function initializeLogger(options: LoggerOptions): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger(options);
  }
  return loggerInstance;
}

/**
 * Get the logger instance
 */
export function getLogger(): Logger {
  if (!loggerInstance) {
    // Create a default logger if not initialized
    loggerInstance = new Logger({
      logDir: 'logs',
      level: LogLevel.INFO,
      consoleOutput: false, // Don't interfere with CLI dashboard
      fileOutput: true,
    });
    // Only show warning in development mode
    if (process.env.NODE_ENV !== 'test') {
      console.warn('Logger not properly initialized. Using default configuration.');
    }
  }
  return loggerInstance;
}

/**
 * Clean up the logger instance
 * Used primarily for testing to prevent memory leaks
 */
export function cleanupLogger(): void {
  if (loggerInstance) {
    // Close any open transports
    loggerInstance.close();
    loggerInstance = null;
  }
}