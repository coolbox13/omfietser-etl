// src/utils/calculate-fields.ts
import { UnifiedProduct } from '../types/product';
import { PromotionResult } from '../types/promotion_types';
import {
  unitMappings,
  standardUnits,
  getUnitCategory,
  unitConversionFactors
} from '../config/units';
import { promotionPatterns, extractPromotionDetails } from '../config/promotions';
import { getIssueTracker } from '../infrastructure/logging/issue-tracker';
import { ShopType } from '../types/monitoring';

/**
 * Calculate and add all derived fields to a product
 *
 * @param product The base product to enrich with calculated fields
 * @returns The same product with calculated fields added
 */
export function calculateFields(product: UnifiedProduct): UnifiedProduct {
  // Make a copy to avoid reference issues
  const enriched = { ...product };

  // Calculate in sequence, with each calculation potentially using previous ones

  // 1. Parse promotion if applicable
  if (product.is_promotion && product.promotion_mechanism) {
    let parsedPromotion: PromotionResult;
    
    // Skip text-based promotion parsing for AH products since they use structured discount data
    if (product.shop_type === 'AH') {
      // For AH, create a basic promotion result without text parsing
      parsedPromotion = {
        type: 'STRUCTURED_DISCOUNT',
        originalValue: product.promotion_mechanism,
        effectiveUnitPrice: product.current_price,
        effectiveDiscount: product.price_before_bonus - product.current_price,
      };
    } else {
      // Use text-based parsing for other shop types
      parsedPromotion = parsePromotionMechanism(
        product.promotion_mechanism,
        product.shop_type,
        product.price_before_bonus,
        product.current_price,
        product.unified_id
      );
    }

    // Set fields directly on the product - using new field names
    // Always set these core fields
    enriched.parsed_promotion_effective_unit_price = parsedPromotion.effectiveUnitPrice;

    // Set optional fields with consistent defaults for uniform structure
    enriched.parsed_promotion_required_quantity = parsedPromotion.requiredQuantity !== undefined 
      ? parsedPromotion.requiredQuantity 
      : 1; // Default to 1 for single-item promotions

    enriched.parsed_promotion_total_price = parsedPromotion.totalPromotionPrice !== undefined 
      ? parsedPromotion.totalPromotionPrice 
      : product.current_price; // Default to current price

    enriched.parsed_promotion_is_multi_purchase_required = parsedPromotion.isMultiPurchaseRequired !== undefined 
      ? parsedPromotion.isMultiPurchaseRequired 
      : false; // Default to false for simple discounts
  }

  // 2. Standardize quantities
  const { standardAmount, standardUnit, conversionFactor } = standardizeQuantity(
    product.quantity_amount,
    product.quantity_unit
  );

  enriched.normalized_quantity_amount = standardAmount;
  enriched.normalized_quantity_unit = standardUnit;
  enriched.conversion_factor = conversionFactor;

  // 3. Calculate price per standard unit
  if (conversionFactor) {
    // Calculate price per standard unit (per kg, per l, per piece)
    enriched.price_per_standard_unit = calculatePricePerUnit(
      product.price_before_bonus,
      conversionFactor
    );

    // If promotion has effective price, use that for current price per standard unit
    if (enriched.parsed_promotion_effective_unit_price) {
      enriched.current_price_per_standard_unit = calculatePricePerUnit(
        enriched.parsed_promotion_effective_unit_price,
        conversionFactor
      );
    } else {
      // Otherwise use regular current price
      enriched.current_price_per_standard_unit = calculatePricePerUnit(
        product.current_price,
        conversionFactor
      );
    }
  }

  // 4. Calculate discount metrics
  if (product.is_promotion) {
    // If we have a parsed promotion with effective unit price, calculate based on that
    if (enriched.parsed_promotion_effective_unit_price) {
      const { amount, percentage } = calculateDiscountMetrics(
        product.price_before_bonus,
        enriched.parsed_promotion_effective_unit_price
      );
      enriched.discount_absolute = amount;
      enriched.discount_percentage = percentage;
    } else {
      // Otherwise calculate from current price
      const { amount, percentage } = calculateDiscountMetrics(
        product.price_before_bonus,
        product.current_price
      );
      enriched.discount_absolute = amount;
      enriched.discount_percentage = percentage;
    }
  }

  return enriched;
}

/**
 * Parse a promotion mechanism text to extract structured information
 */
export function parsePromotionMechanism(
  mechanism: string,
  retailerCode: string,
  originalPrice: number,
  currentPrice: number,
  productId?: string
): PromotionResult {
  const issueTracker = getIssueTracker();

  // Basic fallback in case parsing fails
  const fallbackResult: PromotionResult = {
    type: 'UNKNOWN',
    originalValue: mechanism,
    effectiveUnitPrice: currentPrice,
    effectiveDiscount: parseFloat((originalPrice - currentPrice).toFixed(2)),
  };

  // If nothing is provided, just return fallback
  if (!mechanism) return fallbackResult;

  // Normalize spacing and case
  const normalizedMechanism = mechanism
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  // Some strings have multiple promos (e.g., "2 voor 3.00, 3 voor 4.50")
  const segments = normalizedMechanism.split(/[;,]/);

  // Parse each segment
  const subPromotions = segments.map(segment => {
    const segText = segment.trim();

    // Default
    const segResult = {
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
        // Use the extraction function
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

  // If only one segment, return it
  if (subPromotions.length === 1) {
    const result = {
      ...fallbackResult,
      ...subPromotions[0],
    };

    // Track unknown promotions for issue detection
    if (result.type === 'UNKNOWN' && productId) {
      issueTracker.trackUnknownPromotion(
        {
          processingStep: 'promotion_parsing',
          shopType: retailerCode as ShopType,
          productId
        },
        mechanism,
        originalPrice
      );
    }

    return result;
  }

  // Multi-promo
  return {
    ...fallbackResult,
    type: 'MULTI_PROMO',
    subPromotions,
  };
}

/**
 * Standardize a quantity to a reference unit and calculate conversion factor
 */
export function standardizeQuantity(
  amount: number,
  unit: string
): {
  standardAmount: number;
  standardUnit: string;
  conversionFactor: number;
} {
  // Ensure we always have valid inputs
  if (!amount || amount <= 0 || !unit) {
    return {
      standardAmount: 1,
      standardUnit: 'stuk',
      conversionFactor: 1
    };
  }

  try {
    // Normalize the unit
    const normalizedUnit = normalizeUnit(unit);
    const unitCategory = getUnitCategory(normalizedUnit);

    switch (unitCategory) {
      case 'weight': {
        // Convert to base unit (g), then to standard unit (kg)
        const toGrams = unitConversionFactors.weight[normalizedUnit] || 1;
        const weightInGrams = amount * toGrams;

        // Ensure we never return zero or negative conversion factor
        const weightConversionFactor = Math.max(weightInGrams / 1000, 0.001);

        return {
          standardAmount: weightConversionFactor, // Convert to kg
          standardUnit: 'kg',
          conversionFactor: weightConversionFactor
        };
      }

      case 'volume': {
        // Convert to base unit (ml), then to standard unit (l)
        const toMl = unitConversionFactors.volume[normalizedUnit] || 1;
        const volumeInMl = amount * toMl;

        // Ensure we never return zero or negative conversion factor
        const volumeConversionFactor = Math.max(volumeInMl / 1000, 0.001);

        return {
          standardAmount: volumeConversionFactor, // Convert to l
          standardUnit: 'l',
          conversionFactor: volumeConversionFactor
        };
      }

      case 'length': {
        // Convert to base unit (mm), then to standard unit (m)
        const toMm = unitConversionFactors.length[normalizedUnit] || 1;
        const lengthInMm = amount * toMm;

        // Ensure we never return zero or negative conversion factor
        const lengthConversionFactor = Math.max(lengthInMm / 1000, 0.001);

        return {
          standardAmount: lengthConversionFactor, // Convert to m
          standardUnit: 'm',
          conversionFactor: lengthConversionFactor
        };
      }

      case 'area': {
        // Convert to base unit (mm²), then to standard unit (m²)
        const toMm2 = unitConversionFactors.area[normalizedUnit] || 1;
        const areaInMm2 = amount * toMm2;

        // Ensure we never return zero or negative conversion factor
        const areaConversionFactor = Math.max(areaInMm2 / 1000000, 0.001);

        return {
          standardAmount: areaConversionFactor, // Convert to m²
          standardUnit: 'm2',
          conversionFactor: areaConversionFactor
        };
      }

      case 'piece':
      default:
        // For pieces, normalize to piece, ensuring minimum value
        return {
          standardAmount: Math.max(amount, 1),
          standardUnit: 'stuk',
          conversionFactor: Math.max(amount, 1)
        };
    }
  } catch (error) {
    // If any error occurs during standardization, return a safe default
    return {
      standardAmount: 1,
      standardUnit: 'stuk',
      conversionFactor: 1
    };
  }
}

/**
 * Normalize a unit string to a standard form
 *
 * @param unit The unit string to normalize
 * @param context Optional context for issue tracking
 * @returns The normalized unit string
 */
export function normalizeUnit(unit: string, context?: {
  shopType?: ShopType;
  productId?: string;
  processingStep?: string;
}): string {
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

  // Direct match in mappings
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

  // Check if already standard unit
  if (standardUnits.includes(cleanUnit)) {
    return cleanUnit;
  }

  // Track unit mapping fallback for issue detection
  if (context?.shopType && context?.productId) {
    const issueTracker = getIssueTracker();
    issueTracker.trackUnitMappingFallback(
      {
        processingStep: context.processingStep || 'unit_normalization',
        shopType: context.shopType,
        productId: context.productId
      },
      unit,
      'stuk'
    );
  }

  // Default
  return 'stuk';
}

/**
 * Calculate price per standard unit
 *
 * @param price The original price
 * @param conversionFactor The conversion factor from original to standard unit
 * @returns The price per standard unit
 */
export function calculatePricePerUnit(price: number, conversionFactor: number): number {
  // Enhanced validation to prevent division by zero or invalid calculations
  if (!price || !isFinite(price) || price <= 0) {
    return 0;
  }

  if (!conversionFactor || !isFinite(conversionFactor) || conversionFactor <= 0) {
    // Use a safe minimum value instead of returning 0
    conversionFactor = 0.001;
  }

  try {
    // Price per standard unit = original price / conversion factor
    // For 250g at €1.99, conversion factor is 0.25 (250g/1000g)
    // Price per kg = €1.99 / 0.25 = €7.96
    const result = price / conversionFactor;

    // Additional validation to ensure the result is reasonable
    if (!isFinite(result) || result <= 0) {
      // If result is not a valid number or negative, return 0
      return 0;
    }

    // Cap extremely high values to prevent unreasonable price per unit
    if (result > 10000) {
      return 10000;
    }

    // Round to 2 decimal places for currency
    return parseFloat(result.toFixed(2));
  } catch (error) {
    // Catch any unexpected errors during calculation
    console.error('Error calculating price per unit:', error);
    return 0;
  }
}

/**
 * Calculate discount amount and percentage
 */
export function calculateDiscountMetrics(
  originalPrice: number,
  discountedPrice: number
): {
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