export interface TransformErrorDetails {
    id?: string;
    webshopId?: number | string;  // Added for AH products
    articleNumber?: string;       // Added for Aldi products
    sku?: string;                // Added for Plus products
    availableFields: string[];
    missingFields: string[];
    partialData?: Record<string, any>;
}

export class BaseTransformError extends Error {
    constructor(
        message: string,
        public readonly details: TransformErrorDetails
    ) {
        super(message);
        this.name = 'TransformError';
        // Ensure instanceof works correctly
        Object.setPrototypeOf(this, BaseTransformError.prototype);
    }
}

export class AHTransformError extends BaseTransformError {
    constructor(message: string, details: TransformErrorDetails) {
        super(message, details);
        this.name = 'AHTransformError';
        Object.setPrototypeOf(this, AHTransformError.prototype);
    }
}

export class JumboTransformError extends BaseTransformError {
    constructor(message: string, details: TransformErrorDetails) {
        super(message, details);
        this.name = 'JumboTransformError';
        Object.setPrototypeOf(this, JumboTransformError.prototype);
    }
}

export class AldiTransformError extends BaseTransformError {
    constructor(message: string, details: TransformErrorDetails) {
        super(message, details);
        this.name = 'AldiTransformError';
        Object.setPrototypeOf(this, AldiTransformError.prototype);
    }
}

export class PlusTransformError extends BaseTransformError {
    constructor(message: string, details: TransformErrorDetails) {
        super(message, details);
        this.name = 'PlusTransformError';
        Object.setPrototypeOf(this, PlusTransformError.prototype);
    }
}