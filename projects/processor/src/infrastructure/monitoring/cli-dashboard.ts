// src/infrastructure/monitoring/cli-dashboard.ts

import {
  ProcessingMetrics,
  OverallProcessingStatus,
  ShopType,
  DashboardConfig
} from '../../types/monitoring';
import { getProgressTracker } from './progress-tracker';
import { getIssueTracker } from '../logging/issue-tracker';
import chalk from 'chalk';
import cliProgress from 'cli-progress';

/**
 * Real-time CLI dashboard for monitoring processing progress
 */
export class CLIDashboard {
  private config: DashboardConfig;
  private progressTracker = getProgressTracker();
  private issueTracker = getIssueTracker();
  private progressBars: Map<ShopType, cliProgress.SingleBar> = new Map();
  private multiBar: cliProgress.MultiBar | null = null;
  private refreshInterval: NodeJS.Timeout | null = null;
  private isActive = false;

  constructor(config?: Partial<DashboardConfig>) {
    this.config = {
      refreshInterval: 1000,
      showMemoryUsage: true,
      showProcessingSpeed: true,
      showIssueCount: true,
      showProgressBars: true,
      compactMode: false,
      colorOutput: true,
      ...config
    };
  }

  /**
   * Start the dashboard
   */
  public start(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.setupProgressBars();
    this.setupEventListeners();
    this.startRefreshLoop();

    // Clear screen and show initial state
    if (!this.config.compactMode) {
      console.clear();
    }
    this.displayHeader();
  }

  /**
   * Stop the dashboard
   */
  public stop(): void {
    if (!this.isActive) return;

    this.isActive = false;

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    if (this.multiBar) {
      this.multiBar.stop();
      this.multiBar = null;
    }

    this.progressBars.clear();
  }

  /**
   * Update display with current status
   */
  public update(): void {
    if (!this.isActive) return;

    const status = this.progressTracker.getOverallStatus();

    if (!this.config.compactMode) {
      console.clear();
      this.displayHeader();
    }

    this.displayOverallStatus(status);
    this.displayShopStatus(status);
    this.displayIssuesSummary();

    if (this.config.showMemoryUsage || this.config.showProcessingSpeed) {
      this.displayPerformanceMetrics(status);
    }
  }

  /**
   * Display completion summary
   */
  public displayCompletionSummary(): void {
    const status = this.progressTracker.getOverallStatus();
    const statistics = this.issueTracker.getStatistics();

    // Clear any remaining progress bars
    if (this.multiBar) {
      this.multiBar.stop();
    }

    console.log('\n' + '='.repeat(60));
    console.log(chalk.green.bold('🎉 Processing Complete!') + '\n');

    console.log(chalk.cyan('📊 Final Results:'));
    console.log(`   Total Products: ${this.formatNumber(status.totalMetrics.totalProducts)}`);
    console.log(`   Successful: ${chalk.green(this.formatNumber(status.totalMetrics.successfulProducts))}`);
    console.log(`   Failed: ${chalk.red(this.formatNumber(status.totalMetrics.failedProducts))}`);
    console.log(`   Skipped: ${chalk.yellow(this.formatNumber(status.totalMetrics.skippedProducts))}`);

    const successRate = status.totalMetrics.totalProducts > 0
      ? (status.totalMetrics.successfulProducts / status.totalMetrics.totalProducts) * 100
      : 0;
    console.log(`   Success Rate: ${this.formatPercentage(successRate)}`);

    if (statistics.totalIssues > 0) {
      console.log(`\n${chalk.yellow('⚠️  Issues Detected:')} ${statistics.totalIssues}`);
      console.log(`   Critical: ${chalk.red(statistics.issuesBySeverity.CRITICAL || 0)}`);
      console.log(`   High: ${chalk.yellow(statistics.issuesBySeverity.HIGH || 0)}`);
      console.log(`   Medium: ${chalk.blue(statistics.issuesBySeverity.MEDIUM || 0)}`);
      console.log(`   Low: ${chalk.gray(statistics.issuesBySeverity.LOW || 0)}`);
    }

    const totalTime = Date.now() - status.startTime.getTime();
    console.log(`\n${chalk.cyan('⏱️  Total Time:')} ${this.formatDuration(totalTime)}`);
    console.log(`${chalk.cyan('🚀 Average Speed:')} ${this.formatNumber(status.totalMetrics.averageSpeed)} products/sec`);

    console.log('\n' + '='.repeat(60));
    console.log(chalk.gray('📁 Output files written to data_out/ directory'));
    console.log(chalk.gray('📊 Reports and logs available in processed_data/ and logs/ directories'));
    console.log('='.repeat(60) + '\n');
  }

  /**
   * Setup progress bars for each shop
   */
  private setupProgressBars(): void {
    if (!this.config.showProgressBars) return;

    this.multiBar = new cliProgress.MultiBar({
      clearOnComplete: false,
      hideCursor: true,
      format: this.config.colorOutput
        ? '{shop} |{bar}| {percentage}% | {value}/{total} | Speed: {speed} p/s | ETA: {eta}s'
        : '{shop} |{bar}| {percentage}% | {value}/{total} | Speed: {speed} p/s | ETA: {eta}s',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
    }, cliProgress.Presets.shades_classic);
  }

  /**
   * Setup event listeners for real-time updates
   */
  private setupEventListeners(): void {
    this.progressTracker.on('shopInitialized', (shopType: ShopType, metrics: ProcessingMetrics) => {
      if (this.config.showProgressBars && this.multiBar) {
        const progressBar = this.multiBar.create(metrics.totalProducts, 0, {
          shop: shopType.padEnd(6),
          speed: '0.0',
          eta: '∞'
        });
        this.progressBars.set(shopType, progressBar);
      }
    });

    this.progressTracker.on('progressUpdated', (shopType: ShopType, metrics: ProcessingMetrics) => {
      if (this.config.showProgressBars) {
        const progressBar = this.progressBars.get(shopType);
        if (progressBar) {
          progressBar.update(metrics.processedProducts, {
            shop: shopType.padEnd(6),
            speed: metrics.processingSpeed.toFixed(1),
            eta: metrics.estimatedTimeRemaining > 0 ? Math.round(metrics.estimatedTimeRemaining) : '∞'
          });
        }
      }
    });

    this.progressTracker.on('shopCompleted', (shopType: ShopType) => {
      const progressBar = this.progressBars.get(shopType);
      if (progressBar) {
        progressBar.update(progressBar.getTotal());
      }
    });
  }

  /**
   * Start the refresh loop
   */
  private startRefreshLoop(): void {
    this.refreshInterval = setInterval(() => {
      if (!this.config.showProgressBars) {
        this.update();
      }
    }, this.config.refreshInterval);
  }

  /**
   * Display header
   */
  private displayHeader(): void {
    const title = this.config.colorOutput
      ? chalk.cyan.bold('🏪 Supermarket Product Processor - Real-time Monitor')
      : '🏪 Supermarket Product Processor - Real-time Monitor';

    console.log(title);
    console.log(this.config.colorOutput ? chalk.gray('─'.repeat(60)) : '─'.repeat(60));
  }

  /**
   * Display overall status
   */
  private displayOverallStatus(status: OverallProcessingStatus): void {
    if (this.config.compactMode) return;

    const statusIcon = status.isRunning ? '🔄' : '✅';
    const statusText = status.isRunning ? 'Running' : 'Completed';
    const statusColor = status.isRunning ? chalk.blue : chalk.green;

    console.log(`\n${statusIcon} Status: ${statusColor(statusText)}`);
    console.log(`📈 Overall Progress: ${this.formatPercentage(status.totalMetrics.overallProgress)}`);

    if (status.isRunning) {
      const elapsed = Date.now() - status.startTime.getTime();
      console.log(`⏱️  Elapsed Time: ${this.formatDuration(elapsed)}`);
    }
  }

  /**
   * Display shop-specific status
   */
  private displayShopStatus(status: OverallProcessingStatus): void {
    if (this.config.compactMode || this.config.showProgressBars) return;

    console.log('\n📊 Shop Progress:');
    Object.entries(status.shops).forEach(([shop, metrics]) => {
      const progress = this.progressTracker.getShopProgress(shop as ShopType);
      const progressBar = this.createTextProgressBar(progress, 20);

      console.log(`   ${shop.padEnd(6)}: ${progressBar} ${this.formatPercentage(progress)} (${metrics.processedProducts}/${metrics.totalProducts})`);
    });
  }

  /**
   * Display issues summary
   */
  private displayIssuesSummary(): void {
    if (!this.config.showIssueCount) return;

    const statistics = this.issueTracker.getStatistics();
    if (statistics.totalIssues === 0) return;

    console.log(`\n⚠️  Issues: ${statistics.totalIssues} total`);

    if (!this.config.compactMode) {
      const criticalCount = statistics.issuesBySeverity.CRITICAL || 0;
      const highCount = statistics.issuesBySeverity.HIGH || 0;
      const mediumCount = statistics.issuesBySeverity.MEDIUM || 0;
      const lowCount = statistics.issuesBySeverity.LOW || 0;

      if (criticalCount > 0) console.log(`   ${chalk.red('Critical')}: ${criticalCount}`);
      if (highCount > 0) console.log(`   ${chalk.yellow('High')}: ${highCount}`);
      if (mediumCount > 0) console.log(`   ${chalk.blue('Medium')}: ${mediumCount}`);
      if (lowCount > 0) console.log(`   ${chalk.gray('Low')}: ${lowCount}`);
    }
  }

  /**
   * Display performance metrics
   */
  private displayPerformanceMetrics(status: OverallProcessingStatus): void {
    if (this.config.compactMode) return;

    console.log('\n🚀 Performance:');

    if (this.config.showProcessingSpeed) {
      console.log(`   Speed: ${this.formatNumber(status.totalMetrics.averageSpeed)} products/sec`);
    }

    if (this.config.showMemoryUsage) {
      console.log(`   Memory: ${this.formatNumber(status.totalMetrics.totalMemoryUsage)} MB`);
    }
  }

  /**
   * Create a text-based progress bar
   */
  private createTextProgressBar(percentage: number, width: number = 20): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;

    const filledChar = this.config.colorOutput ? chalk.green('█') : '█';
    const emptyChar = this.config.colorOutput ? chalk.gray('░') : '░';

    return `[${filledChar.repeat(filled)}${emptyChar.repeat(empty)}]`;
  }

  /**
   * Format number with thousands separators
   */
  private formatNumber(num: number): string {
    return num.toLocaleString();
  }

  /**
   * Format percentage
   */
  private formatPercentage(percentage: number): string {
    const formatted = `${percentage.toFixed(1)}%`;
    if (!this.config.colorOutput) return formatted;

    if (percentage >= 100) return chalk.green(formatted);
    if (percentage >= 75) return chalk.blue(formatted);
    if (percentage >= 50) return chalk.yellow(formatted);
    return chalk.red(formatted);
  }

  /**
   * Format duration in milliseconds to human readable
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

// Singleton instance
let dashboardInstance: CLIDashboard | null = null;

/**
 * Initialize the CLI dashboard
 */
export function initializeCLIDashboard(config?: Partial<DashboardConfig>): CLIDashboard {
  dashboardInstance = new CLIDashboard(config);
  return dashboardInstance;
}

/**
 * Get the CLI dashboard instance
 */
export function getCLIDashboard(): CLIDashboard {
  if (!dashboardInstance) {
    dashboardInstance = new CLIDashboard();
  }
  return dashboardInstance;
}
