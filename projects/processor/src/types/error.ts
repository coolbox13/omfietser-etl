// src/types/errors.ts

/**
 * Base class for all application errors
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
      public readonly productId?: string,
      public readonly field?: string
    ) {
      super(message, 'VALIDATION_ERROR', { productId, field });
      Object.setPrototypeOf(this, ValidationError.prototype);
    }
  }
  
  /**
   * Base transformation error with details about available and missing fields
   */
  export interface TransformErrorDetails {
    id?: string;
    webshopId?: number | string;
    articleNumber?: string;
    sku?: string;
    availableFields: string[];
    missingFields: string[];
    partialData?: Record<string, any>;
  }
  
  /**
   * Base class for transformation errors
   */
  export class TransformationError extends AppError {
    constructor(
      message: string,
      public readonly productId: string,
      public readonly shopType: string,
      public readonly details?: Record<string, any>
    ) {
      super(message, 'TRANSFORMATION_ERROR', { productId, shopType, ...details });
      Object.setPrototypeOf(this, TransformationError.prototype);
    }
  }
  
  /**
   * AH-specific transformation error
   */
  export class AHTransformError extends AppError {
    constructor(
      message: string,
      public readonly details: TransformErrorDetails
    ) {
      super(message, 'AH_TRANSFORM_ERROR', details);
      this.name = 'AHTransformError';
      Object.setPrototypeOf(this, AHTransformError.prototype);
    }
  }
  
  /**
   * Jumbo-specific transformation error
   */
  export class JumboTransformError extends AppError {
    constructor(
      message: string,
      public readonly details: TransformErrorDetails
    ) {
      super(message, 'JUMBO_TRANSFORM_ERROR', details);
      this.name = 'JumboTransformError';
      Object.setPrototypeOf(this, JumboTransformError.prototype);
    }
  }
  
  /**
   * Aldi-specific transformation error
   */
  export class AldiTransformError extends AppError {
    constructor(
      message: string,
      public readonly details: TransformErrorDetails
    ) {
      super(message, 'ALDI_TRANSFORM_ERROR', details);
      this.name = 'AldiTransformError';
      Object.setPrototypeOf(this, AldiTransformError.prototype);
    }
  }
  
  /**
   * Plus-specific transformation error
   */
  export class PlusTransformError extends AppError {
    constructor(
      message: string,
      public readonly details: TransformErrorDetails
    ) {
      super(message, 'PLUS_TRANSFORM_ERROR', details);
      this.name = 'PlusTransformError';
      Object.setPrototypeOf(this, PlusTransformError.prototype);
    }
  }
  
  /**
   * File system operation error
   */
  export class FileSystemError extends AppError {
    constructor(
      message: string,
      public readonly details?: Record<string, any>
    ) {
      super(message, 'FILE_SYSTEM_ERROR', details);
      Object.setPrototypeOf(this, FileSystemError.prototype);
    }
  }
  
  /**
   * Machine learning prediction error
   */
  export class PredictionError extends AppError {
    constructor(
      message: string,
      public readonly details?: Record<string, any>
    ) {
      super(message, 'PREDICTION_ERROR', details);
      Object.setPrototypeOf(this, PredictionError.prototype);
    }
  }
  
  /**
   * Helper to serialize any error to a JSON-compatible object
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
   * Setup global error handlers for uncaught exceptions
   */
  export function setupGlobalErrorHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', serializeError(error));
      process.exit(1);
    });
  
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection:', serializeError(reason));
      process.exit(1);
    });
  }