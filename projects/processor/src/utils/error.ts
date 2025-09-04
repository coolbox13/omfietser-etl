// src/utils/error.ts
import { getLogger } from '../infrastructure/logging';

/**
 * Base application error class
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    // Ensure instanceof works correctly in TypeScript
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Get a structured representation of the error for logging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      stack: this.stack
    };
  }
}

/**
 * Error for validation failures
 */
export class ValidationError extends AppError {
  constructor(
    message: string,
    details?: Record<string, any>
  ) {
    super(message, 'VALIDATION_ERROR', details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Error for data transformation failures
 */
export class TransformationError extends AppError {
  constructor(
    message: string,
    shopType: string,
    productId: string | number,
    details?: Record<string, any>
  ) {
    super(message, 'TRANSFORMATION_ERROR', {
      shopType,
      productId,
      ...details
    });
    Object.setPrototypeOf(this, TransformationError.prototype);
  }
}

/**
 * Error for file system operations
 */
export class FileSystemError extends AppError {
  constructor(
    message: string,
    details?: Record<string, any>
  ) {
    super(message, 'FILE_SYSTEM_ERROR', details);
    Object.setPrototypeOf(this, FileSystemError.prototype);
  }
}

/**
 * Error for ML prediction failures
 */
export class PredictionError extends AppError {
  constructor(
    message: string,
    details?: Record<string, any>
  ) {
    super(message, 'PREDICTION_ERROR', details);
    Object.setPrototypeOf(this, PredictionError.prototype);
  }
}

/**
 * Global error handler for uncaught exceptions
 */
export function setupGlobalErrorHandlers(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    // Get logger lazily to avoid initialization issues
    const logger = getLogger();
    logger.error('Uncaught Exception', { error: serializeError(error) });
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    // Get logger lazily to avoid initialization issues
    const logger = getLogger();
    logger.error('Unhandled Rejection', {
      reason: serializeError(reason),
      promise
    });
    process.exit(1);
  });
}

/**
 * Helper to wrap async functions with consistent error handling
 */
export function withErrorHandling<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T>,
  errorHandler?: (error: unknown) => Promise<T> | T
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    try {
      return await fn(...args);
    } catch (error) {
      const logger = getLogger();
      logger.error('Error in operation', { error: serializeError(error) });

      if (errorHandler) {
        return errorHandler(error);
      }
      throw error;
    }
  };
}

/**
 * Safely serialize an error to a JSON-compatible object
 */
export function serializeError(error: unknown): Record<string, any> {
  if (error instanceof AppError) {
    return error.toJSON();
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return {
    error: String(error)
  };
}

/**
 * Create specific shop transformer errors
 */
export class AHTransformError extends TransformationError {
  constructor(message: string, productId: string | number, details?: Record<string, any>) {
    super(message, 'AH', productId, details);
    Object.setPrototypeOf(this, AHTransformError.prototype);
  }
}

export class JumboTransformError extends TransformationError {
  constructor(message: string, productId: string | number, details?: Record<string, any>) {
    super(message, 'JUMBO', productId, details);
    Object.setPrototypeOf(this, JumboTransformError.prototype);
  }
}

export class AldiTransformError extends TransformationError {
  constructor(message: string, productId: string | number, details?: Record<string, any>) {
    super(message, 'ALDI', productId, details);
    Object.setPrototypeOf(this, AldiTransformError.prototype);
  }
}

export class PlusTransformError extends TransformationError {
  constructor(message: string, productId: string | number, details?: Record<string, any>) {
    super(message, 'PLUS', productId, details);
    Object.setPrototypeOf(this, PlusTransformError.prototype);
  }
}