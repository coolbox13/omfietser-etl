// src/infrastructure/monitoring/progress-tracker.ts

import { 
  ProcessingMetrics, 
  OverallProcessingStatus, 
  ShopType,
  PerformanceThresholds
} from '../../types/monitoring';
import { getIssueTracker } from '../logging/issue-tracker';
import { EventEmitter } from 'events';

/**
 * Real-time progress tracking for processing operations
 */
export class ProgressTracker extends EventEmitter {
  private shopMetrics: Map<ShopType, ProcessingMetrics> = new Map();
  private performanceThresholds: PerformanceThresholds;
  private issueTracker = getIssueTracker();

  constructor(performanceThresholds?: PerformanceThresholds) {
    super();
    this.performanceThresholds = performanceThresholds || this.getDefaultThresholds();
  }

  /**
   * Initialize tracking for a shop processor
   */
  public initializeShop(
    shopType: ShopType, 
    totalProducts: number, 
    totalBatches: number
  ): void {
    const metrics: ProcessingMetrics = {
      shopType,
      startTime: new Date(),
      currentTime: new Date(),
      totalProducts,
      processedProducts: 0,
      successfulProducts: 0,
      failedProducts: 0,
      skippedProducts: 0,
      currentBatch: 0,
      totalBatches,
      processingSpeed: 0,
      memoryUsage: 0,
      errorCount: 0,
      warningCount: 0,
      issueCount: 0,
      estimatedTimeRemaining: 0
    };

    this.shopMetrics.set(shopType, metrics);
    this.emit('shopInitialized', shopType, metrics);
  }

  /**
   * Update progress for a shop processor
   */
  public updateProgress(
    shopType: ShopType,
    update: Partial<ProcessingMetrics>
  ): void {
    const metrics = this.shopMetrics.get(shopType);
    if (!metrics) {
      throw new Error(`Shop ${shopType} not initialized`);
    }

    // Update metrics
    Object.assign(metrics, update, { currentTime: new Date() });

    // Calculate processing speed
    const elapsedSeconds = (metrics.currentTime.getTime() - metrics.startTime.getTime()) / 1000;
    metrics.processingSpeed = elapsedSeconds > 0 ? metrics.processedProducts / elapsedSeconds : 0;

    // Calculate estimated time remaining
    if (metrics.processingSpeed > 0) {
      const remainingProducts = metrics.totalProducts - metrics.processedProducts;
      metrics.estimatedTimeRemaining = remainingProducts / metrics.processingSpeed;
    }

    // Update memory usage
    metrics.memoryUsage = this.getCurrentMemoryUsage();

    // Check for performance issues
    this.checkPerformanceThresholds(shopType, metrics);

    this.emit('progressUpdated', shopType, metrics);
  }

  /**
   * Update batch progress
   */
  public updateBatchProgress(
    shopType: ShopType,
    batchIndex: number,
    batchResults: {
      processed: number;
      successful: number;
      failed: number;
      skipped: number;
    }
  ): void {
    const metrics = this.shopMetrics.get(shopType);
    if (!metrics) return;

    metrics.currentBatch = batchIndex + 1;
    metrics.processedProducts += batchResults.processed;
    metrics.successfulProducts += batchResults.successful;
    metrics.failedProducts += batchResults.failed;
    metrics.skippedProducts += batchResults.skipped;

    this.updateProgress(shopType, {});
    this.emit('batchCompleted', shopType, batchIndex, batchResults);
  }

  /**
   * Increment error count
   */
  public incrementErrorCount(shopType: ShopType): void {
    const metrics = this.shopMetrics.get(shopType);
    if (metrics) {
      metrics.errorCount++;
      this.emit('errorOccurred', shopType, metrics.errorCount);
    }
  }

  /**
   * Increment warning count
   */
  public incrementWarningCount(shopType: ShopType): void {
    const metrics = this.shopMetrics.get(shopType);
    if (metrics) {
      metrics.warningCount++;
      this.emit('warningOccurred', shopType, metrics.warningCount);
    }
  }

  /**
   * Increment issue count
   */
  public incrementIssueCount(shopType: ShopType): void {
    const metrics = this.shopMetrics.get(shopType);
    if (metrics) {
      metrics.issueCount++;
      this.emit('issueDetected', shopType, metrics.issueCount);
    }
  }

  /**
   * Mark shop processing as completed
   */
  public completeShop(shopType: ShopType): void {
    const metrics = this.shopMetrics.get(shopType);
    if (metrics) {
      metrics.currentTime = new Date();
      this.emit('shopCompleted', shopType, metrics);
    }
  }

  /**
   * Get metrics for a specific shop
   */
  public getShopMetrics(shopType: ShopType): ProcessingMetrics | undefined {
    return this.shopMetrics.get(shopType);
  }

  /**
   * Get overall processing status
   */
  public getOverallStatus(): OverallProcessingStatus {
    const shops = Object.fromEntries(this.shopMetrics) as Record<ShopType, ProcessingMetrics>;
    
    const totalMetrics = Array.from(this.shopMetrics.values()).reduce(
      (acc, metrics) => ({
        totalProducts: acc.totalProducts + metrics.totalProducts,
        processedProducts: acc.processedProducts + metrics.processedProducts,
        successfulProducts: acc.successfulProducts + metrics.successfulProducts,
        failedProducts: acc.failedProducts + metrics.failedProducts,
        skippedProducts: acc.skippedProducts + metrics.skippedProducts,
        overallProgress: 0, // Will be calculated below
        averageSpeed: 0,    // Will be calculated below
        totalMemoryUsage: acc.totalMemoryUsage + metrics.memoryUsage,
        totalIssues: acc.totalIssues + metrics.issueCount
      }),
      {
        totalProducts: 0,
        processedProducts: 0,
        successfulProducts: 0,
        failedProducts: 0,
        skippedProducts: 0,
        overallProgress: 0,
        averageSpeed: 0,
        totalMemoryUsage: 0,
        totalIssues: 0
      }
    );

    // Calculate overall progress percentage
    totalMetrics.overallProgress = totalMetrics.totalProducts > 0 
      ? (totalMetrics.processedProducts / totalMetrics.totalProducts) * 100 
      : 0;

    // Calculate average processing speed
    const activeShops = Array.from(this.shopMetrics.values()).filter(m => m.processingSpeed > 0);
    totalMetrics.averageSpeed = activeShops.length > 0
      ? activeShops.reduce((sum, m) => sum + m.processingSpeed, 0) / activeShops.length
      : 0;

    const isRunning = Array.from(this.shopMetrics.values()).some(
      metrics => metrics.processedProducts < metrics.totalProducts
    );

    const earliestStartTime = Array.from(this.shopMetrics.values()).reduce(
      (earliest, metrics) => metrics.startTime < earliest ? metrics.startTime : earliest,
      new Date()
    );

    return {
      isRunning,
      startTime: earliestStartTime,
      shops,
      totalMetrics
    };
  }

  /**
   * Get progress percentage for a shop
   */
  public getShopProgress(shopType: ShopType): number {
    const metrics = this.shopMetrics.get(shopType);
    if (!metrics || metrics.totalProducts === 0) return 0;
    return (metrics.processedProducts / metrics.totalProducts) * 100;
  }

  /**
   * Check if all shops are completed
   */
  public isAllCompleted(): boolean {
    return Array.from(this.shopMetrics.values()).every(
      metrics => metrics.processedProducts >= metrics.totalProducts
    );
  }

  /**
   * Reset all tracking data
   */
  public reset(): void {
    this.shopMetrics.clear();
    this.emit('reset');
  }

  /**
   * Get current memory usage in MB
   */
  private getCurrentMemoryUsage(): number {
    const usage = process.memoryUsage();
    return Math.round(usage.heapUsed / 1024 / 1024);
  }

  /**
   * Check performance thresholds and track warnings
   */
  private checkPerformanceThresholds(shopType: ShopType, metrics: ProcessingMetrics): void {
    // Check processing speed
    if (metrics.processingSpeed > 0 && metrics.processingSpeed < this.performanceThresholds.minProcessingSpeed) {
      this.issueTracker.trackPerformanceWarning(
        {
          processingStep: 'batch_processing',
          shopType,
          productId: 'N/A'
        },
        'processing_speed',
        metrics.processingSpeed,
        this.performanceThresholds.minProcessingSpeed
      );
    }

    // Check memory usage
    if (metrics.memoryUsage > this.performanceThresholds.maxMemoryUsagePerBatch) {
      this.issueTracker.trackPerformanceWarning(
        {
          processingStep: 'batch_processing',
          shopType,
          productId: 'N/A'
        },
        'memory_usage',
        metrics.memoryUsage,
        this.performanceThresholds.maxMemoryUsagePerBatch
      );
    }

    // Check error rate
    if (metrics.processedProducts > 0) {
      const errorRate = (metrics.failedProducts / metrics.processedProducts) * 100;
      if (errorRate > this.performanceThresholds.maxErrorRate) {
        this.issueTracker.trackPerformanceWarning(
          {
            processingStep: 'batch_processing',
            shopType,
            productId: 'N/A'
          },
          'error_rate',
          errorRate,
          this.performanceThresholds.maxErrorRate
        );
      }
    }
  }

  /**
   * Get default performance thresholds
   */
  private getDefaultThresholds(): PerformanceThresholds {
    return {
      maxProcessingTimePerProduct: 100,  // 100ms per product
      maxMemoryUsagePerBatch: 512,       // 512MB per batch
      minProcessingSpeed: 10,            // 10 products per second
      maxErrorRate: 5                    // 5% error rate
    };
  }
}

// Singleton instance
let progressTrackerInstance: ProgressTracker | null = null;

/**
 * Initialize the progress tracker
 */
export function initializeProgressTracker(thresholds?: PerformanceThresholds): ProgressTracker {
  progressTrackerInstance = new ProgressTracker(thresholds);
  return progressTrackerInstance;
}

/**
 * Get the progress tracker instance
 */
export function getProgressTracker(): ProgressTracker {
  if (!progressTrackerInstance) {
    progressTrackerInstance = new ProgressTracker();
  }
  return progressTrackerInstance;
}
