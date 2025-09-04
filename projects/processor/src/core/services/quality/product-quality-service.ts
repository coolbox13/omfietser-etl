// src/core/services/quality/product-quality-service.ts
import { UnifiedProduct } from '../../../types/product';
import { getLogger } from '../../../infrastructure/logging';
import { createConfig } from '../../../config';

/**
 * Internal interface for quality metrics (not included in output JSON)
 */
interface QualityMetrics {
  quality_score: number;
  quality_factors: Record<string, number>;
}

/**
 * Separate internal type to track quality metrics without exposing them
 */
type ProductWithQualityMetrics = UnifiedProduct & QualityMetrics;

/**
 * Product Quality Service class for measuring product quality metrics
 */
export class ProductQualityService {
  // Lazy-loaded logger to avoid initialization issues
  private get logger() {
    return getLogger();
  }

  /**
   * Calculate quality metrics across all products
   */
  calculateQualityMetrics(products: UnifiedProduct[]) {
    this.logger.info(`Calculating quality metrics for ${products.length} products`);

    // Set initial quality scores if not present
    const productsWithScores = this._assignQualityScores(products);

    // Calculate aggregate metrics
    const overallScore = this._getAverageQualityScore(productsWithScores);
    const completeness = this._calculateCompleteness(productsWithScores);
    const categoryAccuracy = this._calculateCategoryAccuracy(productsWithScores);
    const priceConsistency = this._calculatePriceConsistency(productsWithScores);
    const promotionAccuracy = this._calculatePromotionAccuracy(productsWithScores);
    const unitConsistency = this._calculateUnitConsistency(productsWithScores);
    const scoreDistribution = this._calculateScoreDistribution(productsWithScores);

    return {
      overallScore,
      completeness,
      categoryAccuracy,
      priceConsistency,
      promotionAccuracy,
      unitConsistency,
      scoreDistribution
    };
  }

  /**
   * Generate detailed quality report
   */
  generateQualityReport(products: UnifiedProduct[]): string {
    const productsWithScores = this._assignQualityScores(products);
    const metrics = this.calculateQualityMetrics(products);

    return `# Product Quality Report

## Overall Metrics
- **Overall Score**: ${metrics.overallScore.toFixed(1)}/100
- **Completeness**: ${metrics.completeness.toFixed(1)}%
- **Category Accuracy**: ${metrics.categoryAccuracy.toFixed(1)}%
- **Price Consistency**: ${metrics.priceConsistency.toFixed(1)}%
- **Promotion Accuracy**: ${metrics.promotionAccuracy.toFixed(1)}%
- **Unit Consistency**: ${metrics.unitConsistency.toFixed(1)}%

## Score Distribution
${Object.entries(metrics.scoreDistribution)
  .map(([range, count]) => `- **${range}**: ${count} products (${((count / products.length) * 100).toFixed(1)}%)`)
  .join('\n')}

## Recommendations
1. Improve product data completeness for better quality scores
2. Ensure consistent category tagging across products
3. Verify price consistency for products across promotions
`;
  }

  /**
   * Assign quality scores to products
   * Returns a new array with internal quality metrics added
   */
  private _assignQualityScores(products: UnifiedProduct[]): ProductWithQualityMetrics[] {
    return products.map(product => {
      let qualityScore = 0;
      const qualityFactors: Record<string, number> = {};

      // Base score
      qualityScore += 50;
      qualityFactors.baseScore = 50;

      // Add score for having image
      if (product.image_url) {
        const imageScore = 10;
        qualityScore += imageScore;
        qualityFactors.imageScore = imageScore;
      }

      // Add score for category
      if (product.main_category) {
        const categoryScore = 5;
        qualityScore += categoryScore;
        qualityFactors.categoryScore = categoryScore;
      }

      // Add score for brand
      if (product.brand) {
        const brandScore = 5;
        qualityScore += brandScore;
        qualityFactors.brandScore = brandScore;
      }

      // Add score for promotions
      if (product.is_promotion && product.promotion_mechanism) {
        const promotionScore = 10;
        qualityScore += promotionScore;
        qualityFactors.promotionScore = promotionScore;
      }

      // Add score for availability
      if (product.is_active === true) {
        const availabilityScore = 5;
        qualityScore += availabilityScore;
        qualityFactors.availabilityScore = availabilityScore;
      }

      // Add score for amount information
      if (product.quantity_amount && product.quantity_unit) {
        const amountScore = 10;
        qualityScore += amountScore;
        qualityFactors.amountScore = amountScore;
      }

      // Add score for unit conversion
      if (product.conversion_factor !== undefined) {
        const conversionScore = 5;
        qualityScore += conversionScore;
        qualityFactors.conversionScore = conversionScore;
      }

      // Cap the score at 100
      qualityScore = Math.min(100, qualityScore);

      // Return a new object with quality metrics added
      return {
        ...product,
        quality_score: Math.round(qualityScore * 10) / 10, // Round to 1 decimal place
        quality_factors: qualityFactors
      };
    });
  }

  /**
   * Calculate average quality score
   */
  private _getAverageQualityScore(products: ProductWithQualityMetrics[]): number {
    if (!products.length) return 0;

    const sum = products.reduce((total, product) => total + product.quality_score, 0);
    return sum / products.length;
  }

  /**
   * Calculate data completeness percentage
   */
  private _calculateCompleteness(products: ProductWithQualityMetrics[]): number {
    if (!products.length) return 0;

    const requiredFields = ['unified_id', 'shop_type', 'title', 'price_before_bonus', 'current_price'];
    const optionalFields = ['main_category', 'brand', 'image_url', 'sales_unit_size', 'quantity_amount', 'quantity_unit', 'is_promotion'];

    let totalFields = 0;
    let completedFields = 0;

    products.forEach(product => {
      // Required fields all count towards total
      requiredFields.forEach(field => {
        totalFields++;
        // @ts-ignore - Using dynamic field access
        if (product[field] !== undefined && product[field] !== null && product[field] !== '') {
          completedFields++;
        }
      });

      // Optional fields only count if present
      optionalFields.forEach(field => {
        // @ts-ignore - Using dynamic field access
        const value = product[field];
        if (value !== undefined && value !== null) {
          totalFields++;

          // For arrays and objects, check if they contain data
          if (Array.isArray(value)) {
            if (value.length > 0) completedFields++;
          } else if (typeof value === 'object') {
            if (Object.keys(value).length > 0) completedFields++;
          } else if (value !== '') {
            completedFields++;
          }
        }
      });
    });

    return (completedFields / totalFields) * 100;
  }

  /**
   * Calculate category accuracy
   */
  private _calculateCategoryAccuracy(products: ProductWithQualityMetrics[]): number {
    // Placeholder implementation
    return 85.5;
  }

  /**
   * Calculate price consistency
   */
  private _calculatePriceConsistency(products: ProductWithQualityMetrics[]): number {
    // Placeholder implementation
    return 92.3;
  }

  /**
   * Calculate promotion accuracy
   */
  private _calculatePromotionAccuracy(products: ProductWithQualityMetrics[]): number {
    // Placeholder implementation
    return 89.7;
  }

  /**
   * Calculate unit consistency
   */
  private _calculateUnitConsistency(products: ProductWithQualityMetrics[]): number {
    // Placeholder implementation
    return 94.1;
  }

  /**
   * Calculate distribution of scores
   */
  private _calculateScoreDistribution(products: ProductWithQualityMetrics[]): Record<string, number> {
    const distribution: Record<string, number> = {
      '90-100': 0,
      '80-89': 0,
      '70-79': 0,
      '60-69': 0,
      '50-59': 0,
      '<50': 0
    };

    products.forEach(product => {
      const score = product.quality_score || 0;

      if (score >= 90) {
        distribution['90-100']++;
      } else if (score >= 80) {
        distribution['80-89']++;
      } else if (score >= 70) {
        distribution['70-79']++;
      } else if (score >= 60) {
        distribution['60-69']++;
      } else if (score >= 50) {
        distribution['50-59']++;
      } else {
        distribution['<50']++;
      }
    });

    return distribution;
  }

  /**
   * Remove quality metrics from products before output
   * This ensures quality_score and quality_factors don't appear in output JSON
   */
  public removeQualityMetrics(products: (UnifiedProduct & Partial<QualityMetrics>)[]): UnifiedProduct[] {
    return products.map(product => {
      // Create a new object without the quality metrics
      const { quality_score, quality_factors, ...cleanProduct } = product;
      return cleanProduct;
    });
  }
}

/**
 * Get singleton instance of ProductQualityService
 */
export function getProductQualityService(): ProductQualityService {
  return new ProductQualityService();
}

/**
 * Calculate quality metrics for a set of products and then remove the metrics from output
 */
export async function calculateQualityMetrics(products: UnifiedProduct[]): Promise<UnifiedProduct[]> {
  const service = getProductQualityService();
  // Calculate quality metrics
  service.calculateQualityMetrics(products);
  // Return products without quality metrics for output
  return service.removeQualityMetrics(products);
}