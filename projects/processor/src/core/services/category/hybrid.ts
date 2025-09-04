// src/core/services/category/hybrid.ts
import { getLogger } from '../../../infrastructure/logging';
import { CategoryNormalizer } from './normalizer';
import { MLPredictionService } from './prediction';

/**
 * HybridCategoryService combines rule-based category normalization with
 * ML-based prediction to provide robust category classification.
 */
export class HybridCategoryService {
  private static instance: HybridCategoryService | null = null;
  private readonly categoryNormalizer: CategoryNormalizer;
  private readonly mlService: MLPredictionService;

  // Lazy-loaded logger to avoid initialization issues
  private get logger() {
    return getLogger();
  }

  private constructor() {
    this.categoryNormalizer = CategoryNormalizer.getInstance();
    this.mlService = MLPredictionService.getInstance();
    this.logger.info('Hybrid Category Service initialized');
  }

  public static getInstance(): HybridCategoryService {
    if (!HybridCategoryService.instance) {
      HybridCategoryService.instance = new HybridCategoryService();
    }
    return HybridCategoryService.instance;
  }

  /**
   * Checks if ML predictions are loaded in the underlying services
   */
  public hasPredictions(): boolean {
    return this.mlService.isLoaded();
  }

  /**
   * Gets the count of available ML predictions
   */
  public getPredictionsCount(): number {
    return this.mlService.getPredictionsCount();
  }

  /**
   * Gets the set of product titles that have existing predictions
   */
  public getExistingPredictionTitles(): Set<string> {
    return this.mlService.getAvailableTitles();
  }

  /**
   * Normalizes a category using a hybrid approach:
   * 1. First tries rule-based normalization
   * 2. Falls back to ML prediction if available and needed
   * 3. Uses fuzzy matching as final fallback
   *
   * @param title Product title (used for ML predictions if needed)
   * @param currentCategory Current category from the product data
   * @param shopType Shop type identifier ('AH', 'JUMBO', 'ALDI', 'PLUS')
   * @returns Normalized category from the final category list
   */
  public normalizeCategory(title: string, currentCategory: string, shopType: string): string {
    try {
      // Use the CategoryNormalizer which already implements the hybrid approach
      return this.categoryNormalizer.normalizeCategory(title, currentCategory, shopType);
    } catch (error) {
      this.logger.error('Error in hybrid category normalization', {
        context: {
          title: title?.substring(0, 50),
          currentCategory,
          shopType,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });

      // Safe fallback to the first category
      return this.getFinalCategories()[0];
    }
  }

  /**
   * Gets a direct ML prediction for a product title if available
   *
   * @param title Product title
   * @param confidenceThreshold Minimum confidence threshold (default: 0.65)
   * @returns The normalized category if prediction is available, null otherwise
   */
  public getMlPrediction(title: string, confidenceThreshold: number = 0.65): string | null {
    if (!title) return null;

    const prediction = this.mlService.getPrediction(title, confidenceThreshold);
    if (prediction) {
      // Map the raw ML prediction to a final category using the normalizer
      return this.categoryNormalizer.normalizeCategory(title, prediction.category, 'ML');
    }

    return null;
  }

  /**
   * Gets the list of final categories
   */
  public getFinalCategories(): string[] {
    return this.categoryNormalizer.getFinalCategories();
  }

  /**
   * Checks if a product belongs to seasonal category
   */
  public isSeasonalProduct(title: string, currentCategory: string): boolean {
    const normalizedCategory = this.normalizeCategory(title, currentCategory, 'UNKNOWN');
    return normalizedCategory === 'Seizoensartikelen';
  }

  /**
   * Generates a report of category mapping statistics
   */
  public generateCategoryReport(): string {
    const stats = {
      totalCategories: this.getFinalCategories().length,
      mlPredictions: this.getPredictionsCount(),
      mappingReport: this.categoryNormalizer.generateCategoryMappingReport()
    };

    return `
Category Service Report
======================
Total final categories: ${stats.totalCategories}
ML predictions available: ${stats.mlPredictions}

${stats.mappingReport}
`;
  }
}

/**
 * Get the singleton instance of the HybridCategoryService
 */
export const getHybridCategoryService = (): HybridCategoryService => {
  return HybridCategoryService.getInstance();
};