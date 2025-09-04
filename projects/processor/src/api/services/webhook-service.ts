// Webhook service for N8N integration
import { getLogger } from '../../infrastructure/logging';

export interface WebhookConfig {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
}

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: any;
  source: string;
}

export class WebhookService {
  private config: WebhookConfig;
  private logger = getLogger();

  constructor(config: WebhookConfig) {
    this.config = config;
  }

  // =============================================
  // Job Event Webhooks
  // =============================================

  public async notifyJobStarted(jobId: string, shopType: string, totalProducts: number): Promise<void> {
    const payload: WebhookPayload = {
      event: 'job.started',
      timestamp: new Date().toISOString(),
      data: {
        job_id: jobId,
        shop_type: shopType,
        total_products: totalProducts,
        status: 'running'
      },
      source: 'supermarket-processor'
    };

    await this.sendWebhook('/webhook/processor/job-started', payload);
  }

  public async notifyJobProgress(jobId: string, progress: {
    shop_type: string;
    progress_percentage: number;
    processed_count: number;
    total_products: number;
    success_count: number;
    failed_count: number;
    current_batch?: number;
    total_batches?: number;
  }): Promise<void> {
    const payload: WebhookPayload = {
      event: 'job.progress',
      timestamp: new Date().toISOString(),
      data: {
        job_id: jobId,
        ...progress
      },
      source: 'supermarket-processor'
    };

    await this.sendWebhook('/webhook/processor/job-progress', payload);
  }

  public async notifyJobCompleted(jobId: string, result: {
    shop_type: string;
    total_processed: number;
    success_count: number;
    failed_count: number;
    skipped_count: number;
    deduped_count: number;
    duration_ms: number;
    error_count?: number;
  }): Promise<void> {
    const payload: WebhookPayload = {
      event: 'job.completed',
      timestamp: new Date().toISOString(),
      data: {
        job_id: jobId,
        status: 'completed',
        ...result
      },
      source: 'supermarket-processor'
    };

    await this.sendWebhook('/webhook/processor/job-completed', payload);
  }

  public async notifyJobFailed(jobId: string, error: {
    shop_type: string;
    error_message: string;
    processed_count?: number;
    failed_count?: number;
  }): Promise<void> {
    const payload: WebhookPayload = {
      event: 'job.failed',
      timestamp: new Date().toISOString(),
      data: {
        job_id: jobId,
        status: 'failed',
        ...error
      },
      source: 'supermarket-processor'
    };

    await this.sendWebhook('/webhook/processor/job-failed', payload);
  }

  // =============================================
  // Processing Event Webhooks
  // =============================================

  public async notifyProcessingReady(shopType: string, readyCount: number, pendingCount: number): Promise<void> {
    const payload: WebhookPayload = {
      event: 'processing.ready',
      timestamp: new Date().toISOString(),
      data: {
        shop_type: shopType,
        ready_products: readyCount,
        pending_products: pendingCount,
        status: 'ready_for_processing'
      },
      source: 'supermarket-processor'
    };

    await this.sendWebhook('/webhook/processor/processing-ready', payload);
  }

  public async notifyHighErrorRate(jobId: string, errorStats: {
    shop_type: string;
    error_rate: number;
    total_errors: number;
    processed_count: number;
    error_types: string[];
  }): Promise<void> {
    const payload: WebhookPayload = {
      event: 'processing.high_error_rate',
      timestamp: new Date().toISOString(),
      data: {
        job_id: jobId,
        alert_type: 'high_error_rate',
        ...errorStats
      },
      source: 'supermarket-processor'
    };

    await this.sendWebhook('/webhook/processor/alert', payload);
  }

  // =============================================
  // Data Event Webhooks
  // =============================================

  public async notifyDataProcessed(jobId: string, summary: {
    shop_type: string;
    processed_products: number;
    new_products: number;
    updated_products: number;
    categories_processed: string[];
    promotion_count: number;
  }): Promise<void> {
    const payload: WebhookPayload = {
      event: 'data.processed',
      timestamp: new Date().toISOString(),
      data: {
        job_id: jobId,
        ...summary
      },
      source: 'supermarket-processor'
    };

    await this.sendWebhook('/webhook/processor/data-processed', payload);
  }

  // =============================================
  // Core Webhook Functionality
  // =============================================

  private async sendWebhook(endpoint: string, payload: WebhookPayload, attempt: number = 1): Promise<void> {
    const url = `${this.config.baseUrl}${endpoint}`;
    
    try {
      this.logger.debug('Sending webhook', {
        context: {
          url,
          event: payload.event,
          attempt,
          maxAttempts: this.config.retryAttempts
        }
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'supermarket-processor/1.0',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.config.timeout)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.logger.debug('Webhook sent successfully', {
        context: {
          url,
          event: payload.event,
          status: response.status,
          attempt
        }
      });

    } catch (error) {
      this.logger.warn('Webhook delivery failed', {
        context: {
          url,
          event: payload.event,
          attempt,
          maxAttempts: this.config.retryAttempts
        },
        error
      });

      // Retry logic
      if (attempt < this.config.retryAttempts) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000); // Exponential backoff, max 30s
        
        this.logger.info('Retrying webhook delivery', {
          context: {
            url,
            event: payload.event,
            attempt: attempt + 1,
            delayMs: delay
          }
        });

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendWebhook(endpoint, payload, attempt + 1);
      } else {
        this.logger.error('Webhook delivery failed after all retries', {
          context: {
            url,
            event: payload.event,
            totalAttempts: attempt
          },
          error
        });
        // Don't throw error - webhook failures shouldn't break processing
      }
    }
  }

  // =============================================
  // Batch Webhook Operations
  // =============================================

  public async sendBatchWebhooks(webhooks: Array<{
    endpoint: string;
    payload: WebhookPayload;
  }>): Promise<void> {
    const promises = webhooks.map(({ endpoint, payload }) =>
      this.sendWebhook(endpoint, payload).catch(error => {
        this.logger.warn('Batch webhook failed', { context: { endpoint, event: payload.event }, error });
      })
    );

    await Promise.allSettled(promises);
  }

  // =============================================
  // Configuration and Health
  // =============================================

  public async testWebhookConnection(): Promise<boolean> {
    try {
      const testPayload: WebhookPayload = {
        event: 'system.health_check',
        timestamp: new Date().toISOString(),
        data: {
          status: 'healthy',
          version: process.env.npm_package_version || '1.0.0'
        },
        source: 'supermarket-processor'
      };

      await this.sendWebhook('/webhook/processor/health-check', testPayload);
      return true;

    } catch (error) {
      this.logger.critical('Webhook connection test failed', error);
      return false;
    }
  }

  public getConfig(): WebhookConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<WebhookConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Webhook configuration updated', {
      context: { config: this.config }
    });
  }
}

// Helper function to create default webhook configuration
export function createWebhookConfig(): WebhookConfig {
  return {
    baseUrl: process.env.WEBHOOK_BASE_URL || 'http://n8n:5678',
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT || '5000', 10),
    retryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS || '3', 10)
  };
}