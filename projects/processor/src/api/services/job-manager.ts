// Job management system for processing orchestration
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { getSyncDatabaseAdapter } from '../../infrastructure/database';
import { getLogger } from '../../infrastructure/logging';
import { WebhookService } from './webhook-service';
import {
  ProcessingJob,
  ProcessingJobInsert,
  RawProduct,
  ProcessedProduct,
  ProcessingError,
  ProcessedProductInsert,
  ProcessingErrorInsert,
  IDatabaseAdapter
} from '../../infrastructure/database/types';

// Job-related types
export interface JobConfiguration {
  shop_type: string;
  batch_size?: number;
  retry_attempts?: number;
  timeout_ms?: number;
  metadata?: any;
}

export interface JobProgress {
  job_id: string;
  shop_type: string;
  status: ProcessingJob['status'];
  total_products: number;
  processed_count: number;
  success_count: number;
  failed_count: number;
  skipped_count: number;
  deduped_count: number;
  started_at?: Date;
  estimated_completion?: Date;
  progress_percentage: number;
  current_batch?: number;
  total_batches?: number;
}

export interface ProcessingResult {
  job_id: string;
  success: boolean;
  total_processed: number;
  success_count: number;
  failed_count: number;
  skipped_count: number;
  deduped_count: number;
  duration_ms: number;
  errors: ProcessingError[];
}

// Output target control via environment variable
// Values: 'staging' | 'processed' | 'both' (default: 'both')
function getOutputTarget(): 'staging' | 'processed' | 'both' {
  const value = (process.env.OUTPUT_TARGET || 'both').toLowerCase();
  if (value === 'staging' || value === 'processed' || value === 'both') {
    return value;
  }
  return 'both';
}

// Events that the JobManager can emit
export type JobManagerEvents = {
  'job:created': (job: ProcessingJob) => void;
  'job:started': (job: ProcessingJob) => void;
  'job:progress': (progress: JobProgress) => void;
  'job:completed': (result: ProcessingResult) => void;
  'job:failed': (job: ProcessingJob, error: Error) => void;
  'job:cancelled': (job: ProcessingJob) => void;
  'batch:started': (jobId: string, batchNumber: number, batchSize: number) => void;
  'batch:completed': (jobId: string, batchNumber: number, batchResults: { success: number; failed: number }) => void;
};

export class JobManager extends EventEmitter {
  private static instance: JobManager;
  private dbAdapter: IDatabaseAdapter;
  private logger = getLogger();
  private activeJobs = new Map<string, ProcessingJob>();
  private jobTimers = new Map<string, NodeJS.Timeout>();
  private webhookService: WebhookService | null = null;

  private constructor(dbAdapter: IDatabaseAdapter) {
    super();
    this.dbAdapter = dbAdapter;
  }

  public static getInstance(dbAdapter?: IDatabaseAdapter): JobManager {
    if (!JobManager.instance) {
      if (!dbAdapter) {
        throw new Error('Database adapter is required for first initialization');
      }
      JobManager.instance = new JobManager(dbAdapter);
    }
    return JobManager.instance;
  }

  public setWebhookService(webhookService: WebhookService): void {
    this.webhookService = webhookService;
    this.logger.info('Webhook service configured for job manager');
  }

  public isReady(): boolean {
    return !!this.dbAdapter;
  }

  // =============================================
  // Job Creation and Management
  // =============================================

  public async createJob(config: JobConfiguration): Promise<ProcessingJob> {
    try {
      const jobInsert: ProcessingJobInsert = {
        shop_type: config.shop_type,
        batch_size: config.batch_size || 100,
        metadata: {
          ...config.metadata,
          retry_attempts: config.retry_attempts || 3,
          timeout_ms: config.timeout_ms || 300000, // 5 minutes default
          created_by: 'job-manager',
          configuration: config
        }
      };

      const job = await this.dbAdapter.createProcessingJob(jobInsert);
      this.activeJobs.set(job.job_id, job);

      this.logger.info('Processing job created', {
        context: {
          jobId: job.job_id,
          shopType: job.shop_type,
          batchSize: job.batch_size
        }
      });

      this.emit('job:created', job);
      return job;

    } catch (error) {
      this.logger.error('Failed to create processing job', { context: { config }, error });
      throw error;
    }
  }

  public async startJob(jobId: string): Promise<void> {
    try {
      const job = await this.getJobById(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      if (job.status !== 'pending') {
        throw new Error(`Job ${jobId} is not in pending status (current: ${job.status})`);
      }

      // Get raw products to process
      const rawProducts = await this.dbAdapter.getRawProducts({
        shop_type: job.shop_type,
        limit: 10000 // Reasonable limit for batch processing
      });

      if (rawProducts.length === 0) {
        throw new Error(`No raw products found for shop type: ${job.shop_type}`);
      }

      // Update job status and start processing
      const updatedJob = await this.dbAdapter.updateProcessingJob(jobId, {
        status: 'running',
        started_at: new Date(),
        total_products: rawProducts.length
      });

      this.activeJobs.set(jobId, updatedJob);

      this.logger.info('Processing job started', {
        context: {
          jobId,
          shopType: job.shop_type,
          totalProducts: rawProducts.length
        }
      });

      this.emit('job:started', updatedJob);

      // Send webhook notification
      if (this.webhookService) {
        this.webhookService.notifyJobStarted(jobId, job.shop_type, rawProducts.length)
          .catch(error => {
            this.logger.warn('Failed to send job started webhook', { context: { jobId }, error });
          });
      }

      // Start processing in background
      this.processJobAsync(updatedJob, rawProducts).catch(error => {
        this.logger.error('Job processing failed', { context: { jobId }, error });
        this.handleJobFailure(jobId, error);
      });

    } catch (error) {
      this.logger.error('Failed to start processing job', { context: { jobId }, error });
      throw error;
    }
  }

  public async cancelJob(jobId: string, reason?: string): Promise<void> {
    try {
      const job = await this.getJobById(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      if (job.status === 'completed' || job.status === 'failed') {
        throw new Error(`Cannot cancel job in ${job.status} status`);
      }

      // Clear any running timers
      const timer = this.jobTimers.get(jobId);
      if (timer) {
        clearTimeout(timer);
        this.jobTimers.delete(jobId);
      }

      // Update job status
      const updatedJob = await this.dbAdapter.updateProcessingJob(jobId, {
        status: 'cancelled',
        completed_at: new Date(),
        error_message: reason || 'Job cancelled by user'
      });

      this.activeJobs.delete(jobId);
      
      this.logger.info('Processing job cancelled', {
        context: { jobId, reason }
      });

      this.emit('job:cancelled', updatedJob);

    } catch (error) {
      this.logger.error('Failed to cancel processing job', { context: { jobId, reason }, error });
      throw error;
    }
  }

  // =============================================
  // Job Processing Logic
  // =============================================

  private async processJobAsync(job: ProcessingJob, rawProducts: RawProduct[]): Promise<void> {
    const jobId = job.job_id;
    const batchSize = job.batch_size;
    const totalBatches = Math.ceil(rawProducts.length / batchSize);
    const outputTarget = getOutputTarget();

    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let totalDeduped = 0;
    const allErrors: ProcessingError[] = [];

    try {
      // Process in batches
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const batchNumber = batchIndex + 1;
        const startIndex = batchIndex * batchSize;
        const endIndex = Math.min(startIndex + batchSize, rawProducts.length);
        const batchProducts = rawProducts.slice(startIndex, endIndex);

        this.emit('batch:started', jobId, batchNumber, batchProducts.length);

        this.logger.info('Processing batch', {
          context: {
            jobId,
            batchNumber,
            totalBatches,
            batchSize: rawProducts.length,
            outputTarget
          }
        });

        // Process batch using the database processor adapter
        const batchResult = await this.processBatch(job, batchProducts);

        // Update counters
        totalProcessed += batchResult.processed;
        totalSuccess += batchResult.success;
        totalFailed += batchResult.failed;
        totalSkipped += batchResult.skipped;
        totalDeduped += batchResult.deduped;
        allErrors.push(...batchResult.errors);

        this.emit('batch:completed', jobId, batchNumber, {
          success: batchResult.success,
          failed: batchResult.failed
        });

        // Update job progress
        const progress: JobProgress = {
          job_id: jobId,
          shop_type: job.shop_type,
          status: 'running',
          total_products: job.total_products,
          processed_count: totalProcessed,
          success_count: totalSuccess,
          failed_count: totalFailed,
          skipped_count: totalSkipped,
          deduped_count: totalDeduped,
          started_at: job.started_at,
          progress_percentage: (totalProcessed / job.total_products) * 100,
          current_batch: batchNumber,
          total_batches: totalBatches
        };

        // Estimate completion time
        if (job.started_at && totalProcessed > 0) {
          const elapsedMs = Date.now() - job.started_at.getTime();
          const avgProcessingTime = elapsedMs / totalProcessed;
          const remainingProducts = job.total_products - totalProcessed;
          const estimatedRemainingMs = remainingProducts * avgProcessingTime;
          progress.estimated_completion = new Date(Date.now() + estimatedRemainingMs);
        }

        this.emit('job:progress', progress);

        // Send webhook notification for progress updates (every 10th batch or significant milestones)
        if (this.webhookService && (batchNumber % 10 === 0 || batchNumber === totalBatches)) {
          this.webhookService.notifyJobProgress(jobId, {
            shop_type: job.shop_type,
            progress_percentage: progress.progress_percentage,
            processed_count: totalProcessed,
            total_products: job.total_products,
            success_count: totalSuccess,
            failed_count: totalFailed,
            current_batch: batchNumber,
            total_batches: totalBatches
          }).catch(error => {
            this.logger.warn('Failed to send job progress webhook', { context: { jobId, batchNumber }, error });
          });
        }

        // Update database with current progress
        await this.dbAdapter.updateProcessingJob(jobId, {
          processed_count: totalProcessed,
          success_count: totalSuccess,
          failed_count: totalFailed,
          skipped_count: totalSkipped,
          deduped_count: totalDeduped
        });
      }

      // Complete the job
      await this.completeJob(jobId, {
        success_count: totalSuccess,
        failed_count: totalFailed,
        skipped_count: totalSkipped,
        deduped_count: totalDeduped
      });

      const duration = job.started_at ? Date.now() - job.started_at.getTime() : 0;

      const result: ProcessingResult = {
        job_id: jobId,
        success: true,
        total_processed: totalProcessed,
        success_count: totalSuccess,
        failed_count: totalFailed,
        skipped_count: totalSkipped,
        deduped_count: totalDeduped,
        duration_ms: duration,
        errors: allErrors
      };

      this.emit('job:completed', result);

      // Send webhook notification for job completion
      if (this.webhookService) {
        this.webhookService.notifyJobCompleted(jobId, {
          shop_type: job.shop_type,
          total_processed: totalProcessed,
          success_count: totalSuccess,
          failed_count: totalFailed,
          skipped_count: totalSkipped,
          deduped_count: totalDeduped,
          duration_ms: duration,
          error_count: allErrors.length
        }).catch(error => {
          this.logger.warn('Failed to send job completed webhook', { context: { jobId }, error });
        });
      }

    } catch (error) {
      this.logger.error('Job processing failed', { context: { jobId }, error });
      await this.handleJobFailure(jobId, error as Error);
    }
  }

  private async processBatch(job: ProcessingJob, rawProducts: RawProduct[]): Promise<{
    processed: number;
    success: number;
    failed: number;
    skipped: number;
    deduped: number;
    errors: ProcessingError[];
    successfulProducts: Set<string>;
  }> {
    try {
      // Use the database processor adapter to process this batch  
      const { DatabaseProcessorAdapter } = await import('../../adapters/database-processor-adapter');
      const adapter = new DatabaseProcessorAdapter({
        jobId: job.job_id,
        shopType: job.shop_type,
        batchSize: rawProducts.length,
        enableProgressUpdates: true,
        progressUpdateInterval: 100,
        enforceStructureValidation: true
      });
      
      this.logger.info('Processing batch with database adapter', {
        context: {
          jobId: job.job_id,
          shopType: job.shop_type,
          batchSize: rawProducts.length
        }
      });

      // Process the batch using the integrated adapter
      const batchResult = await adapter.processBatch(rawProducts);

      // Convert to the format expected by the job manager
      const result = {
        processed: batchResult.processed,
        success: batchResult.success,
        failed: batchResult.failed,
        skipped: batchResult.skipped,
        deduped: batchResult.deduped,
        errors: [], // Already stored in database by the adapter
        successfulProducts: batchResult.successfulProducts
      };

      this.logger.info('Batch processing completed successfully', {
        context: {
          jobId: job.job_id,
          shopType: job.shop_type,
          result: {
            processed: result.processed,
            success: result.success,
            failed: result.failed,
            skipped: result.skipped,
            deduped: result.deduped
          }
        }
      });

      return result;

    } catch (error) {
      this.logger.error('Batch processing failed', {
        context: {
          jobId: job.job_id,
          shopType: job.shop_type,
          batchSize: rawProducts.length
        },
        error
      });

      // Create error records for all products in the batch
      const errors: ProcessingError[] = [];
      for (const rawProduct of rawProducts) {
        errors.push({
          id: '', // Will be generated by database
          job_id: job.job_id,
          raw_product_id: rawProduct.id,
          product_id: rawProduct.id,
          error_type: 'BATCH_PROCESSING_FAILURE',
          error_message: error instanceof Error ? error.message : 'Unknown batch processing error',
          error_details: { error },
          stack_trace: error instanceof Error ? error.stack : undefined,
          severity: 'high',
          is_resolved: false,
          created_at: new Date()
        });
      }

      // Store errors in database
      if (errors.length > 0) {
        try {
          await this.dbAdapter.insertProcessingErrors(errors.map(err => ({
            job_id: err.job_id,
            raw_product_id: err.raw_product_id,
            product_id: err.product_id,
            error_type: err.error_type,
            error_message: err.error_message,
            error_details: err.error_details,
            stack_trace: err.stack_trace,
            severity: err.severity
          })));
        } catch (dbError) {
          this.logger.error('Failed to store batch processing errors', { error: dbError });
        }
      }

      return {
        processed: rawProducts.length,
        success: 0,
        failed: rawProducts.length,
        skipped: 0,
        deduped: 0,
        errors: errors,
        successfulProducts: new Set<string>()
      };
    }
  }

  private async completeJob(jobId: string, stats: {
    success_count: number;
    failed_count: number;
    skipped_count: number;
    deduped_count: number;
  }): Promise<void> {
    await this.dbAdapter.completeProcessingJob(jobId, stats);
    this.activeJobs.delete(jobId);

    // Clear any timers
    const timer = this.jobTimers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.jobTimers.delete(jobId);
    }

    this.logger.info('Processing job completed', {
      context: { jobId, stats }
    });
  }

  private async handleJobFailure(jobId: string, error: Error): Promise<void> {
    try {
      const updatedJob = await this.dbAdapter.updateProcessingJob(jobId, {
        status: 'failed',
        completed_at: new Date(),
        error_message: error.message
      });

      this.activeJobs.delete(jobId);

      // Clear any timers
      const timer = this.jobTimers.get(jobId);
      if (timer) {
        clearTimeout(timer);
        this.jobTimers.delete(jobId);
      }

      this.emit('job:failed', updatedJob, error);

      // Send webhook notification for job failure
      if (this.webhookService) {
        const job = await this.dbAdapter.getProcessingJobById(jobId);
        this.webhookService.notifyJobFailed(jobId, {
          shop_type: job?.shop_type || 'unknown',
          error_message: error.message,
          processed_count: job?.processed_count || 0,
          failed_count: job?.failed_count || 0
        }).catch(webhookError => {
          this.logger.warn('Failed to send job failed webhook', { context: { jobId }, error: webhookError });
        });
      }

    } catch (updateError) {
      this.logger.error('Failed to update job status after failure', {
        context: { jobId, originalError: error.message },
        error: updateError
      });
    }
  }

  // =============================================
  // Job Query and Status Methods
  // =============================================

  public async getJobById(jobId: string): Promise<ProcessingJob | null> {
    // Check active jobs first
    const activeJob = this.activeJobs.get(jobId);
    if (activeJob) {
      return activeJob;
    }

    // Query database
    return await this.dbAdapter.getProcessingJobById(jobId);
  }

  public async getJobProgress(jobId: string): Promise<JobProgress | null> {
    const job = await this.getJobById(jobId);
    if (!job) return null;

    const progress: JobProgress = {
      job_id: job.job_id,
      shop_type: job.shop_type,
      status: job.status,
      total_products: job.total_products,
      processed_count: job.processed_count,
      success_count: job.success_count,
      failed_count: job.failed_count,
      skipped_count: job.skipped_count,
      deduped_count: job.deduped_count,
      started_at: job.started_at || undefined,
      progress_percentage: job.total_products > 0 ? (job.processed_count / job.total_products) * 100 : 0
    };

    return progress;
  }

  public async getActiveJobs(): Promise<ProcessingJob[]> {
    return Array.from(this.activeJobs.values());
  }

  public async getJobStatistics(jobId?: string) {
    return await this.dbAdapter.getJobStatistics(jobId);
  }

  public async getJobErrors(jobId: string): Promise<ProcessingError[]> {
    return await this.dbAdapter.getProcessingErrors({ job_id: jobId });
  }

  // =============================================
  // Cleanup and Maintenance
  // =============================================

  public async cleanup(): Promise<void> {
    // Clear all timers
    for (const timer of this.jobTimers.values()) {
      clearTimeout(timer);
    }
    this.jobTimers.clear();

    // Clear active jobs
    this.activeJobs.clear();

    this.logger.info('Job manager cleanup completed');
  }

  public getInstanceStats() {
    return {
      activeJobs: this.activeJobs.size,
      activeTimers: this.jobTimers.size,
      listenerCount: this.listenerCount('job:progress')
    };
  }
}

// Singleton access functions
export async function initializeJobManager(): Promise<JobManager> {
  const dbAdapter = getSyncDatabaseAdapter();
  return JobManager.getInstance(dbAdapter);
}

export function getJobManager(): JobManager {
  const dbAdapter = getSyncDatabaseAdapter();
  return JobManager.getInstance(dbAdapter);
}