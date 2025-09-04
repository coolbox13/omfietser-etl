// src/core/services/category/ml-fallback-tracker.ts
import fs from 'fs-extra';
import path from 'path';
import { getLogger } from '../../../infrastructure/logging';

export interface MLFallbackEntry {
  timestamp: string;
  shopType: string;
  originalCategory: string;
  productTitle: string;
  mlPrediction?: string;
  mlConfidence?: number;
  finalCategory: string;
  mappingMethod: 'ml' | 'fuzzy_fallback';
}

export interface MLFallbackSummary {
  totalFallbacks: number;
  fallbacksByShop: Record<string, number>;
  unmappedCategories: Array<{
    category: string;
    shopType: string;
    count: number;
    suggestedMapping?: string;
  }>;
  mlPredictionStats: {
    totalPredictions: number;
    successfulPredictions: number;
    averageConfidence: number;
  };
}

/**
 * Service for tracking ML fallback usage and generating mapping suggestions
 */
export class MLFallbackTracker {
  private static instance: MLFallbackTracker | null = null;
  private fallbackEntries: MLFallbackEntry[] = [];
  private categoryFrequency: Map<string, number> = new Map();
  private logFilePath: string;

  // Lazy-loaded logger to avoid initialization issues
  private get logger() {
    return getLogger();
  }

  private constructor() {
    this.logFilePath = path.join(process.cwd(), 'logs', 'ml-fallback-categories.log');
    this.ensureLogDirectory();
  }

  public static getInstance(): MLFallbackTracker {
    if (!MLFallbackTracker.instance) {
      MLFallbackTracker.instance = new MLFallbackTracker();
    }
    return MLFallbackTracker.instance;
  }

  private async ensureLogDirectory(): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(this.logFilePath));
    } catch (error) {
      this.logger.error('Failed to create ML fallback log directory', {
        context: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  }

  /**
   * Track an ML fallback occurrence
   */
  public async trackMLFallback(entry: Omit<MLFallbackEntry, 'timestamp'>): Promise<void> {
    const fullEntry: MLFallbackEntry = {
      ...entry,
      timestamp: new Date().toISOString()
    };

    // Add to in-memory tracking
    this.fallbackEntries.push(fullEntry);
    
    // Track category frequency
    const categoryKey = `${entry.shopType}:${entry.originalCategory}`;
    const currentCount = this.categoryFrequency.get(categoryKey) || 0;
    this.categoryFrequency.set(categoryKey, currentCount + 1);

    // Write to log file
    await this.writeToLogFile(fullEntry);
  }

  private async writeToLogFile(entry: MLFallbackEntry): Promise<void> {
    try {
      const logLine = JSON.stringify(entry) + '\n';
      await fs.appendFile(this.logFilePath, logLine);
    } catch (error) {
      this.logger.error('Failed to write ML fallback log entry', {
        context: { 
          error: error instanceof Error ? error.message : 'Unknown error',
          entry: entry.originalCategory
        }
      });
    }
  }

  /**
   * Generate a comprehensive summary report
   */
  public generateSummaryReport(): MLFallbackSummary {
    const fallbacksByShop: Record<string, number> = {};
    let totalPredictions = 0;
    let successfulPredictions = 0;
    let totalConfidence = 0;

    // Analyze fallback entries
    for (const entry of this.fallbackEntries) {
      fallbacksByShop[entry.shopType] = (fallbacksByShop[entry.shopType] || 0) + 1;
      
      if (entry.mappingMethod === 'ml' && entry.mlPrediction) {
        totalPredictions++;
        if (entry.mlConfidence !== undefined) {
          successfulPredictions++;
          totalConfidence += entry.mlConfidence;
        }
      }
    }

    // Generate unmapped categories with suggestions
    const unmappedCategories = Array.from(this.categoryFrequency.entries())
      .map(([key, count]) => {
        const [shopType, category] = key.split(':');
        return {
          category,
          shopType,
          count,
          suggestedMapping: this.generateMappingSuggestion(category)
        };
      })
      .sort((a, b) => b.count - a.count); // Sort by frequency

    return {
      totalFallbacks: this.fallbackEntries.length,
      fallbacksByShop,
      unmappedCategories,
      mlPredictionStats: {
        totalPredictions,
        successfulPredictions,
        averageConfidence: successfulPredictions > 0 ? totalConfidence / successfulPredictions : 0
      }
    };
  }

  private generateMappingSuggestion(category: string): string {
    // Simple heuristic-based mapping suggestions
    const normalized = category.toLowerCase();
    
    if (normalized.includes('groente') || normalized.includes('fruit') || normalized.includes('aardappel')) {
      return 'Aardappel, groente, fruit';
    }
    if (normalized.includes('vlees') || normalized.includes('vis')) {
      return 'Vlees, vis';
    }
    if (normalized.includes('zuivel') || normalized.includes('melk') || normalized.includes('eieren')) {
      return 'Zuivel, eieren, boter';
    }
    if (normalized.includes('drank') || normalized.includes('sap')) {
      return 'Frisdrank, sappen, siropen, water';
    }
    if (normalized.includes('snoep') || normalized.includes('chocolade') || normalized.includes('koek')) {
      return 'Snoep, chocolade, koek';
    }
    if (normalized.includes('bier') || normalized.includes('wijn')) {
      return 'Bier en aperitieven';
    }
    
    return 'Manual review needed';
  }

  /**
   * Generate a formatted report for console output
   */
  public generateFormattedReport(): string {
    const summary = this.generateSummaryReport();
    
    let report = '\n🔍 ML Fallback Analysis Report\n';
    report += '================================\n\n';
    
    report += `📊 Overall Statistics:\n`;
    report += `   Total ML Fallbacks: ${summary.totalFallbacks}\n`;
    report += `   ML Predictions Used: ${summary.mlPredictionStats.totalPredictions}\n`;
    report += `   Average ML Confidence: ${summary.mlPredictionStats.averageConfidence.toFixed(2)}\n\n`;
    
    report += `🏪 Fallbacks by Shop:\n`;
    for (const [shop, count] of Object.entries(summary.fallbacksByShop)) {
      report += `   ${shop}: ${count} fallbacks\n`;
    }
    
    report += `\n📋 Top Unmapped Categories (requiring manual mapping):\n`;
    summary.unmappedCategories.slice(0, 10).forEach((item, index) => {
      report += `   ${index + 1}. "${item.category}" (${item.shopType}) - ${item.count} occurrences\n`;
      report += `      Suggested: ${item.suggestedMapping}\n`;
    });
    
    if (summary.unmappedCategories.length === 0) {
      report += `   ✅ No unmapped categories found!\n`;
    }
    
    report += `\n💡 Suggested Actions:\n`;
    if (summary.totalFallbacks === 0) {
      report += `   ✅ Perfect! No ML fallbacks occurred.\n`;
    } else {
      report += `   📝 Add mappings for top unmapped categories to CategoryNormalizer\n`;
      report += `   🔧 Review ML predictions with low confidence scores\n`;
      report += `   📊 Monitor fallback trends over time\n`;
    }
    
    return report;
  }

  /**
   * Save the summary report to a file
   */
  public async saveSummaryReport(): Promise<string> {
    const summary = this.generateSummaryReport();
    const reportPath = path.join(process.cwd(), 'logs', `ml-fallback-summary-${new Date().toISOString().split('T')[0]}.json`);
    
    try {
      await fs.writeJson(reportPath, summary, { spaces: 2 });
      this.logger.info('ML fallback summary report saved', { context: { reportPath } });
      return reportPath;
    } catch (error) {
      this.logger.error('Failed to save ML fallback summary report', {
        context: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
      throw error;
    }
  }

  /**
   * Clear all tracked data (useful for testing)
   */
  public clear(): void {
    this.fallbackEntries = [];
    this.categoryFrequency.clear();
  }

  /**
   * Get the current fallback entries count
   */
  public getFallbackCount(): number {
    return this.fallbackEntries.length;
  }

  /**
   * Clean up resources and reset the singleton instance
   */
  public static cleanup(): void {
    if (MLFallbackTracker.instance) {
      MLFallbackTracker.instance.clear();
      MLFallbackTracker.instance = null;
    }
  }
}

/**
 * Get the singleton instance of the MLFallbackTracker
 */
export const getMlFallbackTracker = (): MLFallbackTracker => {
  return MLFallbackTracker.getInstance();
};
