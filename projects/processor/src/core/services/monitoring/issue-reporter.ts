// src/core/services/monitoring/issue-reporter.ts

import {
  IssueDetection,
  IssueStatistics,
  ReportOptions,
  IssueType,
  IssueSeverity,
  ShopType
} from '../../../types/monitoring';
import { getIssueTracker } from '../../../infrastructure/logging/issue-tracker';
import { getLogger } from '../../../infrastructure/logging/logger';
import fs from 'fs-extra';
import path from 'path';

/**
 * Service for generating issue reports in various formats
 */
export class IssueReporter {
  private issueTracker = getIssueTracker();

  // Lazy-loaded logger to avoid initialization issues
  private get logger() {
    return getLogger();
  }

  /**
   * Generate comprehensive issue reports
   */
  public async generateReports(
    outputDir: string,
    options: ReportOptions = this.getDefaultReportOptions()
  ): Promise<void> {
    try {
      await fs.ensureDir(outputDir);

      const issues = this.issueTracker.getIssues();
      const statistics = this.issueTracker.getStatistics();

      if (options.outputFormat === 'JSON' || options.outputFormat === 'BOTH') {
        await this.generateJsonReport(outputDir, issues, statistics, options);
      }

      if (options.outputFormat === 'MARKDOWN' || options.outputFormat === 'BOTH') {
        await this.generateMarkdownReport(outputDir, issues, statistics, options);
      }

      this.logger.info('Issue reports generated successfully', {
        context: {
          outputDir,
          totalIssues: issues.length,
          totalOccurrences: statistics.totalIssues,
          format: options.outputFormat
        }
      });
    } catch (error) {
      this.logger.error('Failed to generate issue reports', {
        context: { error, outputDir }
      });
      throw error;
    }
  }

  /**
   * Generate JSON report
   */
  private async generateJsonReport(
    outputDir: string,
    issues: IssueDetection[],
    statistics: IssueStatistics,
    options: ReportOptions
  ): Promise<void> {
    const reportData = {
      metadata: {
        generatedAt: new Date().toISOString(),
        totalIssues: issues.length,
        totalOccurrences: statistics.totalIssues,
        reportOptions: options
      },
      statistics,
      issues: this.prepareIssuesForReport(issues, options),
      recommendations: this.generateRecommendations(issues, statistics)
    };

    const filePath = path.join(outputDir, 'processing-issues-report.json');
    await fs.writeFile(filePath, JSON.stringify(reportData, null, 2));
  }

  /**
   * Generate Markdown report
   */
  private async generateMarkdownReport(
    outputDir: string,
    issues: IssueDetection[],
    statistics: IssueStatistics,
    options: ReportOptions
  ): Promise<void> {
    const markdown = this.buildMarkdownReport(issues, statistics, options);
    const filePath = path.join(outputDir, 'edge-cases-detected.md');
    await fs.writeFile(filePath, markdown);
  }

  /**
   * Build the markdown report content
   */
  private buildMarkdownReport(
    issues: IssueDetection[],
    statistics: IssueStatistics,
    options: ReportOptions
  ): string {
    const now = new Date().toISOString();

    let markdown = `# Processing Issues Report

**Generated:** ${now}
**Total Issues:** ${issues.length} unique issues
**Total Occurrences:** ${statistics.totalIssues}

## Executive Summary

This report identifies data patterns that triggered fallback behaviors or error handling during product processing. Each issue represents an opportunity to improve data parsing and transformation accuracy.

`;

    // Statistics section
    markdown += this.buildStatisticsSection(statistics);

    // Issues by severity
    if (options.groupBySeverity) {
      markdown += this.buildIssuesBySeveritySection(issues, options);
    }

    // Issues by shop
    if (options.groupByShop) {
      markdown += this.buildIssuesByShopSection(issues, options);
    }

    // Top issues
    markdown += this.buildTopIssuesSection(statistics.topIssues, options);

    // Recommendations
    markdown += this.buildRecommendationsSection(issues, statistics);

    return markdown;
  }

  /**
   * Build statistics section
   */
  private buildStatisticsSection(statistics: IssueStatistics): string {
    let section = `## Statistics Overview

### Issues by Type
| Issue Type | Occurrences | Percentage |
|------------|-------------|------------|
`;

    Object.entries(statistics.issuesByType).forEach(([type, count]) => {
      const percentage = ((count / statistics.totalIssues) * 100).toFixed(1);
      section += `| ${type.replace(/_/g, ' ')} | ${count} | ${percentage}% |\n`;
    });

    section += `\n### Issues by Severity
| Severity | Occurrences | Percentage |
|----------|-------------|------------|
`;

    Object.entries(statistics.issuesBySeverity).forEach(([severity, count]) => {
      const percentage = ((count / statistics.totalIssues) * 100).toFixed(1);
      section += `| ${severity} | ${count} | ${percentage}% |\n`;
    });

    section += `\n### Issues by Shop
| Shop | Occurrences | Percentage |
|------|-------------|------------|
`;

    Object.entries(statistics.issuesByShop).forEach(([shop, count]) => {
      const percentage = ((count / statistics.totalIssues) * 100).toFixed(1);
      section += `| ${shop} | ${count} | ${percentage}% |\n`;
    });

    return section + '\n';
  }

  /**
   * Build issues by severity section
   */
  private buildIssuesBySeveritySection(issues: IssueDetection[], options: ReportOptions): string {
    let section = `## Issues by Severity\n\n`;

    const severityOrder: IssueSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

    severityOrder.forEach(severity => {
      const severityIssues = issues.filter(issue => issue.severity === severity);
      if (severityIssues.length === 0) return;

      section += `### ${severity} Severity (${severityIssues.length} issues)\n\n`;

      severityIssues
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, options.maxExamples)
        .forEach(issue => {
          section += this.formatIssueForMarkdown(issue, options);
        });
    });

    return section;
  }

  /**
   * Build issues by shop section
   */
  private buildIssuesByShopSection(issues: IssueDetection[], options: ReportOptions): string {
    let section = `## Issues by Shop\n\n`;

    const shops: ShopType[] = ['AH', 'JUMBO', 'ALDI', 'PLUS'];

    shops.forEach(shop => {
      const shopIssues = issues.filter(issue => issue.shopType === shop);
      if (shopIssues.length === 0) return;

      section += `### ${shop} (${shopIssues.length} issues)\n\n`;

      shopIssues
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, options.maxExamples)
        .forEach(issue => {
          section += this.formatIssueForMarkdown(issue, options);
        });
    });

    return section;
  }

  /**
   * Build top issues section
   */
  private buildTopIssuesSection(topIssues: IssueDetection[], options: ReportOptions): string {
    let section = `## Top Issues by Frequency\n\n`;

    topIssues.slice(0, options.maxExamples).forEach((issue, index) => {
      section += `### ${index + 1}. ${issue.type.replace(/_/g, ' ')} (${issue.frequency} occurrences)\n\n`;
      section += this.formatIssueForMarkdown(issue, options);
    });

    return section;
  }

  /**
   * Build recommendations section
   */
  private buildRecommendationsSection(issues: IssueDetection[], statistics: IssueStatistics): string {
    const recommendations = this.generateRecommendations(issues, statistics);

    let section = `## Recommendations\n\n`;

    recommendations.forEach((rec, index) => {
      section += `### ${index + 1}. ${rec.title}\n\n`;
      section += `**Priority:** ${rec.priority}  \n`;
      section += `**Impact:** ${rec.impact}  \n`;
      section += `**Effort:** ${rec.effort}  \n\n`;
      section += `${rec.description}\n\n`;

      if (rec.implementation) {
        section += `**Implementation:**\n${rec.implementation}\n\n`;
      }
    });

    return section;
  }

  /**
   * Format a single issue for markdown display
   */
  private formatIssueForMarkdown(issue: IssueDetection, options: ReportOptions): string {
    let formatted = `**Issue ID:** ${issue.id}  \n`;
    formatted += `**Type:** ${issue.type.replace(/_/g, ' ')}  \n`;
    formatted += `**Severity:** ${issue.severity}  \n`;
    formatted += `**Shop:** ${issue.shopType}  \n`;
    formatted += `**Frequency:** ${issue.frequency}  \n`;
    formatted += `**First Seen:** ${issue.firstSeen.toISOString()}  \n`;
    formatted += `**Last Seen:** ${issue.lastSeen.toISOString()}  \n`;

    if (options.includeRawData) {
      formatted += `**Raw Input:** \`${issue.rawInput}\`  \n`;
      formatted += `**Fallback Value:** \`${JSON.stringify(issue.fallbackValue)}\`  \n`;
    }

    if (issue.suggestedFix) {
      formatted += `**Suggested Fix:** ${issue.suggestedFix}  \n`;
    }

    formatted += '\n---\n\n';
    return formatted;
  }

  /**
   * Prepare issues for JSON report
   */
  private prepareIssuesForReport(issues: IssueDetection[], options: ReportOptions): IssueDetection[] {
    let reportIssues = [...issues];

    // Sort by frequency (descending)
    reportIssues.sort((a, b) => b.frequency - a.frequency);

    // Limit number of issues
    if (options.maxExamples > 0) {
      reportIssues = reportIssues.slice(0, options.maxExamples);
    }

    // Remove raw data if not requested
    if (!options.includeRawData) {
      reportIssues = reportIssues.map(issue => ({
        ...issue,
        rawInput: '[REDACTED]',
        context: { ...issue.context, rawData: '[REDACTED]' }
      }));
    }

    return reportIssues;
  }

  /**
   * Generate recommendations based on issues
   */
  private generateRecommendations(issues: IssueDetection[], statistics: IssueStatistics): Array<{
    title: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    impact: string;
    effort: string;
    description: string;
    implementation?: string;
  }> {
    const recommendations = [];

    // Check for high-frequency quantity parsing issues
    const quantityIssues = issues.filter(i => i.type === 'QUANTITY_PARSE_FALLBACK');
    if (quantityIssues.length > 0) {
      const totalQuantityOccurrences = quantityIssues.reduce((sum, i) => sum + i.frequency, 0);
      recommendations.push({
        title: 'Improve Quantity Parsing Patterns',
        priority: totalQuantityOccurrences > 50 ? 'HIGH' : 'MEDIUM' as 'HIGH' | 'MEDIUM',
        impact: `${totalQuantityOccurrences} products affected`,
        effort: 'Medium - Add regex patterns and unit mappings',
        description: `${quantityIssues.length} unique quantity formats are falling back to default values. This affects price per unit calculations and product comparisons.`,
        implementation: 'Add new patterns to quantity parsing functions and expand unit mappings in src/config/units.ts'
      });
    }

    // Check for unknown promotions
    const promotionIssues = issues.filter(i => i.type === 'PROMOTION_UNKNOWN');
    if (promotionIssues.length > 0) {
      const totalPromotionOccurrences = promotionIssues.reduce((sum, i) => sum + i.frequency, 0);
      recommendations.push({
        title: 'Expand Promotion Pattern Recognition',
        priority: totalPromotionOccurrences > 30 ? 'HIGH' : 'MEDIUM' as 'HIGH' | 'MEDIUM',
        impact: `${totalPromotionOccurrences} promotions not recognized`,
        effort: 'Medium - Add regex patterns and calculation logic',
        description: `${promotionIssues.length} unique promotion formats are not being parsed correctly, leading to inaccurate discount calculations.`,
        implementation: 'Add new promotion patterns to src/config/promotions.ts and update parsePromotionMechanism function'
      });
    }

    return recommendations;
  }

  /**
   * Get default report options
   */
  private getDefaultReportOptions(): ReportOptions {
    return {
      includeRawData: true,
      maxExamples: 50,
      groupBySeverity: true,
      groupByShop: true,
      includeTrends: false,
      includeFixSuggestions: true,
      outputFormat: 'BOTH'
    };
  }
}

// Singleton instance
let issueReporterInstance: IssueReporter | null = null;

/**
 * Get the issue reporter instance
 */
export function getIssueReporter(): IssueReporter {
  if (!issueReporterInstance) {
    issueReporterInstance = new IssueReporter();
  }
  return issueReporterInstance;
}
