// src/infrastructure/logging/issue-tracker.ts

import {
  IssueDetection,
  IssueType,
  IssueSeverity,
  ShopType,
  IssueContext,
  IssueDetectionConfig,
  IssueStatistics
} from '../../types/monitoring';
import { getLogger } from './logger';
import { serializeError } from '../../utils/error';
import crypto from 'crypto';

/**
 * Centralized issue tracking service for detecting and aggregating processing issues
 */
export class IssueTracker {
  private issues: Map<string, IssueDetection> = new Map();
  private config: IssueDetectionConfig;

  // Lazy-loaded logger to avoid initialization issues
  private get logger() {
    return getLogger();
  }

  constructor(config: IssueDetectionConfig) {
    this.config = config;
  }

  /**
   * Track a new issue or update an existing one
   */
  public trackIssue(
    type: IssueType,
    context: IssueContext,
    rawInput: string,
    fallbackValue: any,
    suggestedFix?: string
  ): void {
    if (!this.config.enabled || !this.config.trackingEnabled[type]) {
      return;
    }

    const issueId = this.generateIssueId(type, context.shopType, rawInput);
    const now = new Date();

    const existingIssue = this.issues.get(issueId);

    if (existingIssue) {
      // Update existing issue
      existingIssue.frequency++;
      existingIssue.lastSeen = now;
      existingIssue.severity = this.calculateSeverity(existingIssue.frequency);

      // Update context with latest information
      existingIssue.context = { ...existingIssue.context, ...context.additionalData };
    } else {
      // Create new issue
      const newIssue: IssueDetection = {
        id: issueId,
        type,
        severity: this.calculateSeverity(1),
        shopType: context.shopType,
        productId: context.productId,
        rawInput,
        fallbackValue,
        context: {
          processingStep: context.processingStep,
          batchIndex: context.batchIndex,
          ...context.additionalData
        },
        suggestedFix,
        frequency: 1,
        firstSeen: now,
        lastSeen: now,
        processingStep: context.processingStep
      };

      this.issues.set(issueId, newIssue);
    }

    // Log the issue based on severity
    this.logIssue(this.issues.get(issueId)!);
  }

  /**
   * Track a quantity parsing fallback
   */
  public trackQuantityParseFallback(
    context: IssueContext,
    originalInput: string,
    fallbackAmount: number,
    fallbackUnit: string
  ): void {
    this.trackIssue(
      'QUANTITY_PARSE_FALLBACK',
      context,
      originalInput,
      { amount: fallbackAmount, unit: fallbackUnit },
      `Add parsing pattern for format: "${originalInput}"`
    );
  }

  /**
   * Track an unknown promotion mechanism
   */
  public trackUnknownPromotion(
    context: IssueContext,
    promotionMechanism: string,
    originalPrice: number
  ): void {
    this.trackIssue(
      'PROMOTION_UNKNOWN',
      context,
      promotionMechanism,
      { type: 'UNKNOWN', effectiveUnitPrice: originalPrice },
      `Add promotion pattern for: "${promotionMechanism}"`
    );
  }

  /**
   * Track a unit mapping fallback
   */
  public trackUnitMappingFallback(
    context: IssueContext,
    originalUnit: string,
    fallbackUnit: string = 'stuk'
  ): void {
    this.trackIssue(
      'UNIT_MAPPING_FALLBACK',
      context,
      originalUnit,
      fallbackUnit,
      `Add unit mapping: "${originalUnit}" -> appropriate standard unit`
    );
  }

  /**
   * Track a price parsing fallback
   */
  public trackPriceParseFallback(
    context: IssueContext,
    originalPriceString: string,
    fallbackPrice: number
  ): void {
    this.trackIssue(
      'PRICE_PARSE_FALLBACK',
      context,
      originalPriceString,
      fallbackPrice,
      `Improve price parsing for format: "${originalPriceString}"`
    );
  }

  /**
   * Track a performance warning
   */
  public trackPerformanceWarning(
    context: IssueContext,
    metric: string,
    value: number,
    threshold: number
  ): void {
    this.trackIssue(
      'PERFORMANCE_WARNING',
      context,
      `${metric}: ${value}`,
      { metric, value, threshold },
      `Optimize ${metric} - current: ${value}, threshold: ${threshold}`
    );
  }

  /**
   * Get all tracked issues
   */
  public getIssues(): IssueDetection[] {
    return Array.from(this.issues.values());
  }

  /**
   * Get issues filtered by criteria
   */
  public getIssuesBy(criteria: {
    type?: IssueType;
    shopType?: ShopType;
    severity?: IssueSeverity;
    minFrequency?: number;
  }): IssueDetection[] {
    return this.getIssues().filter(issue => {
      if (criteria.type && issue.type !== criteria.type) return false;
      if (criteria.shopType && issue.shopType !== criteria.shopType) return false;
      if (criteria.severity && issue.severity !== criteria.severity) return false;
      if (criteria.minFrequency && issue.frequency < criteria.minFrequency) return false;
      return true;
    });
  }

  /**
   * Get issue statistics
   */
  public getStatistics(): IssueStatistics {
    const issues = this.getIssues();

    const issuesByType = issues.reduce((acc, issue) => {
      acc[issue.type] = (acc[issue.type] || 0) + issue.frequency;
      return acc;
    }, {} as Record<IssueType, number>);

    const issuesBySeverity = issues.reduce((acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] || 0) + issue.frequency;
      return acc;
    }, {} as Record<IssueSeverity, number>);

    const issuesByShop = issues.reduce((acc, issue) => {
      acc[issue.shopType] = (acc[issue.shopType] || 0) + issue.frequency;
      return acc;
    }, {} as Record<ShopType, number>);

    // Get top issues by frequency
    const topIssues = issues
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    // Get new issues (first seen in last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const newIssues = issues.filter(issue => issue.firstSeen > oneHourAgo);

    // Get trending issues (simplified - could be enhanced with historical data)
    const trendingIssues = issues
      .filter(issue => issue.frequency > 5)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);

    return {
      totalIssues: issues.reduce((sum, issue) => sum + issue.frequency, 0),
      issuesByType,
      issuesBySeverity,
      issuesByShop,
      topIssues,
      newIssues,
      trendingIssues
    };
  }

  /**
   * Clear all tracked issues
   */
  public clearIssues(): void {
    this.issues.clear();
  }

  /**
   * Generate a unique ID for an issue based on type, shop, and input
   */
  private generateIssueId(type: IssueType, shopType: ShopType, rawInput: string): string {
    const data = `${type}-${shopType}-${rawInput}`;
    return crypto.createHash('md5').update(data).digest('hex').substring(0, 12);
  }

  /**
   * Calculate severity based on frequency
   */
  private calculateSeverity(frequency: number): IssueSeverity {
    const thresholds = this.config.severityThresholds;

    if (frequency >= thresholds.frequencyForCritical) return 'CRITICAL';
    if (frequency >= thresholds.frequencyForHigh) return 'HIGH';
    if (frequency >= thresholds.frequencyForMedium) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Log the issue based on its severity
   */
  private logIssue(issue: IssueDetection): void {
    const message = `Issue detected: ${issue.type} in ${issue.shopType}`;
    const context = {
      issueId: issue.id,
      type: issue.type,
      severity: issue.severity,
      shopType: issue.shopType,
      frequency: issue.frequency,
      rawInput: issue.rawInput,
      fallbackValue: issue.fallbackValue,
      processingStep: issue.processingStep
    };

    switch (issue.severity) {
      case 'CRITICAL':
        this.logger.error(message, { context });
        break;
      case 'HIGH':
        this.logger.warn(message, { context });
        break;
      case 'MEDIUM':
        this.logger.warn(message, { context });
        break;
      case 'LOW':
        this.logger.debug(message, { context });
        break;
    }
  }
}

// Singleton instance
let issueTrackerInstance: IssueTracker | null = null;

/**
 * Initialize the issue tracker
 */
export function initializeIssueTracker(config: IssueDetectionConfig): IssueTracker {
  issueTrackerInstance = new IssueTracker(config);
  return issueTrackerInstance;
}

/**
 * Get the issue tracker instance
 */
export function getIssueTracker(): IssueTracker {
  if (!issueTrackerInstance) {
    // Create a default issue tracker if not initialized
    const defaultConfig: IssueDetectionConfig = {
      enabled: true,
      trackingEnabled: {
        'QUANTITY_PARSE_FALLBACK': true,
        'PROMOTION_UNKNOWN': true,
        'UNIT_MAPPING_FALLBACK': true,
        'PRICE_PARSE_FALLBACK': true,
        'CATEGORY_NORMALIZATION_FALLBACK': true,
        'VALIDATION_ERROR': true,
        'TRANSFORMATION_ERROR': true,
        'PERFORMANCE_WARNING': true
      },
      severityThresholds: {
        frequencyForMedium: 5,
        frequencyForHigh: 20,
        frequencyForCritical: 50
      },
      reportingConfig: {
        generateJsonReport: true,
        generateMarkdownReport: true,
        generateTrendReport: true,
        maxIssuesInReport: 100,
        includeRawData: true
      }
    };

    issueTrackerInstance = new IssueTracker(defaultConfig);
  }
  return issueTrackerInstance;
}
