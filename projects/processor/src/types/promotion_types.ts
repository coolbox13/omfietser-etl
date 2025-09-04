// src/types/promotion_types.ts

/**
 * Enhanced type definitions for promotion handling
 */

/**
 * Pattern for matching and extracting promotion information from text
 */
export interface PromotionPattern {
  /**
   * Unique identifier for the pattern
   */
  id: string;

  /**
   * Standardized promotion type code
   */
  type: string;

  /**
   * Regular expression for matching the promotion text
   */
  regex: RegExp;

  /**
   * Function to extract the effective unit price after applying the promotion
   * @param match The regex match result
   * @param originalPrice The original price before promotion
   * @returns The effective unit price after promotion
   */
  extractEffectivePrice: (match: RegExpMatchArray, originalPrice: number) => number;

  /**
   * Human-readable description of the promotion pattern
   */
  description?: string;
}

/**
 * A sub-promotion is a single parsed deal from a promotion string
 * (e.g., "2 voor 3.00", "25% korting", "2+1 gratis").
 */
export interface SubPromotion {
  /**
   * Standardized promotion type code
   */
  type: string;

  /**
   * The raw segment text from the promotion mechanism
   */
  originalValue: string;

  /**
   * The computed per-unit price after discount
   */
  effectiveUnitPrice?: number;

  /**
   * How much is saved per unit
   */
  effectiveDiscount?: number;

  /**
   * For deals like "Bij elke 3 stuks"
   */
  thresholdItems?: number;
  
  /**
   * For deals with minimum spend requirements
   */
  thresholdAmount?: number;

  /**
   * Number of units required to get the promotion
   */
  requiredQuantity?: number;

  /**
   * Total price for the complete promotion package
   */
  totalPromotionPrice?: number;

  /**
   * Number of units actually paid for (in Buy X Get Y free)
   */
  paidQuantity?: number;

  /**
   * Flag indicating if multiple purchase is required for the promotion
   */
  isMultiPurchaseRequired?: boolean;
}

/**
 * A PromotionResult can be a single parsed promotion or
 * a 'MULTI_PROMO' containing multiple subPromotions.
 */
export interface PromotionResult extends SubPromotion {
  /**
   * For multi-promotions, contains the individual promotions
   */
  subPromotions?: SubPromotion[];
}

/**
 * Types of promotions that can be applied to products
 * Used for promotion parsing and classification
 */
export enum PromotionType {
  X_FOR_Y = 'X_FOR_Y',                      // e.g., "2 voor €3"
  X_PLUS_Y_FREE = 'X_PLUS_Y_FREE',          // e.g., "1+1 gratis"
  PERCENTAGE_DISCOUNT = 'PERCENTAGE_DISCOUNT', // e.g., "25% korting"
  SECOND_HALF_PRICE = 'SECOND_HALF_PRICE',  // e.g., "2e halve prijs"
  SECOND_FREE = 'SECOND_FREE',              // e.g., "2e gratis"
  FIXED_DISCOUNT = 'FIXED_DISCOUNT',        // e.g., "-€2"
  PACK_DISCOUNT = 'PACK_DISCOUNT',          // e.g., "20% pakketkorting"
  VOLUME_DISCOUNT = 'VOLUME_DISCOUNT',      // e.g., "10% volume voordeel"
  CONDITIONAL_BUY = 'CONDITIONAL_BUY',      // e.g., "bij elke 3 stuks"
  CONDITIONAL_SPEND = 'CONDITIONAL_SPEND',  // e.g., "vanaf €15"
  DELIVERY_PROMO = 'DELIVERY_PROMO',        // e.g., "gratis bezorging"
  MULTI_PROMO = 'MULTI_PROMO',              // Multiple promotions combined
  KIES_MIX = 'KIES_MIX',                    // e.g., "Kies & Mix Groenten en Fruit"
  STRUCTURED_DISCOUNT = 'STRUCTURED_DISCOUNT', // AH structured discount labels (not text parsed)
  UNKNOWN = 'UNKNOWN'                       // Unknown promotion type
}

/**
 * Database field mapping for PromotionResult
 * Maps our internal promotion result structure to database column names
 */
export interface DatabasePromotionFields {
  parsed_promotion_effective_unit_price?: number;
  parsed_promotion_required_quantity?: number;
  parsed_promotion_total_price?: number;
  parsed_promotion_is_multi_purchase_required?: boolean;
}

/**
 * Convert a PromotionResult to database field structure
 */
export function convertPromotionResultToDatabaseFields(result: PromotionResult): DatabasePromotionFields {
  return {
    parsed_promotion_effective_unit_price: result.effectiveUnitPrice,
    parsed_promotion_required_quantity: result.requiredQuantity,
    parsed_promotion_total_price: result.totalPromotionPrice,
    parsed_promotion_is_multi_purchase_required: result.isMultiPurchaseRequired
  };
}

/**
 * Check if a promotion is applicable based on the quantity purchased
 * @param promotionDetails The promotion details
 * @param quantityPurchased The quantity being purchased
 * @returns True if the promotion applies, false otherwise
 */
export function isPromotionApplicable(
  promotionDetails: PromotionResult, 
  quantityPurchased: number
): boolean {
  if (!promotionDetails.isMultiPurchaseRequired) {
    return true; // Single-item promotions always apply
  }
  
  return quantityPurchased >= (promotionDetails.requiredQuantity || 1);
}