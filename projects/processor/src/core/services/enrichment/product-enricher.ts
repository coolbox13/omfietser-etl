// src/core/services/enrichment/product-enricher.ts
import { UnifiedProduct } from '../../../types';
import { getLogger } from '../../../infrastructure/logging';
import { PromotionResult, SubPromotion } from '../../../types/promotion_types';
import {
  unitMappings,
  standardUnits,
  getUnitCategory,
  unitConversionFactors
} from '../../../config/units';
import { promotionPatterns, extractPromotionDetails } from '../../../config/promotions';

/**
 * Enhanced product with focused price and quantity fields
 */
export interface EnrichedProduct extends UnifiedProduct {
  // Normalized quantity
  normalized_quantity?: {
    amount: number;
    unit: string;
  };
  // Conversion factor from original to normalized
  conversion_factor?: number;
  // Price metrics
  price_per_standard_unit?: number;
  current_price_per_standard_unit?: number;
  // Discount metrics
  discount_absolute?: number;
  discount_percentage?: number;
  // Parsed promotion info
  parsed_promotion?: PromotionResult;
  // Quality metrics
  data_quality_score?: number;
}

export interface EnrichmentOptions {
  standardizeQuantities?: boolean;
  calculatePricePerUnit?: boolean;
  calculateDiscounts?: boolean;
  parsePromotions?: boolean;
  calculateQualityScore?: boolean;
}

/**
 * Service to enrich product data with calculated fields for price and quantity
 */
export class ProductEnricher {
  private static instance: ProductEnricher | null = null;

  // Lazy-loaded logger to avoid initialization issues
  private get logger() {
    return getLogger();
  }

  private constructor() {}

  public static getInstance(): ProductEnricher {
    if (!ProductEnricher.instance) {
      ProductEnricher.instance = new ProductEnricher();
    }
    return ProductEnricher.instance;
  }

  /**
   * Enrich a single product with calculated fields
   */
  public enrichProduct(
    product: UnifiedProduct,
    options: EnrichmentOptions = {}
  ): EnrichedProduct {
    const enrichedProduct: EnrichedProduct = { ...product };
    const {
      standardizeQuantities = true,
      calculatePricePerUnit = true,
      calculateDiscounts = true,
      parsePromotions = true,
      calculateQualityScore = true,
    } = options;

    // 1. Standardize quantity
    if (standardizeQuantities && product.quantity_amount && product.quantity_unit) {
      try {
        const { normalizedQuantity, conversionFactor } =
          this.standardizeQuantity({ amount: product.quantity_amount, unit: product.quantity_unit });
        enrichedProduct.normalized_quantity = normalizedQuantity;
        enrichedProduct.conversion_factor = conversionFactor;
      } catch (error) {
        this.logger.warn(
          `Failed to standardize quantity for product ${product.unified_id}: ${error}`
        );
      }
    }

    // 2. Calculate price per standard unit
    if (
      calculatePricePerUnit &&
      enrichedProduct.conversion_factor &&
      product.price_before_bonus
    ) {
      enrichedProduct.price_per_standard_unit = this.calculatePricePerUnit(
        product.price_before_bonus,
        enrichedProduct.conversion_factor
      );
      if (product.current_price) {
        enrichedProduct.current_price_per_standard_unit =
          this.calculatePricePerUnit(
            product.current_price,
            enrichedProduct.conversion_factor
          );
      }
    }

    // 3. Calculate discount metrics
    if (calculateDiscounts && product.price_before_bonus && product.current_price) {
      const discount = this.calculateDiscountMetrics(
        product.price_before_bonus,
        product.current_price
      );
      enrichedProduct.discount_absolute = discount.amount;
      enrichedProduct.discount_percentage = discount.percentage;
    }

    // 4. Parse promotion mechanism to get detailed breakdown
    if (
      parsePromotions &&
      product.promotion_mechanism &&
      product.price_before_bonus &&
      product.current_price
    ) {
      try {
        // Skip text-based promotion parsing for AH products since they use structured discount data
        // AH processor already handles promotions via discountLabels, so text parsing is redundant
        if (product.shop_type === 'AH') {
          this.logger.debug('Skipping text-based promotion parsing for AH product (uses structured discounts)', {
            context: {
              productId: product.unified_id,
              shopType: product.shop_type,
              promotionMechanism: product.promotion_mechanism
            }
          });
          
          // For AH, create a basic promotion result without text parsing
          enrichedProduct.parsed_promotion = {
            type: 'STRUCTURED_DISCOUNT',
            originalValue: product.promotion_mechanism,
            effectiveUnitPrice: product.current_price,
            effectiveDiscount: product.price_before_bonus - product.current_price,
          };
        } else {
          // Use text-based parsing for other shop types
          enrichedProduct.parsed_promotion = this.parsePromotionMechanism(
            product.promotion_mechanism,
            product.shop_type,
            product.price_before_bonus,
            product.current_price
          );
        }
      } catch (error) {
        this.logger.warn(
          `Failed to parse promotion for product ${product.unified_id}: ${error}`
        );
      }
    }

    // 5. Calculate data quality score
    if (calculateQualityScore) {
      enrichedProduct.data_quality_score =
        this.calculateQualityScore(enrichedProduct);
    }

    return enrichedProduct;
  }

  /**
   * Enrich multiple products with calculated fields
   */
  public enrichProducts(
    products: UnifiedProduct[],
    options?: EnrichmentOptions
  ): EnrichedProduct[] {
    return products.map(product => this.enrichProduct(product, options));
  }

  /**
   * Parse promotion mechanism to determine effective unit price, discount, or condition.
   *
   * Covers:
   * - X voor Y (multi-buy)
   * - X+Y gratis (buy X, get Y free)
   * - X% korting (percentage discount)
   * - 2e halve prijs, 2e gratis
   * - pakketkorting / volume voordeel
   * - delivery promos (gratis bezorging)
   * - conditional promos (bij elke X stuks, vanaf €X)
   * - multiple deals in one line separated by commas
   */
  private parsePromotionMechanism(
    mechanism: string,
    shopType: string,
    originalPrice: number,
    currentPrice: number
  ): PromotionResult {
    // Basic fallback: if we can't parse anything
    const fallbackResult: PromotionResult = {
      type: 'UNKNOWN',
      originalValue: mechanism,
      effectiveUnitPrice: currentPrice,
      effectiveDiscount: parseFloat((originalPrice - currentPrice).toFixed(2)),
    };

    // If nothing is provided, just return fallback
    if (!mechanism) return fallbackResult;

    // Normalize spacing and case
    let normalizedMechanism = mechanism
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

    // Some strings have multiple promos (e.g., "2 voor 3.00, 3 voor 4.50")
    const segments = normalizedMechanism.split(/[;,]/);

    // We'll parse each segment into a SubPromotion
    const subPromotions: SubPromotion[] = segments.map(segment => {
      const segText = segment.trim();

      // Default SubPromotion
      const segResult: SubPromotion = {
        type: 'UNKNOWN',
        originalValue: segText,
        effectiveUnitPrice: currentPrice,
        effectiveDiscount: parseFloat((originalPrice - currentPrice).toFixed(2)),
      };

      // If empty, skip
      if (!segText) return segResult;

      // Try each promotion pattern
      for (const pattern of promotionPatterns) {
        const match = segText.match(pattern.regex);
        if (match) {
          // Use the enhanced extraction function
          const details = extractPromotionDetails(pattern, match, originalPrice);

          return {
            type: details.type,
            originalValue: segText,
            effectiveUnitPrice: parseFloat(details.effectiveUnitPrice.toFixed(2)),
            effectiveDiscount: parseFloat(details.effectiveDiscount.toFixed(2)),
            requiredQuantity: details.requiredQuantity,
            totalPromotionPrice: details.totalPromotionPrice ?
              parseFloat(details.totalPromotionPrice.toFixed(2)) : undefined,
            paidQuantity: details.paidQuantity,
            isMultiPurchaseRequired: details.isMultiPurchaseRequired,
            thresholdItems: details.thresholdItems,
            thresholdAmount: details.thresholdAmount
          };
        }
      }

      return segResult;
    });

    // If only one segment, combine with fallback
    if (subPromotions.length === 1) {
      return {
        ...fallbackResult,
        ...subPromotions[0],
      };
    }

    // Else, multi-promo
    return {
      ...fallbackResult,
      type: 'MULTI_PROMO',
      subPromotions,
    };
  }

  /**
   * Standardize quantity to common units for comparison and calculate conversion factor
   */
  private standardizeQuantity(quantity: { amount: number; unit: string }): {
    normalizedQuantity: { amount: number; unit: string };
    conversionFactor: number;
  } {
    if (!quantity || !quantity.amount || !quantity.unit) {
      return {
        normalizedQuantity: { amount: 1, unit: 'stuk' },
        conversionFactor: 1
      };
    }

    const { amount, unit } = quantity;

    // Normalize the unit (e.g., 'gram' -> 'g', 'stuks' -> 'stuk')
    const normalizedUnit = this.normalizeUnit(unit);
    const unitCategory = getUnitCategory(normalizedUnit);

    switch (unitCategory) {
      case 'weight':
        // Convert to base unit (g), then to standard unit (kg)
        const toGrams = unitConversionFactors.weight[normalizedUnit] || 1;
        return {
          normalizedQuantity: { amount: 1, unit: 'kg' },
          conversionFactor: (amount * toGrams) / 1000
        };

      case 'volume':
        // Convert to base unit (ml), then to standard unit (l)
        const toMl = unitConversionFactors.volume[normalizedUnit] || 1;
        return {
          normalizedQuantity: { amount: 1, unit: 'l' },
          conversionFactor: (amount * toMl) / 1000
        };

      case 'piece':
      default:
        // For pieces, normalize to 1 piece
        return {
          normalizedQuantity: { amount: 1, unit: 'stuk' },
          conversionFactor: amount
        };
    }
  }

  /**
   * Normalize unit strings to standard units
   *
   * @param unit The unit string to normalize
   * @returns The normalized unit string
   */
  private normalizeUnit(unit: string): string {
    if (!unit) return 'stuk';

    // Clean the unit string
    const cleanUnit = unit.toLowerCase().trim()
      .replace(/^per\s+/, '') // Remove 'per' prefix
      .replace(/[.,;:\(\)]/g, '') // Remove punctuation
      .replace(/\s+/g, ' '); // Normalize whitespace

    // Handle multi-pack formats (e.g., "6 x 150g")
    const multiPackMatch = cleanUnit.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*([a-z]+)/i);
    if (multiPackMatch) {
      const [, , , itemUnit] = multiPackMatch;
      // Return the unit of the individual items
      if (unitMappings[itemUnit]) {
        return unitMappings[itemUnit];
      }
    }

    // Check for direct match in mappings
    if (unitMappings[cleanUnit]) {
      return unitMappings[cleanUnit];
    }

    // Check for partial matches
    for (const [key, value] of Object.entries(unitMappings)) {
      if (cleanUnit.includes(key)) {
        return value;
      }
    }

    // Handle numeric pack sizes (e.g., "12-pack", "6 pack")
    const packSizeMatch = cleanUnit.match(/(\d+)[\s-]*(pack|stuks|pieces|items)/i);
    if (packSizeMatch) {
      return 'stuk';
    }

    // Check if it's already a standard unit
    if (standardUnits.includes(cleanUnit)) {
      return cleanUnit;
    }

    // Default to stuk if no match found
    return 'stuk';
  }

  // src/core/services/enrichment/product-enricher.ts (continued)

  /**
   * Calculate price per standard unit
   */
  private calculatePricePerUnit(price: number, conversionFactor: number): number {
    if (!price || price <= 0 || !conversionFactor || conversionFactor <= 0) {
      return 0;
    }

    // Price per standard unit = original price / conversion factor
    // For 250g at €1.99, conversion factor is 0.25 (250g/1000g)
    // Price per kg = €1.99 / 0.25 = €7.96
    return parseFloat((price / conversionFactor).toFixed(2));
  }

  /**
   * Calculate discount amount and percentage
   */
  private calculateDiscountMetrics(originalPrice: number, discountedPrice: number): {
    amount: number;
    percentage: number;
  } {
    if (!originalPrice || originalPrice <= 0 || !discountedPrice || discountedPrice <= 0) {
      return { amount: 0, percentage: 0 };
    }

    // Sometimes discounted price might be higher than original price due to data errors
    if (discountedPrice >= originalPrice) {
      return { amount: 0, percentage: 0 };
    }

    const discountAmount = originalPrice - discountedPrice;
    const discountPercentage = (discountAmount / originalPrice) * 100;

    return {
      amount: parseFloat(discountAmount.toFixed(2)),
      percentage: parseFloat(discountPercentage.toFixed(1))
    };
  }

  /**
   * Calculate a data quality score for a product
   * @param product The enriched product
   * @returns A score between 0 and 100
   */
  private calculateQualityScore(product: EnrichedProduct): number {
    let score = 100;

    // Check for required fields
    const requiredFields: (keyof UnifiedProduct)[] = [
      'unified_id', 'title', 'shop_type',
      'quantity_amount', 'quantity_unit',
      'price_before_bonus', 'current_price'
    ];

    requiredFields.forEach(field => {
      const value = product[field];
      if (value === undefined || value === null || value === '') {
        score -= 10; // Deduct 10 points for each missing required field
      }
    });

    // Check quantity normalization
    if (!product.normalized_quantity || !product.conversion_factor) {
      score -= 5;
    }

    // Check price consistency
    if (product.is_promotion) {
      // For promotion products, check if current price is less than original
      if (product.current_price >= product.price_before_bonus) {
        score -= 10;
      }

      // Check if promotion fields are present
      if (!product.promotion_type || !product.promotion_mechanism) {
        score -= 5;
      }

      // Check if parsed promotion is available
      if (!product.parsed_promotion || product.parsed_promotion.type === 'UNKNOWN') {
        score -= 5;
      }
    } else {
      // For non-promotion products, check if prices match
      if (product.current_price !== product.price_before_bonus) {
        score -= 10;
      }

      // Check if promotion fields are absent
      if (product.promotion_type || product.promotion_mechanism) {
        score -= 5;
      }
    }

    // Check if category is available
    if (!product.main_category) {
      score -= 5;
    }

    // Check if image URL is available
    if (!product.image_url) {
      score -= 3;
    }

    // Check if unit price is consistent with calculated price
    if (product.unit_price && product.normalized_quantity &&
        product.normalized_quantity.unit === product.unit_price_unit) {
      const calculatedUnitPrice = product.price_per_standard_unit || 0;
      const listedUnitPrice = product.unit_price;

      // Allow 10% tolerance for rounding differences
      const tolerance = 0.1;
      const lowerBound = listedUnitPrice * (1 - tolerance);
      const upperBound = listedUnitPrice * (1 + tolerance);

      if (calculatedUnitPrice < lowerBound || calculatedUnitPrice > upperBound) {
        score -= 5;
      }
    }

    // Ensure score is between 0 and 100
    return Math.max(0, Math.min(100, score));
  }
}

// Export singleton accessor
export const getProductEnricher = (): ProductEnricher => {
  return ProductEnricher.getInstance();
};