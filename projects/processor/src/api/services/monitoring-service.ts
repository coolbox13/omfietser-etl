// Enhanced monitoring service for database-driven processing
import { EventEmitter } from 'events';
import { getSyncDatabaseAdapter } from '../../infrastructure/database';
import { getJobManager } from './job-manager';
import { getLogger } from '../../infrastructure/logging';
import { WebhookService } from './webhook-service';
import {
  ProcessingJob,
  ProcessingError,
  JobStatistics,
  ErrorSummary,
  IDatabaseAdapter
} from '../../infrastructure/database/types';

export interface MonitoringConfig {
  enableRealTimeTracking: boolean;
  performanceThresholds: {
    maxProcessingTimeMs: number;
    maxErrorRate: number; // percentage (0-100)
    maxMemoryUsageMB: number;
    minSuccessRate: number; // percentage (0-100)
  };
  alerting: {
    enableWebhookAlerts: boolean;
    enableLogAlerts: boolean;
    alertCooldownMs: number; // Prevent spam alerts
  };
  metricsRetentionDays: number;
}

export interface SystemMetrics {
  timestamp: Date;
  database: {
    connectionCount: number;
    queryPerformance: {
      avgQueryTimeMs: number;
      slowQueries: number;
    };
    poolStats: any;
  };
  processing: {
    activeJobs: number;
    totalJobsToday: number;
    avgJobDurationMs: number;
    currentThroughputPerMinute: number;
  };
  system: {
    memoryUsageMB: number;
    cpuUsagePercent: number;
    uptimeSeconds: number;
  };
  errors: {
    totalErrorsLast24h: number;
    criticalErrorsLast24h: number;
    errorRate: number;
    topErrorTypes: Array<{
      type: string;
      count: number;
      percentage: number;
    }>;
  };
}

export interface PerformanceAlert {
  id: string;
  timestamp: Date;
  type: 'high_error_rate' | 'slow_processing' | 'memory_usage' | 'job_failure' | 'database_performance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: any;
  jobId?: string;
  shopType?: string;
}

export class MonitoringService extends EventEmitter {
  private static instance: MonitoringService;
  private dbAdapter: IDatabaseAdapter;
  private logger = getLogger();
  private config: MonitoringConfig;
  private webhookService: WebhookService | null = null;
  private metricsHistory: SystemMetrics[] = [];
  private alertHistory: PerformanceAlert[] = [];
  private lastAlertTimes = new Map<string, number>();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;

  private constructor(config: MonitoringConfig) {
    super();
    this.config = config;
    this.dbAdapter = getSyncDatabaseAdapter();
  }

  public static getInstance(config?: MonitoringConfig): MonitoringService {
    if (!MonitoringService.instance) {
      if (!config) {
        throw new Error('Monitoring configuration is required for first initialization');
      }
      MonitoringService.instance = new MonitoringService(config);
    }
    return MonitoringService.instance;
  }

  public setWebhookService(webhookService: WebhookService): void {
    this.webhookService = webhookService;
    this.logger.info('Webhook service configured for monitoring');
  }

  // =============================================
  // Monitoring Control
  // =============================================

  public async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      this.logger.warn('Monitoring already started');
      return;
    }

    this.logger.info('Starting enhanced monitoring service', {
      context: { config: this.config }
    });

    this.isMonitoring = true;

    // Set up job event listeners
    const jobManager = getJobManager();
    jobManager.on('job:started', this.onJobStarted.bind(this));
    jobManager.on('job:progress', this.onJobProgress.bind(this));
    jobManager.on('job:completed', this.onJobCompleted.bind(this));
    jobManager.on('job:failed', this.onJobFailed.bind(this));

    // Start periodic metrics collection
    if (this.config.enableRealTimeTracking) {
      this.monitoringInterval = setInterval(
        this.collectMetrics.bind(this),
        30000 // Collect metrics every 30 seconds
      );
    }

    this.logger.info('Enhanced monitoring service started');
  }

  public async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    this.logger.info('Stopping enhanced monitoring service');

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Clean up event listeners
    const jobManager = getJobManager();
    jobManager.removeAllListeners('job:started');
    jobManager.removeAllListeners('job:progress');
    jobManager.removeAllListeners('job:completed');
    jobManager.removeAllListeners('job:failed');

    this.logger.info('Enhanced monitoring service stopped');
  }

  // =============================================
  // Metrics Collection
  // =============================================

  private async collectMetrics(): Promise<void> {
    try {
      const timestamp = new Date();

      // Collect database metrics
      const dbStats = await this.dbAdapter.getConnectionStats();
      const dbHealthy = await this.dbAdapter.healthCheck();

      // Collect processing metrics
      const jobManager = getJobManager();
      const activeJobs = await jobManager.getActiveJobs();
      const jobStats = await this.dbAdapter.getJobStatistics();

      // Collect system metrics
      const systemMetrics = this.getSystemMetrics();

      // Collect error metrics
      const errorMetrics = await this.getErrorMetrics();

      const metrics: SystemMetrics = {
        timestamp,
        database: {
          connectionCount: dbStats?.totalCount || 0,
          queryPerformance: {
            avgQueryTimeMs: 0, // Would need query performance tracking
            slowQueries: 0
          },
          poolStats: dbStats
        },
        processing: {
          activeJobs: activeJobs.length,
          totalJobsToday: this.getTodaysJobCount(jobStats),
          avgJobDurationMs: this.getAvgJobDuration(jobStats),
          currentThroughputPerMinute: this.calculateThroughput()
        },
        system: systemMetrics,
        errors: errorMetrics
      };

      // Store metrics
      this.metricsHistory.push(metrics);

      // Keep only recent metrics (based on retention period)
      const cutoffDate = new Date(Date.now() - (this.config.metricsRetentionDays * 24 * 60 * 60 * 1000));
      this.metricsHistory = this.metricsHistory.filter(m => m.timestamp >= cutoffDate);

      // Check for performance issues
      await this.analyzeMetrics(metrics);

      this.emit('metrics:collected', metrics);

    } catch (error) {
      this.logger.critical('Failed to collect metrics', error);
    }
  }

  private getSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      memoryUsageMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      cpuUsagePercent: this.calculateCpuUsagePercent(cpuUsage),
      uptimeSeconds: Math.round(process.uptime())
    };
  }

  private async getErrorMetrics() {
    const last24h = new Date(Date.now() - (24 * 60 * 60 * 1000));

    const errors = await this.dbAdapter.getProcessingErrors({
      created_after: last24h,
      limit: 10000 // Get all errors from last 24h
    });

    const criticalErrors = errors.filter(e => e.severity === 'critical');
    const errorsByType = new Map<string, number>();

    errors.forEach(error => {
      const count = errorsByType.get(error.error_type) || 0;
      errorsByType.set(error.error_type, count + 1);
    });

    const topErrorTypes = Array.from(errorsByType.entries())
      .map(([type, count]) => ({
        type,
        count,
        percentage: (count / errors.length) * 100
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalErrorsLast24h: errors.length,
      criticalErrorsLast24h: criticalErrors.length,
      errorRate: this.calculateErrorRate(),
      topErrorTypes
    };
  }

  // =============================================
  // Performance Analysis and Alerting
  // =============================================

  private async analyzeMetrics(metrics: SystemMetrics): Promise<void> {
    const alerts: PerformanceAlert[] = [];

    // Check error rate
    if (metrics.errors.errorRate > this.config.performanceThresholds.maxErrorRate) {
      alerts.push(this.createAlert(
        'high_error_rate',
        'critical',
        `Error rate (${metrics.errors.errorRate.toFixed(2)}%) exceeds threshold (${this.config.performanceThresholds.maxErrorRate}%)`,
        { errorRate: metrics.errors.errorRate, threshold: this.config.performanceThresholds.maxErrorRate }
      ));
    }

    // Check memory usage
    if (metrics.system.memoryUsageMB > this.config.performanceThresholds.maxMemoryUsageMB) {
      alerts.push(this.createAlert(
        'memory_usage',
        'high',
        `Memory usage (${metrics.system.memoryUsageMB}MB) exceeds threshold (${this.config.performanceThresholds.maxMemoryUsageMB}MB)`,
        { memoryUsage: metrics.system.memoryUsageMB, threshold: this.config.performanceThresholds.maxMemoryUsageMB }
      ));
    }

    // Check processing performance
    if (metrics.processing.avgJobDurationMs > this.config.performanceThresholds.maxProcessingTimeMs) {
      alerts.push(this.createAlert(
        'slow_processing',
        'medium',
        `Average job duration (${metrics.processing.avgJobDurationMs}ms) exceeds threshold (${this.config.performanceThresholds.maxProcessingTimeMs}ms)`,
        { avgDuration: metrics.processing.avgJobDurationMs, threshold: this.config.performanceThresholds.maxProcessingTimeMs }
      ));
    }

    // Process alerts
    for (const alert of alerts) {
      await this.processAlert(alert);
    }
  }

  private createAlert(
    type: PerformanceAlert['type'],
    severity: PerformanceAlert['severity'],
    message: string,
    details: any,
    jobId?: string,
    shopType?: string
  ): PerformanceAlert {
    return {
      id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date(),
      type,
      severity,
      message,
      details,
      jobId,
      shopType
    };
  }

  private async processAlert(alert: PerformanceAlert): Promise<void> {
    const alertKey = `${alert.type}_${alert.jobId || 'global'}`;
    const lastAlertTime = this.lastAlertTimes.get(alertKey) || 0;
    const now = Date.now();

    // Check cooldown period
    if (now - lastAlertTime < this.config.alerting.alertCooldownMs) {
      return;
    }

    this.lastAlertTimes.set(alertKey, now);
    this.alertHistory.push(alert);

    this.logger.warn('Performance alert triggered', {
      context: { alert }
    });

    this.emit('alert:triggered', alert);

    // Send webhook alerts
    if (this.config.alerting.enableWebhookAlerts && this.webhookService) {
      if (alert.type === 'high_error_rate') {
        this.webhookService.notifyHighErrorRate(alert.jobId || 'unknown', {
          shop_type: alert.shopType || 'unknown',
          error_rate: alert.details.errorRate,
          total_errors: alert.details.totalErrors || 0,
          processed_count: alert.details.processedCount || 0,
          error_types: alert.details.topErrorTypes || []
        }).catch(error => {
          this.logger.warn('Failed to send high error rate webhook', error);
        });
      }
    }
  }

  // =============================================
  // Job Event Handlers
  // =============================================

  private async onJobStarted(job: ProcessingJob): Promise<void> {
    this.logger.info('Monitoring job started', {
      context: { jobId: job.job_id, shopType: job.shop_type }
    });
  }

  private async onJobProgress(progress: any): Promise<void> {
    // Track progress and detect anomalies
    if (progress.progress_percentage > 0) {
      const successRate = (progress.success_count / progress.processed_count) * 100;
      
      if (successRate < this.config.performanceThresholds.minSuccessRate) {
        const alert = this.createAlert(
          'high_error_rate',
          'high',
          `Job success rate (${successRate.toFixed(2)}%) below threshold (${this.config.performanceThresholds.minSuccessRate}%)`,
          {
            successRate,
            threshold: this.config.performanceThresholds.minSuccessRate,
            processed: progress.processed_count,
            success: progress.success_count,
            failed: progress.failed_count
          },
          progress.job_id,
          progress.shop_type
        );

        await this.processAlert(alert);
      }
    }
  }

  private async onJobCompleted(result: any): Promise<void> {
    this.logger.info('Monitoring job completed', {
      context: {
        jobId: result.job_id,
        duration: result.duration_ms,
        success: result.success,
        totalProcessed: result.total_processed
      }
    });

    // Check if job took too long
    if (result.duration_ms > this.config.performanceThresholds.maxProcessingTimeMs) {
      const alert = this.createAlert(
        'slow_processing',
        'medium',
        `Job completed slowly (${result.duration_ms}ms) exceeding threshold (${this.config.performanceThresholds.maxProcessingTimeMs}ms)`,
        {
          duration: result.duration_ms,
          threshold: this.config.performanceThresholds.maxProcessingTimeMs,
          totalProcessed: result.total_processed
        },
        result.job_id
      );

      await this.processAlert(alert);
    }
  }

  private async onJobFailed(job: ProcessingJob, error: Error): Promise<void> {
    this.logger.error('Monitoring job failed', {
      context: { jobId: job.job_id, shopType: job.shop_type },
      error
    });

    const alert = this.createAlert(
      'job_failure',
      'critical',
      `Job failed: ${error.message}`,
      {
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack
      },
      job.job_id,
      job.shop_type
    );

    await this.processAlert(alert);
  }

  // =============================================
  // Helper Methods
  // =============================================

  private calculateCpuUsagePercent(cpuUsage: NodeJS.CpuUsage): number {
    // This is a simplified calculation - would need proper baseline
    return Math.min((cpuUsage.user + cpuUsage.system) / 1000000, 100);
  }

  private getTodaysJobCount(jobStats: JobStatistics[]): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return jobStats.filter(job => 
      job.started_at && new Date(job.started_at) >= today
    ).length;
  }

  private getAvgJobDuration(jobStats: JobStatistics[]): number {
    const completedJobs = jobStats.filter(job => job.duration_ms && job.duration_ms > 0);
    if (completedJobs.length === 0) return 0;

    const totalDuration = completedJobs.reduce((sum, job) => sum + (job.duration_ms || 0), 0);
    return Math.round(totalDuration / completedJobs.length);
  }

  private calculateThroughput(): number {
    // Calculate products processed per minute in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - (5 * 60 * 1000));
    const recentMetrics = this.metricsHistory.filter(m => m.timestamp >= fiveMinutesAgo);

    if (recentMetrics.length < 2) return 0;

    const first = recentMetrics[0];
    const last = recentMetrics[recentMetrics.length - 1];
    const timeDiffMinutes = (last.timestamp.getTime() - first.timestamp.getTime()) / (1000 * 60);

    if (timeDiffMinutes === 0) return 0;

    // This would need actual throughput tracking
    return 0;
  }

  private calculateErrorRate(): number {
    // Calculate error rate from recent metrics
    const recentMetrics = this.metricsHistory.slice(-10);
    if (recentMetrics.length === 0) return 0;

    const avgErrorRate = recentMetrics.reduce((sum, m) => {
      const totalErrors = m.errors.totalErrorsLast24h;
      const rate = totalErrors > 0 ? (totalErrors / 1000) * 100 : 0; // Simplified calculation
      return sum + rate;
    }, 0) / recentMetrics.length;

    return Math.round(avgErrorRate * 100) / 100;
  }

  // =============================================
  // Public API
  // =============================================

  public getLatestMetrics(): SystemMetrics | null {
    return this.metricsHistory.length > 0 ? this.metricsHistory[this.metricsHistory.length - 1] : null;
  }

  public getMetricsHistory(hours: number = 24): SystemMetrics[] {
    const cutoff = new Date(Date.now() - (hours * 60 * 60 * 1000));
    return this.metricsHistory.filter(m => m.timestamp >= cutoff);
  }

  public getRecentAlerts(hours: number = 24): PerformanceAlert[] {
    const cutoff = new Date(Date.now() - (hours * 60 * 60 * 1000));
    return this.alertHistory.filter(a => a.timestamp >= cutoff);
  }

  public async generateHealthReport() {
    const metrics = this.getLatestMetrics();
    if (!metrics) return null;

    const recentAlerts = this.getRecentAlerts(1); // Last hour
    const criticalAlerts = recentAlerts.filter(a => a.severity === 'critical');

    return {
      timestamp: new Date(),
      overall_health: criticalAlerts.length === 0 ? 'healthy' : 'degraded',
      metrics,
      recent_alerts: recentAlerts,
      recommendations: this.generateRecommendations(metrics, recentAlerts)
    };
  }

  private generateRecommendations(metrics: SystemMetrics, alerts: PerformanceAlert[]): string[] {
    const recommendations: string[] = [];

    if (metrics.system.memoryUsageMB > this.config.performanceThresholds.maxMemoryUsageMB * 0.8) {
      recommendations.push('Consider increasing memory allocation or optimizing memory usage');
    }

    if (metrics.errors.errorRate > this.config.performanceThresholds.maxErrorRate * 0.5) {
      recommendations.push('Review error logs and improve error handling');
    }

    if (metrics.processing.activeJobs > 10) {
      recommendations.push('Consider scaling processing capacity');
    }

    return recommendations;
  }

  public async cleanup(): Promise<void> {
    await this.stopMonitoring();
    this.metricsHistory = [];
    this.alertHistory = [];
    this.lastAlertTimes.clear();
  }
}

// Factory function
export function createMonitoringService(config: MonitoringConfig): MonitoringService {
  return MonitoringService.getInstance(config);
}

// Default configuration
export function createDefaultMonitoringConfig(): MonitoringConfig {
  return {
    enableRealTimeTracking: true,
    performanceThresholds: {
      maxProcessingTimeMs: 300000, // 5 minutes
      maxErrorRate: 10, // 10%
      maxMemoryUsageMB: 1024, // 1GB
      minSuccessRate: 90 // 90%
    },
    alerting: {
      enableWebhookAlerts: true,
      enableLogAlerts: true,
      alertCooldownMs: 300000 // 5 minutes
    },
    metricsRetentionDays: 7
  };
}