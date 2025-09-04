// src/types/monitoring.ts

/**
 * Types and interfaces for the monitoring and issue detection system
 */

export type IssueType = 
  | 'QUANTITY_PARSE_FALLBACK'
  | 'PROMOTION_UNKNOWN'
  | 'UNIT_MAPPING_FALLBACK'
  | 'PRICE_PARSE_FALLBACK'
  | 'CATEGORY_NORMALIZATION_FALLBACK'
  | 'VALIDATION_ERROR'
  | 'TRANSFORMATION_ERROR'
  | 'PERFORMANCE_WARNING';

export type IssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ShopType = 'AH' | 'JUMBO' | 'ALDI' | 'PLUS';

/**
 * Represents a detected issue during processing
 */
export interface IssueDetection {
  id: string;                    // Unique identifier for this issue type
  type: IssueType;
  severity: IssueSeverity;
  shopType: ShopType;
  productId: string;
  rawInput: string;              // The original input that caused the issue
  fallbackValue: any;            // What value was used as fallback
  context: Record<string, any>;  // Additional context about the issue
  suggestedFix?: string;         // Suggested improvement or fix
  frequency: number;             // How many times this exact issue occurred
  firstSeen: Date;
  lastSeen: Date;
  processingStep: string;        // Which step in processing detected this
}

/**
 * Aggregated issue statistics for reporting
 */
export interface IssueStatistics {
  totalIssues: number;
  issuesByType: Record<IssueType, number>;
  issuesBySeverity: Record<IssueSeverity, number>;
  issuesByShop: Record<ShopType, number>;
  topIssues: IssueDetection[];   // Most frequent issues
  newIssues: IssueDetection[];   // Issues seen for the first time
  trendingIssues: IssueDetection[]; // Issues with increasing frequency
}

/**
 * Processing metrics for real-time monitoring
 */
export interface ProcessingMetrics {
  shopType: ShopType;
  startTime: Date;
  currentTime: Date;
  totalProducts: number;
  processedProducts: number;
  successfulProducts: number;
  failedProducts: number;
  skippedProducts: number;
  currentBatch: number;
  totalBatches: number;
  processingSpeed: number;       // products per second
  memoryUsage: number;           // MB
  errorCount: number;
  warningCount: number;
  issueCount: number;
  estimatedTimeRemaining: number; // seconds
}

/**
 * Overall processing status across all shops
 */
export interface OverallProcessingStatus {
  isRunning: boolean;
  startTime: Date;
  shops: Record<ShopType, ProcessingMetrics>;
  totalMetrics: {
    totalProducts: number;
    processedProducts: number;
    successfulProducts: number;
    failedProducts: number;
    skippedProducts: number;
    overallProgress: number;      // percentage
    averageSpeed: number;         // products per second
    totalMemoryUsage: number;     // MB
    totalIssues: number;
  };
}

/**
 * Configuration for issue detection
 */
export interface IssueDetectionConfig {
  enabled: boolean;
  trackingEnabled: Record<IssueType, boolean>;
  severityThresholds: {
    frequencyForMedium: number;   // Issue becomes MEDIUM severity after this many occurrences
    frequencyForHigh: number;     // Issue becomes HIGH severity after this many occurrences
    frequencyForCritical: number; // Issue becomes CRITICAL severity after this many occurrences
  };
  reportingConfig: {
    generateJsonReport: boolean;
    generateMarkdownReport: boolean;
    generateTrendReport: boolean;
    maxIssuesInReport: number;
    includeRawData: boolean;
  };
}

/**
 * Issue detection context for different processing steps
 */
export interface IssueContext {
  processingStep: string;
  shopType: ShopType;
  productId: string;
  batchIndex?: number;
  additionalData?: Record<string, any>;
}

/**
 * Performance warning thresholds
 */
export interface PerformanceThresholds {
  maxProcessingTimePerProduct: number;  // milliseconds
  maxMemoryUsagePerBatch: number;       // MB
  minProcessingSpeed: number;           // products per second
  maxErrorRate: number;                 // percentage
}

/**
 * Issue trend data for historical analysis
 */
export interface IssueTrend {
  issueId: string;
  type: IssueType;
  shopType: ShopType;
  dailyOccurrences: Array<{
    date: string;
    count: number;
  }>;
  weeklyTrend: 'INCREASING' | 'DECREASING' | 'STABLE';
  severity: IssueSeverity;
  priority: number; // Calculated priority for fixing
}

/**
 * Report generation options
 */
export interface ReportOptions {
  includeRawData: boolean;
  maxExamples: number;
  groupBySeverity: boolean;
  groupByShop: boolean;
  includeTrends: boolean;
  includeFixSuggestions: boolean;
  outputFormat: 'JSON' | 'MARKDOWN' | 'BOTH';
}

/**
 * CLI Dashboard configuration
 */
export interface DashboardConfig {
  refreshInterval: number;      // milliseconds
  showMemoryUsage: boolean;
  showProcessingSpeed: boolean;
  showIssueCount: boolean;
  showProgressBars: boolean;
  compactMode: boolean;
  colorOutput: boolean;
}
