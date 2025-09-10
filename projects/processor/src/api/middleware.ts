// Express middleware for the API server
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getLogger } from '../infrastructure/logging';

export interface MiddlewareConfig {
  enableCors: boolean;
  requestTimeoutMs: number;
  enableRequestLogging: boolean;
}

export interface ApiRequest extends Request {
  startTime?: number;
  requestId?: string;
}

export function createMiddleware(config: MiddlewareConfig) {
  const logger = getLogger();

  // CORS middleware
  const cors = (req: Request, res: Response, next: NextFunction) => {
    if (config.enableCors) {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
    }
    next();
  };

  // Request timeout middleware
  const timeout = (req: ApiRequest, res: Response, next: NextFunction) => {
    const timeoutId = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn('Request timeout', {
          context: {
            method: req.method,
            url: req.url,
            timeout: config.requestTimeoutMs,
            requestId: req.requestId
          }
        });

        res.status(408).json({
          success: false,
          error: 'Request timeout',
          timeout: config.requestTimeoutMs,
          timestamp: new Date().toISOString()
        });
      }
    }, config.requestTimeoutMs);

    res.on('finish', () => {
      clearTimeout(timeoutId);
    });

    next();
  };

  // Request logging middleware
  const requestLogging = (req: ApiRequest, res: Response, next: NextFunction) => {
    if (!config.enableRequestLogging) {
      next();
      return;
    }

    req.startTime = Date.now();
    req.requestId = generateRequestId();

    // Log incoming request
    logger.info('Incoming request', {
      context: {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        requestId: req.requestId
      }
    });

    // Log response when finished
    res.on('finish', () => {
      const duration = req.startTime ? Date.now() - req.startTime : 0;
      
      logger.info('Request completed', {
        context: {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          requestId: req.requestId
        }
      });
    });

    next();
  };

  // Error handling middleware
  const errorHandler = (error: Error, req: ApiRequest, res: Response, next: NextFunction) => {
    logger.error('Request error', {
      context: {
        method: req.method,
        url: req.url,
        requestId: req.requestId
      },
      error
    });

    if (res.headersSent) {
      return next(error);
    }

    // Determine error type and status code
    let statusCode = 500;
    let errorMessage = 'Internal server error';

    if (error.name === 'ValidationError') {
      statusCode = 400;
      errorMessage = error.message;
    } else if (error.name === 'UnauthorizedError') {
      statusCode = 401;
      errorMessage = 'Unauthorized';
    } else if (error.name === 'ForbiddenError') {
      statusCode = 403;
      errorMessage = 'Forbidden';
    } else if (error.name === 'NotFoundError') {
      statusCode = 404;
      errorMessage = 'Not found';
    } else if (error.name === 'ConflictError') {
      statusCode = 409;
      errorMessage = error.message;
    } else if (error.message.includes('timeout')) {
      statusCode = 408;
      errorMessage = 'Request timeout';
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  };

  // Validation middleware for common parameters
  const validateShopType = (req: Request, res: Response, next: NextFunction) => {
    const { shopType } = req.params;
    const validShopTypes = ['ah', 'jumbo', 'aldi', 'plus', 'kruidvat'];
    
    if (shopType && !validShopTypes.includes(shopType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid shop type. Must be one of: ${validShopTypes.join(', ')}`,
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  };

  const validateJobId = (req: Request, res: Response, next: NextFunction) => {
    const { jobId } = req.params;
    
    // Debug logging removed for production
    
    if (jobId && !isValidJobId(jobId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job ID format',
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  };

  const validatePagination = (req: Request, res: Response, next: NextFunction) => {
    const { limit, offset } = req.query;
    
    if (limit && (isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > 1000)) {
      return res.status(400).json({
        success: false,
        error: 'Limit must be a number between 1 and 1000',
        timestamp: new Date().toISOString()
      });
    }
    
    if (offset && (isNaN(Number(offset)) || Number(offset) < 0)) {
      return res.status(400).json({
        success: false,
        error: 'Offset must be a non-negative number',
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  };

  // Schema validation middleware using Zod
  const validateSchema = <T>(schema: z.ZodSchema<T>) => {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = schema.parse(req.body);
        // Replace req.body with validated and transformed data
        req.body = result;
        next();
      } catch (error) {
        if (error instanceof z.ZodError) {
          const validationErrors = error.errors.map(err => {
            const errorDetail: any = {
              field: err.path.join('.'),
              message: err.message
            };
            
            // Add received value if it exists (not all ZodIssue types have it)
            if ('received' in err) {
              errorDetail.received = err.received;
            }
            
            return errorDetail;
          });

          logger.warn('Schema validation failed', {
            context: {
              method: req.method,
              url: req.url,
              errors: validationErrors,
              requestId: (req as ApiRequest).requestId
            }
          });

          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: {
              message: 'Request body contains invalid data',
              errors: validationErrors
            },
            timestamp: new Date().toISOString()
          });
        }

        // For non-Zod errors, pass to general error handler
        next(error);
      }
    };
  };

  return {
    cors,
    timeout,
    requestLogging,
    errorHandler,
    validateShopType,
    validateJobId,
    validatePagination,
    validateSchema
  };
}

// Helper functions
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

function isValidJobId(str: string): boolean {
  // Accept both UUID format and our custom job_timestamp_random format
  if (isValidUUID(str)) {
    return true;
  }
  
  // Accept job_timestamp_random format like job_1757452982246_6ny9ob
  const jobIdRegex = /^job_\d+_[a-z0-9]+$/;
  return jobIdRegex.test(str);
}

// Response helper functions
export function successResponse(data: any, message?: string) {
  return {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString()
  };
}

export function errorResponse(error: string, details?: any) {
  return {
    success: false,
    error,
    details,
    timestamp: new Date().toISOString()
  };
}

export function paginatedResponse(data: any[], total: number, limit: number, offset: number) {
  return {
    success: true,
    data,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    },
    timestamp: new Date().toISOString()
  };
}

// Export validateRequest as an alias for validateSchema for use in routes
export function validateRequest<T>(schema: z.ZodSchema<T>) {
  const logger = getLogger();
  
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.parse(req.body);
      // Replace req.body with validated and transformed data
      req.body = result;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors = error.errors.map(err => {
          const errorDetail: any = {
            field: err.path.join('.'),
            message: err.message
          };
          
          // Add received value if it exists (not all ZodIssue types have it)
          if ('received' in err) {
            errorDetail.received = err.received;
          }
          
          return errorDetail;
        });

        logger.warn('Schema validation failed', {
          context: {
            method: req.method,
            url: req.url,
            errors: validationErrors,
            requestId: (req as ApiRequest).requestId
          }
        });

        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: {
            message: 'Request body contains invalid data',
            errors: validationErrors
          },
          timestamp: new Date().toISOString()
        });
      }

      // For non-Zod errors, pass to general error handler
      next(error);
    }
  };
}
