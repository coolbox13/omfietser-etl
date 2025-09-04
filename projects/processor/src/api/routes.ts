// API routes for the Supermarket Processor
import { Router, Request, Response, NextFunction } from 'express';
import { getJobManager } from './services/job-manager';
import { getSyncDatabaseAdapter } from '../infrastructure/database';
import { successResponse, errorResponse, paginatedResponse } from './middleware';
import { createMiddleware } from './middleware';

export function createApiRoutes(): Router {
  const router = Router();
  const middleware = createMiddleware({
    enableCors: true,
    requestTimeoutMs: 30000,
    enableRequestLogging: true
  });

  // =============================================
  // Job Management Routes
  // =============================================

  // Create a new processing job
  router.post('/jobs', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { shop_type, batch_size, metadata } = req.body;

      if (!shop_type) {
        return res.status(400).json(errorResponse('shop_type is required'));
      }

      const jobManager = getJobManager();
      const job = await jobManager.createJob({
        shop_type,
        batch_size,
        metadata
      });

      res.status(201).json(successResponse(job, 'Job created successfully'));

    } catch (error) {
      next(error);
    }
  });

  // Start a processing job
  router.post('/jobs/:jobId/start', middleware.validateJobId, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobId } = req.params;
      const jobManager = getJobManager();

      await jobManager.startJob(jobId);
      
      res.json(successResponse(null, 'Job started successfully'));

    } catch (error) {
      next(error);
    }
  });

  // Cancel a processing job
  router.post('/jobs/:jobId/cancel', middleware.validateJobId, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobId } = req.params;
      const { reason } = req.body;
      const jobManager = getJobManager();

      await jobManager.cancelJob(jobId, reason);
      
      res.json(successResponse(null, 'Job cancelled successfully'));

    } catch (error) {
      next(error);
    }
  });

  // Get job details
  router.get('/jobs/:jobId', middleware.validateJobId, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobId } = req.params;
      const jobManager = getJobManager();

      const job = await jobManager.getJobById(jobId);
      if (!job) {
        return res.status(404).json(errorResponse('Job not found'));
      }

      res.json(successResponse(job));

    } catch (error) {
      next(error);
    }
  });

  // Get job progress
  router.get('/jobs/:jobId/progress', middleware.validateJobId, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobId } = req.params;
      const jobManager = getJobManager();

      const progress = await jobManager.getJobProgress(jobId);
      if (!progress) {
        return res.status(404).json(errorResponse('Job not found'));
      }

      res.json(successResponse(progress));

    } catch (error) {
      next(error);
    }
  });

  // Get job statistics
  router.get('/jobs/:jobId/statistics', middleware.validateJobId, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobId } = req.params;
      const jobManager = getJobManager();

      const statistics = await jobManager.getJobStatistics(jobId);
      
      res.json(successResponse(statistics));

    } catch (error) {
      next(error);
    }
  });

  // Get job errors
  router.get('/jobs/:jobId/errors', middleware.validateJobId, middleware.validatePagination, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const jobManager = getJobManager();
      const errors = await jobManager.getJobErrors(jobId);

      // Manual pagination since we're getting all errors
      const paginatedErrors = errors.slice(offset, offset + limit);
      
      res.json(paginatedResponse(paginatedErrors, errors.length, limit, offset));

    } catch (error) {
      next(error);
    }
  });

  // List jobs with filtering
  router.get('/jobs', middleware.validatePagination, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        shop_type,
        status,
        limit = '50',
        offset = '0',
        created_after,
        created_before
      } = req.query;

      const dbAdapter = getSyncDatabaseAdapter();
      const jobs = await dbAdapter.getProcessingJobs({
        shop_type: shop_type as string,
        status: status as any,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        created_after: created_after ? new Date(created_after as string) : undefined,
        created_before: created_before ? new Date(created_before as string) : undefined
      });

      // Note: For proper pagination, we'd need a count query too
      res.json(successResponse(jobs));

    } catch (error) {
      next(error);
    }
  });

  // Get active jobs
  router.get('/jobs/active', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobManager = getJobManager();
      const activeJobs = await jobManager.getActiveJobs();

      res.json(successResponse(activeJobs));

    } catch (error) {
      next(error);
    }
  });

  // =============================================
  // Product Data Routes
  // =============================================

  // Get processed products
  router.get('/products', middleware.validatePagination, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        shop_type,
        job_id,
        main_category,
        is_promotion,
        is_active = 'true',
        limit = '50',
        offset = '0',
        processed_after,
        processed_before
      } = req.query;

      const dbAdapter = getSyncDatabaseAdapter();
      const products = await dbAdapter.getProcessedProducts({
        shop_type: shop_type as string,
        job_id: job_id as string,
        main_category: main_category as string,
        is_promotion: is_promotion === 'true' ? true : is_promotion === 'false' ? false : undefined,
        is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        processed_after: processed_after ? new Date(processed_after as string) : undefined,
        processed_before: processed_before ? new Date(processed_before as string) : undefined
      });

      res.json(successResponse(products));

    } catch (error) {
      next(error);
    }
  });

  // Get a specific product
  router.get('/products/:unifiedId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { unifiedId } = req.params;
      const dbAdapter = getSyncDatabaseAdapter();

      const product = await dbAdapter.getProcessedProductById(unifiedId);
      if (!product) {
        return res.status(404).json(errorResponse('Product not found'));
      }

      res.json(successResponse(product));

    } catch (error) {
      next(error);
    }
  });

  // Get raw products (for debugging/monitoring)
  router.get('/raw-products', middleware.validatePagination, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        shop_type,
        job_id,
        limit = '50',
        offset = '0',
        scraped_after,
        scraped_before
      } = req.query;

      const dbAdapter = getSyncDatabaseAdapter();
      const rawProducts = await dbAdapter.getRawProducts({
        shop_type: shop_type as string,
        job_id: job_id as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        scraped_after: scraped_after ? new Date(scraped_after as string) : undefined,
        scraped_before: scraped_before ? new Date(scraped_before as string) : undefined
      });

      res.json(successResponse(rawProducts));

    } catch (error) {
      next(error);
    }
  });

  // Get staging products (intermediate step with external_id)
  router.get('/staging-products', middleware.validatePagination, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { shop_type, external_id } = req.query;

      if (shop_type && external_id) {
        const dbAdapter = getSyncDatabaseAdapter();
        const stagingProduct = await dbAdapter.getStagingProductByExternalId(
          shop_type as string,
          external_id as string
        );
        
        if (!stagingProduct) {
          return res.status(404).json(errorResponse('Staging product not found'));
        }

        res.json(successResponse(stagingProduct));
      } else {
        // For now, staging products don't have a general list endpoint
        // Could be added if needed
        res.status(400).json(errorResponse('shop_type and external_id are required'));
      }

    } catch (error) {
      next(error);
    }
  });

  // =============================================
  // Processing Routes (for specific shops)
  // =============================================

  // Process specific shop
  router.post('/process/:shopType', middleware.validateShopType, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { shopType } = req.params;
      const { batch_size, metadata } = req.body;

      const jobManager = getJobManager();
      
      // Create and start job
      const job = await jobManager.createJob({
        shop_type: shopType,
        batch_size,
        metadata
      });

      // Start the job automatically
      await jobManager.startJob(job.job_id);

      res.status(201).json(successResponse({
        job_id: job.job_id,
        shop_type: shopType,
        status: 'started'
      }, 'Processing started successfully'));

    } catch (error) {
      next(error);
    }
  });

  // =============================================
  // Statistics and Monitoring Routes
  // =============================================

  // Get overall statistics
  router.get('/statistics', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dbAdapter = getSyncDatabaseAdapter();
      const jobManager = getJobManager();

      const [jobStats, jobManagerStats, connectionStats] = await Promise.all([
        dbAdapter.getJobStatistics(),
        Promise.resolve(jobManager.getInstanceStats()),
        dbAdapter.getConnectionStats()
      ]);

      const statistics = {
        jobs: jobStats,
        jobManager: jobManagerStats,
        database: connectionStats,
        timestamp: new Date().toISOString()
      };

      res.json(successResponse(statistics));

    } catch (error) {
      next(error);
    }
  });

  // Get enhanced monitoring metrics
  router.get('/monitoring/metrics', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { MonitoringService } = await import('./services/monitoring-service');
      const monitoringService = MonitoringService.getInstance();

      const latestMetrics = monitoringService.getLatestMetrics();
      if (!latestMetrics) {
        return res.status(404).json(errorResponse('No metrics available'));
      }

      res.json(successResponse(latestMetrics));

    } catch (error) {
      next(error);
    }
  });

  // Get monitoring metrics history
  router.get('/monitoring/metrics/history', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      
      const { MonitoringService } = await import('./services/monitoring-service');
      const monitoringService = MonitoringService.getInstance();

      const metricsHistory = monitoringService.getMetricsHistory(hours);

      res.json(successResponse(metricsHistory));

    } catch (error) {
      next(error);
    }
  });

  // Get recent alerts
  router.get('/monitoring/alerts', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      
      const { MonitoringService } = await import('./services/monitoring-service');
      const monitoringService = MonitoringService.getInstance();

      const alerts = monitoringService.getRecentAlerts(hours);

      res.json(successResponse(alerts));

    } catch (error) {
      next(error);
    }
  });

  // Get health report
  router.get('/monitoring/health', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { MonitoringService } = await import('./services/monitoring-service');
      const monitoringService = MonitoringService.getInstance();

      const healthReport = await monitoringService.generateHealthReport();
      if (!healthReport) {
        return res.status(503).json(errorResponse('Health report not available'));
      }

      res.json(successResponse(healthReport));

    } catch (error) {
      next(error);
    }
  });

  // Get error summary
  router.get('/errors/summary', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { job_id } = req.query;
      const dbAdapter = getSyncDatabaseAdapter();

      const errorSummary = await dbAdapter.getErrorSummary(job_id as string);

      res.json(successResponse(errorSummary));

    } catch (error) {
      next(error);
    }
  });

  // =============================================
  // Webhook Routes (for N8N integration)
  // =============================================

  // N8N webhook endpoint
  router.post('/webhook/n8n', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { action, shop_type, batch_id, metadata } = req.body;

      if (!action || !shop_type) {
        return res.status(400).json(errorResponse('action and shop_type are required'));
      }

      const jobManager = getJobManager();

      switch (action) {
        case 'process':
          // Create and start processing job
          const job = await jobManager.createJob({
            shop_type,
            metadata: {
              ...metadata,
              triggered_by: 'n8n_webhook',
              batch_id
            }
          });

          await jobManager.startJob(job.job_id);

          res.json(successResponse({
            job_id: job.job_id,
            action: 'started'
          }, 'Processing job started via webhook'));
          break;

        default:
          return res.status(400).json(errorResponse(`Unknown action: ${action}`));
      }

    } catch (error) {
      next(error);
    }
  });

  return router;
}