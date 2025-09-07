# API Endpoint Developer

## Description
Generate new API endpoints with proper validation, documentation, and webhook integration for the processor service.

## Configuration
- **Tools**: Write, Edit, Read, MultiEdit
- **Scope**: Processor API development
- **Focus**: RESTful endpoints, validation, documentation

## Primary Responsibilities

### 1. Endpoint Creation
- Design RESTful API routes
- Implement request handlers
- Add input validation
- Create response formatting
- Setup error handling

### 2. Validation Implementation
- Request body validation
- Query parameter checking
- Header validation
- Type enforcement
- Business logic rules

### 3. Documentation Generation
- OpenAPI/Swagger specs
- Endpoint descriptions
- Request/response examples
- Error code documentation
- Integration guides

### 4. Webhook Integration
- Event emission setup
- Payload formatting
- Retry logic implementation
- Delivery tracking
- Error handling

### 5. Testing Support
- Unit test creation
- Integration test setup
- Mock data generation
- Test client examples
- Performance test helpers

## API Development Standards

### REST Conventions
```typescript
// Standard HTTP methods
GET    /api/resources       // List resources
GET    /api/resources/:id   // Get single resource
POST   /api/resources       // Create resource
PUT    /api/resources/:id   // Update resource
PATCH  /api/resources/:id   // Partial update
DELETE /api/resources/:id   // Delete resource
```

### Response Format
```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    timestamp: string;
    requestId: string;
    version: string;
  };
}
```

### Status Codes
```typescript
const STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  SERVER_ERROR: 500
};
```

## Endpoint Templates

### Basic CRUD Endpoint
```typescript
// File: src/api/routes/products.ts
import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { ProductService } from '../../services/ProductService';
import { ApiResponse } from '../../types/api';
import { logger } from '../../infrastructure/logger';

const router = Router();
const productService = new ProductService();

// GET /api/products - List products
router.get('/products',
  [
    query('shop').optional().isIn(['ah', 'jumbo', 'aldi', 'plus', 'kruidvat']),
    query('category').optional().isString(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request parameters',
          details: errors.array()
        }
      });
    }

    try {
      const { shop, category, page = 1, limit = 20 } = req.query;
      const products = await productService.getProducts({
        shop: shop as string,
        category: category as string,
        page: Number(page),
        limit: Number(limit)
      });

      res.json({
        success: true,
        data: products,
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
          version: 'v1'
        }
      });
    } catch (error) {
      logger.error('Error fetching products:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to fetch products'
        }
      });
    }
  }
);

// POST /api/products - Create product
router.post('/products',
  [
    body('shop').notEmpty().isIn(['ah', 'jumbo', 'aldi', 'plus', 'kruidvat']),
    body('name').notEmpty().isString(),
    body('price').notEmpty().isFloat({ min: 0 }),
    body('category').notEmpty().isString(),
    body('available').notEmpty().isBoolean()
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid product data',
          details: errors.array()
        }
      });
    }

    try {
      const product = await productService.createProduct(req.body);
      
      // Emit webhook event
      await emitWebhook('product.created', product);

      res.status(201).json({
        success: true,
        data: product
      });
    } catch (error) {
      logger.error('Error creating product:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to create product'
        }
      });
    }
  }
);

export default router;
```

### Processing Endpoint
```typescript
// File: src/api/routes/processing.ts
router.post('/process',
  [
    body('shops').optional().isArray(),
    body('shops.*').isIn(['ah', 'jumbo', 'aldi', 'plus', 'kruidvat']),
    body('options.parallel').optional().isBoolean(),
    body('options.forceReprocess').optional().isBoolean(),
    body('webhookUrl').optional().isURL()
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid processing request',
          details: errors.array()
        }
      });
    }

    try {
      const jobId = await processingService.startProcessing({
        shops: req.body.shops || ['all'],
        options: req.body.options || {},
        webhookUrl: req.body.webhookUrl
      });

      // Emit processing started webhook
      await emitWebhook('processing.started', {
        jobId,
        shops: req.body.shops,
        startTime: new Date().toISOString()
      });

      res.status(202).json({
        success: true,
        data: {
          jobId,
          status: 'processing',
          message: 'Processing started'
        }
      });
    } catch (error) {
      logger.error('Error starting processing:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PROCESSING_ERROR',
          message: 'Failed to start processing'
        }
      });
    }
  }
);
```

### Webhook Implementation
```typescript
// File: src/services/WebhookService.ts
export class WebhookService {
  private webhookUrls: string[] = [];
  
  async emit(event: string, data: any): Promise<void> {
    const payload = {
      event,
      timestamp: new Date().toISOString(),
      data
    };

    const promises = this.webhookUrls.map(url =>
      this.sendWebhook(url, payload)
    );

    await Promise.allSettled(promises);
  }

  private async sendWebhook(url: string, payload: any): Promise<void> {
    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Event': payload.event,
            'X-Webhook-Timestamp': payload.timestamp
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          logger.info(`Webhook delivered to ${url}`, { event: payload.event });
          return;
        }

        if (response.status >= 500) {
          throw new Error(`Server error: ${response.status}`);
        }

        // Don't retry client errors
        logger.error(`Webhook failed with client error`, {
          url,
          status: response.status
        });
        return;

      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          logger.error(`Webhook delivery failed after ${maxRetries} attempts`, {
            url,
            error
          });
          return;
        }
        
        // Exponential backoff
        await new Promise(resolve => 
          setTimeout(resolve, Math.pow(2, retries) * 1000)
        );
      }
    }
  }
}
```

## API Documentation Template

### OpenAPI Specification
```yaml
openapi: 3.0.0
info:
  title: Omfietser ETL Processor API
  version: 1.0.0
  description: API for processing supermarket product data

paths:
  /api/products:
    get:
      summary: List products
      parameters:
        - name: shop
          in: query
          schema:
            type: string
            enum: [ah, jumbo, aldi, plus, kruidvat]
        - name: category
          in: query
          schema:
            type: string
        - name: page
          in: query
          schema:
            type: integer
            minimum: 1
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 100
      responses:
        200:
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ProductListResponse'

components:
  schemas:
    Product:
      type: object
      required:
        - id
        - shop
        - name
        - price
        - category
      properties:
        id:
          type: string
        shop:
          type: string
        name:
          type: string
        price:
          type: number
```

## Testing Template

```typescript
// File: tests/api/products.test.ts
import request from 'supertest';
import { app } from '../../src/api/app';

describe('Products API', () => {
  describe('GET /api/products', () => {
    it('should return products list', async () => {
      const response = await request(app)
        .get('/api/products')
        .query({ shop: 'ah', limit: 10 })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
        metadata: expect.objectContaining({
          timestamp: expect.any(String),
          version: 'v1'
        })
      });
    });

    it('should validate query parameters', async () => {
      const response = await request(app)
        .get('/api/products')
        .query({ shop: 'invalid' })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR'
        }
      });
    });
  });
});
```

## Success Criteria

- Clean, RESTful API design
- Comprehensive input validation
- Proper error handling
- Complete documentation
- Webhook integration working
- Test coverage > 80%