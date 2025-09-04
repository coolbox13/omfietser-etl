// src/core/models/product.ts
import { UnitPrice, QuantityOption, UnifiedProduct } from '../../types/product';

// Re-export the UnifiedProduct from types/product
export { UnifiedProduct };

/**
 * Interface for the product statistics after processing
 */
export interface ProductStats {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  deduped: number;
  withPromotion: number;
  withoutPromotion: number;
  duration: number;
}

/**
 * Interface for category statistics
 */
export interface CategoryStats {
  categoryName: string;
  count: number;
  percentage: number;
  uniqueProducts: string[];
}

// Error models
export class ProcessingError extends Error {
  constructor(
    message: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ProcessingError';
    Object.setPrototypeOf(this, ProcessingError.prototype);
  }
}

export class ValidationError extends ProcessingError {
  constructor(
    message: string,
    public readonly productId: string,
    public readonly field?: string
  ) {
    super(message, { productId, field });
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class TransformationError extends ProcessingError {
  constructor(
    message: string,
    public readonly productId: string,
    public readonly shopType: string,
    public readonly details?: Record<string, any>
  ) {
    super(message, { productId, shopType, ...details });
    this.name = 'TransformationError';
    Object.setPrototypeOf(this, TransformationError.prototype);
  }
}