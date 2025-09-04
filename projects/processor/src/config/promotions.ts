// src/config/promotions.ts
/**
 * Configuration for promotion parsing and standardization
 * This file centralizes patterns and logic for parsing promotion mechanisms
 */
import { PromotionPattern } from '../types/promotion_types';

/**
 * Array of promotion patterns for parsing promotion mechanisms
 * Each pattern includes:
 * - id: Unique identifier
 * - type: Standardized promotion type code
 * - regex: Regular expression for matching the promotion text
 * - extractEffectivePrice: Function to calculate the effective unit price
 */
export const promotionPatterns: PromotionPattern[] = [
  {
    id: 'fixed_price',
    type: 'FIXED_PRICE',
    regex: /Fixed price [€]?(\d+[.,]?\d*)/i,
    extractEffectivePrice: (match, originalPrice) => {
      const fixedPrice = parseFloat(match[1].replace(',', '.'));
      return fixedPrice > 0 ? fixedPrice : originalPrice;
    },
    description: 'Fixed promotional price (e.g., "Fixed price €0.99")'
  },

  {
    id: 'x_for_y',
    type: 'X_FOR_Y',
    regex: /(\d+)\s*voor\s*[€]?(\d+[.,]?\d*)/i,
    extractEffectivePrice: (match, originalPrice) => {
      const quantity = parseInt(match[1], 10);
      const totalPrice = parseFloat(match[2].replace(',', '.'));
      return quantity > 0 ? totalPrice / quantity : originalPrice;
    },
    description: 'Multiple items for a fixed price (e.g., "2 voor €3")'
  },
  {
    id: 'x_plus_y_free',
    type: 'X_PLUS_Y_FREE',
    regex: /(\d+)\s*\+\s*(\d+)\s*gratis/i,
    extractEffectivePrice: (match, originalPrice) => {
      const buyQty = parseInt(match[1], 10);
      const freeQty = parseInt(match[2], 10);
      const totalItems = buyQty + freeQty;
      return (buyQty > 0 && freeQty > 0) ? (originalPrice * buyQty) / totalItems : originalPrice;
    },
    description: 'Buy X get Y free (e.g., "1+1 gratis")'
  },

  {
    id: 'percentage_discount',
    type: 'PERCENTAGE_DISCOUNT',
    regex: /(\d+)\s*%\s*korting|-\s*(\d+)%/i,
    extractEffectivePrice: (match, originalPrice) => {
      const pctStr = match[1] || match[2];
      const pct = parseInt(pctStr, 10);
      if (pct > 0 && pct <= 100) {
        return originalPrice * (1 - pct / 100);
      }
      return originalPrice;
    },
    description: 'Percentage discount (e.g., "25% korting", "25 % KORTING", "-25%")'
  },
  {
    id: 'second_half_price',
    type: 'SECOND_HALF_PRICE',
    regex: /2e\s+halve\s+prijs/i,
    extractEffectivePrice: (_, originalPrice) => {
      // If you buy 2, effectively paying for 1.5 total
      return originalPrice * 0.75;
    },
    description: 'Second item half price'
  },
  {
    id: 'second_free',
    type: 'SECOND_FREE',
    regex: /2e\s+gratis/i,
    extractEffectivePrice: (_, originalPrice) => {
      // If you buy 2, effectively paying for 1 total
      return originalPrice * 0.5;
    },
    description: 'Second item free'
  },
  {
    id: 'fixed_discount',
    type: 'FIXED_DISCOUNT',
    regex: /-\s*[€]?(\d+[.,]?\d*)/i,
    extractEffectivePrice: (match, originalPrice) => {
      const discount = parseFloat(match[1].replace(',', '.'));
      return Math.max(0, originalPrice - discount);
    },
    description: 'Fixed amount discount (e.g., "-€2")'
  },
  {
    id: 'pack_discount',
    type: 'PACK_DISCOUNT',
    regex: /(\d+)%\s*pakketkorting/i,
    extractEffectivePrice: (match, originalPrice) => {
      const pct = parseInt(match[1], 10);
      if (pct > 0 && pct < 100) {
        return originalPrice * (1 - pct / 100);
      }
      return originalPrice;
    },
    description: 'Package discount'
  },
  {
    id: 'volume_discount',
    type: 'VOLUME_DISCOUNT',
    regex: /(\d+)%\s*volume\s*voordeel/i,
    extractEffectivePrice: (match, originalPrice) => {
      const pct = parseInt(match[1], 10);
      if (pct > 0 && pct < 100) {
        return originalPrice * (1 - pct / 100);
      }
      return originalPrice;
    },
    description: 'Volume discount'
  },
  {
    id: 'conditional_buy',
    type: 'CONDITIONAL_BUY',
    regex: /bij\s+elke\s+(\d+)\s+stuks/i,
    extractEffectivePrice: (match, originalPrice) => {
      // For conditional promotions, we don't change the effective price
      // since it depends on the quantity purchased
      return originalPrice;
    },
    description: 'Conditional purchase discount'
  },
  {
    id: 'conditional_spend',
    type: 'CONDITIONAL_SPEND',
    regex: /vanaf\s*[€]?(\d+[.,]?\d*)/i,
    extractEffectivePrice: (_, originalPrice) => {
      // For spend thresholds, we don't change the effective price
      return originalPrice;
    },
    description: 'Minimum spend threshold discount'
  },
  {
    id: 'delivery_promo',
    type: 'DELIVERY_PROMO',
    regex: /gratis\s+bezorging|bezorgkorting/i,
    extractEffectivePrice: (_, originalPrice) => {
      // For delivery promotions, don't change the product price
      return originalPrice;
    },
    description: 'Free or discounted delivery'
  },
  {
    id: 'kies_mix',
    type: 'KIES_MIX',
    regex: /kies\s*&?\s*mix/i,
    extractEffectivePrice: (_, originalPrice) => {
      // For Kies & Mix promotions, we need the additional tag information
      // which is handled separately in the Jumbo processor
      return originalPrice;
    },
    description: 'Kies & Mix promotions'
  }
];

/**
 * Maps promotion types to human-readable descriptions
 */
export const promotionTypeDescriptions: Record<string, string> = {
  'X_FOR_Y': 'Multiple items for a fixed price',
  'X_PLUS_Y_FREE': 'Buy X, get Y free',
  'PERCENTAGE_DISCOUNT': 'Percentage discount',
  'SECOND_HALF_PRICE': 'Second item at half price',
  'SECOND_FREE': 'Second item free',
  'FIXED_DISCOUNT': 'Fixed amount discount',
  'FIXED_PRICE': 'Fixed promotional price',
  'PACK_DISCOUNT': 'Package discount',
  'VOLUME_DISCOUNT': 'Volume discount',
  'CONDITIONAL_BUY': 'Conditional purchase discount',
  'CONDITIONAL_SPEND': 'Minimum spend threshold discount',
  'DELIVERY_PROMO': 'Delivery promotion',
  'KIES_MIX': 'Kies & Mix promotion',
  'MULTI_PROMO': 'Multiple promotions combined',
  'UNKNOWN': 'Unknown promotion type'
};

/**
 * Enhanced information extraction for promotions with the new fields
 * @param pattern The matched promotion pattern 
 * @param match The regex match
 * @param originalPrice The original price
 * @returns Complete promotion information
 */
export function extractPromotionDetails(
  pattern: PromotionPattern,
  match: RegExpMatchArray,
  originalPrice: number
): {
  type: string;
  effectiveUnitPrice: number;
  effectiveDiscount: number;
  requiredQuantity?: number;
  totalPromotionPrice?: number;
  paidQuantity?: number;
  isMultiPurchaseRequired?: boolean;
  thresholdItems?: number;
  thresholdAmount?: number;
} {
  // Get basic price information
  const effectiveUnitPrice = pattern.extractEffectivePrice(match, originalPrice);
  const effectiveDiscount = Math.max(0, originalPrice - effectiveUnitPrice);
  
  // Default promotion details
  const details = {
    type: pattern.type,
    effectiveUnitPrice,
    effectiveDiscount
  };
  
  // Add specific details based on promotion type
  switch (pattern.id) {
    case 'fixed_price': {
      const fixedPrice = parseFloat(match[1].replace(',', '.'));
      
      return {
        ...details,
        effectiveUnitPrice: fixedPrice,
        effectiveDiscount: Math.max(0, originalPrice - fixedPrice),
        isMultiPurchaseRequired: false
      };
    }
    
    case 'x_for_y': {
      const quantity = parseInt(match[1], 10);
      const totalPrice = parseFloat(match[2].replace(',', '.'));
      
      return {
        ...details,
        requiredQuantity: quantity,
        totalPromotionPrice: totalPrice,
        isMultiPurchaseRequired: true
      };
    }
    
    case 'x_plus_y_free': {
      const buyQty = parseInt(match[1], 10);
      const freeQty = parseInt(match[2], 10);
      const totalQty = buyQty + freeQty;
      
      return {
        ...details,
        requiredQuantity: totalQty,
        paidQuantity: buyQty,
        totalPromotionPrice: originalPrice * buyQty,
        isMultiPurchaseRequired: true
      };
    }
    
    case 'second_half_price': {
      return {
        ...details,
        requiredQuantity: 2,
        paidQuantity: 1.5,
        totalPromotionPrice: originalPrice * 1.5,
        isMultiPurchaseRequired: true
      };
    }
    
    case 'second_free': {
      return {
        ...details,
        requiredQuantity: 2,
        paidQuantity: 1,
        totalPromotionPrice: originalPrice,
        isMultiPurchaseRequired: true
      };
    }
    
    case 'conditional_buy': {
      const thresholdItems = parseInt(match[1], 10);
      
      return {
        ...details,
        thresholdItems,
        isMultiPurchaseRequired: true
      };
    }
    
    case 'conditional_spend': {
      const thresholdAmount = parseFloat(match[1].replace(',', '.'));
      
      return {
        ...details,
        thresholdAmount,
        isMultiPurchaseRequired: false
      };
    }
    
    // For other types, just return the basic details
    default:
      return details;
  }
}

/**
 * Get a human-readable description for a promotion type
 * @param type The promotion type code
 * @returns Human-readable description
 */
export function getPromotionDescription(type: string): string {
  return promotionTypeDescriptions[type] || 'Unknown promotion type';
}