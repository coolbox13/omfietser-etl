// src/processors/aldi.ts
import { BaseProcessor, BaseProcessorConfig } from './base';
import { UnifiedProduct } from '../types/product';
import { AldiTransformError } from '../types/errors';
import { CategoryNormalizer } from '../core/services/category/normalizer';
import { normalizeUnit, parsePromotionMechanism } from '../utils/calculate-fields';
import { createProductTemplate, UnifiedProductTemplate } from '../core/structure/unified-product-template';

export interface AldiProduct {
  articleNumber: string;
  title: string;
  brandName: string;
  salesUnit: string | null;
  price: string | null;
  priceFormatted: string | null;
  oldPrice?: string | null;
  oldPriceFormatted?: string | null;
  priceInfo?: string | null;
  priceReduction?: string | null;
  basePriceFormatted: string | null;
  basePriceValue: number | null;
  primaryImage: {
    baseUrl: string;
    alt?: string;
  };
  articleId: string;
  isNotAvailable?: boolean;
  isSoldOut?: boolean;
  shortDescription?: string;
  mainCategory?: string;
  promotionDetails?: {
    promotionDate?: string | number;
    dateFormat?: string;
    iterationPath?: string;
    promotionPath?: string;
  };
}

export class AldiProcessor extends BaseProcessor<AldiProduct> {
  private readonly categoryNormalizer: CategoryNormalizer;

  constructor(config: BaseProcessorConfig) {
    super(config, 'ALDI');
    this.categoryNormalizer = CategoryNormalizer.getInstance();
  }

  protected shouldSkipProduct(product: AldiProduct): boolean {
    if (product.isNotAvailable || product.isSoldOut) {
      this.logger.debug('Skipping product', {
        context: {
          articleNumber: product.articleNumber,
          reason: product.isNotAvailable ? 'Not available' : 'Sold out'
        }
      });
      return true;
    }

    // Skip "cadeaukaarten" products as they don't fit the target application
    if (product.mainCategory === 'cadeaukaarten') {
      this.logger.debug('Skipping gift card product', {
        context: {
          articleNumber: product.articleNumber,
          title: product.title?.substring(0, 50),
          category: product.mainCategory
        }
      });
      return true;
    }

    return false;
  }

  protected getProductId(product: AldiProduct): string {
    return product.articleNumber || 'unknown';
  }

  protected transformProduct(product: AldiProduct): UnifiedProduct {
    try {
      const price = this.parsePrice(product);
      const quantity = this.parseQuantity(product.salesUnit, product.shortDescription);
      const promotions = this.determinePromotions(product);
      
      // Determine price_before_bonus based on oldPrice logic
      const priceBeforeBonus = product.oldPrice && product.oldPrice !== null 
        ? parseFloat(product.oldPrice)  // Use oldPrice as the original price if available
        : price;  // Otherwise use current price

      // Use the centralized promotion parser to calculate the current price
      let currentPrice = priceBeforeBonus;
      if (promotions.promotionMechanism) {
        const parsedPromotion = parsePromotionMechanism(
          promotions.promotionMechanism,
          'ALDI',
          priceBeforeBonus,
          priceBeforeBonus // Pass the original price as current price since we're calculating it
        );

        // Use the effective unit price from the parsed promotion
        if (parsedPromotion.effectiveUnitPrice) {
          currentPrice = parsedPromotion.effectiveUnitPrice;
        }
      }

      // Parse promotion dates
      let promotionStartDate = this.formatPromotionDate(product.promotionDetails?.promotionDate);
      let promotionEndDate = null; // Aldi doesn't provide end dates by default

      // For products in discount category without explicit dates, use current week
      if (!promotionStartDate && (promotions.isPromotion || product.mainCategory === 'discount')) {
        const weekDates = this.getWeekDates();
        promotionStartDate = weekDates.startDate;
        promotionEndDate = weekDates.endDate;
      }

      // Extract initial category from mainCategory or fallback to articleId
      let initialCategory = product.mainCategory || this.extractInitialCategory(product.articleId);

      // Normalize category using the CategoryNormalizer
      const normalizedCategory = this.categoryNormalizer.normalizeCategory(
        product.title,
        initialCategory,
        'ALDI'
      );

      // Extract unit price if available
      const unitPrice = this.extractUnitPrice(product);

      // Calculate discount information
      let discountAbsolute: number | undefined;
      let discountPercentage: number | undefined;

      if (currentPrice < priceBeforeBonus && priceBeforeBonus > 0) {
        discountAbsolute = priceBeforeBonus - currentPrice;
        discountPercentage = (discountAbsolute / priceBeforeBonus) * 100;
      }

      // Extract promotion parsing data
      let parsedPromotionData = {
        effectiveUnitPrice: currentPrice < priceBeforeBonus ? currentPrice : undefined,
        requiredQuantity: undefined as number | undefined,
        totalPrice: undefined as number | undefined,
        isMultiPurchaseRequired: false
      };

      // Parse promotion mechanism for additional details
      if (promotions.promotionMechanism) {
        const parsedPromotion = parsePromotionMechanism(
          promotions.promotionMechanism,
          'ALDI',
          priceBeforeBonus,
          currentPrice
        );
        
        parsedPromotionData.requiredQuantity = parsedPromotion.requiredQuantity;
        parsedPromotionData.totalPrice = parsedPromotion.totalPromotionPrice;
        parsedPromotionData.isMultiPurchaseRequired = parsedPromotion.isMultiPurchaseRequired || false;
      }

      // Use the complete structure template to ensure all fields are present
      return createProductTemplate({
        // Core Product Identification
        unified_id: product.articleNumber,
        shop_type: 'ALDI',
        title: product.title,
        main_category: normalizedCategory,

        // Brand & Media
        brand: product.brandName ? product.brandName.trim() : '',
        image_url: product.primaryImage?.baseUrl || '',

        // Physical Product Information
        sales_unit_size: product.salesUnit || `${quantity.amount} ${quantity.unit}`,

        // Quantity Information
        quantity_amount: quantity.amount,
        quantity_unit: quantity.unit,
        default_quantity_amount: 1, // Aldi default quantity is typically 1
        default_quantity_unit: quantity.unit,

        // Price Information
        price_before_bonus: priceBeforeBonus,
        current_price: currentPrice,
        unit_price: unitPrice.price,
        unit_price_unit: unitPrice.unit,

        // Promotion Information
        is_promotion: promotions.isPromotion,
        promotion_type: promotions.promotionType,
        promotion_mechanism: promotions.promotionMechanism,
        promotion_start_date: promotionStartDate,
        promotion_end_date: promotionEndDate,

        // Parsed Promotion Details
        parsed_promotion_effective_unit_price: parsedPromotionData.effectiveUnitPrice,
        parsed_promotion_required_quantity: parsedPromotionData.requiredQuantity,
        parsed_promotion_total_price: parsedPromotionData.totalPrice,
        parsed_promotion_is_multi_purchase_required: parsedPromotionData.isMultiPurchaseRequired,

        // Normalized Quantities (will be calculated by calculateFields)
        normalized_quantity_amount: quantity.amount,
        normalized_quantity_unit: quantity.unit,
        conversion_factor: 1, // Will be calculated by calculateFields

        // Standard Unit Pricing (will be calculated by calculateFields)
        price_per_standard_unit: unitPrice.price,
        current_price_per_standard_unit: unitPrice.price, // Will be calculated by calculateFields

        // Discount Information
        discount_absolute: discountAbsolute,
        discount_percentage: discountPercentage,

        // Availability
        is_active: !product.isNotAvailable && !product.isSoldOut
      });
    } catch (error) {
      throw new AldiTransformError(
        error instanceof Error ? error.message : 'Unknown error during transformation',
        {
          id: product.articleNumber,
          articleNumber: product.articleNumber,
          availableFields: Object.keys(product),
          missingFields: []
        }
      );
    }
  }

  /**
   * Extract unit price from product data
   */
  private extractUnitPrice(product: AldiProduct): { price: number | undefined; unit: string | undefined } {
    try {
      if (product.basePriceValue && product.basePriceFormatted) {
        // Try to extract unit from formatted text, e.g., "€9.99/kg"
        const unitMatch = product.basePriceFormatted.match(/\/([a-zA-Z]+)/);
        const unit = unitMatch ? normalizeUnit(unitMatch[1]) : undefined;

        return {
          price: product.basePriceValue,
          unit
        };
      }

      return { price: undefined, unit: undefined };
    } catch (error) {
      this.logger.debug('Error extracting unit price', {
        context: {
          articleNumber: product.articleNumber,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      return { price: undefined, unit: undefined };
    }
  }

  /**
   * Format promotion date from Unix timestamp
   */
  private formatPromotionDate(timestamp?: string | number): string | null {
    if (!timestamp) return null;

    try {
      let timeValue: number;

      // Handle string or number timestamp
      if (typeof timestamp === 'string') {
        // If it's already in YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) {
          return timestamp;
        }
        timeValue = parseInt(timestamp, 10);
      } else {
        timeValue = timestamp;
      }

      // Convert Unix timestamp to date string (milliseconds)
      if (!isNaN(timeValue) && timeValue > 0) {
        const date = new Date(timeValue);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        }
      }

      return null;
    } catch (error) {
      this.logger.debug('Error formatting Aldi promotion date', {
        context: {
          timestamp,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      return null;
    }
  }

  private parseQuantity(salesUnit: string | null, shortDescription?: string): { amount: number; unit: string } {
    if (salesUnit) {
      const match = salesUnit.match(/(\d+(?:[.,]\d+)?)\s*(\w+\.?)/);
      if (match) {
        const [, amount, unit] = match;
        return {
          amount: parseFloat(amount.replace(',', '.')),
          unit: normalizeUnit(unit)
        };
      }
    }

    if (shortDescription) {
      const measurementMatch = shortDescription.match(/(\d+(?:[.,]\d+)?\s*(ml|g|kg|l))/i);
      if (measurementMatch) {
        const [value] = measurementMatch;
        const parts = value.split(' ');
        if (parts.length >= 2) {
          return {
            amount: parseFloat(parts[0].replace(',', '.')),
            unit: normalizeUnit(parts[1])
          };
        }
      }
    }

    return { amount: 1, unit: 'stuk' };
  }

  private parsePrice(product: AldiProduct): number {
    if (product.price) {
      const parsed = parseFloat(product.price);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }

    if (product.priceFormatted) {
      const parsed = parseFloat(product.priceFormatted.replace(/[^0-9.,]/g, '').replace(',', '.'));
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }

    return 0.01; // Use a minimal price instead of throwing an error
  }

  private determinePromotions(product: AldiProduct): {
    isPromotion: boolean;
    promotionType: string;
    promotionMechanism: string
  } {
    let isPromotion = false;
    let promotionType = '';
    let promotionMechanism = '';

    // Primary promotion detection: oldPrice field (user's specification)
    if (product.oldPrice && product.oldPrice !== null && product.oldPrice !== product.price) {
      isPromotion = true;
      promotionType = 'PRICE_REDUCTION';
      
      // Calculate discount percentage
      const oldPrice = parseFloat(product.oldPrice);
      const currentPrice = this.parsePrice(product);
      
      if (oldPrice > 0 && currentPrice > 0 && oldPrice > currentPrice) {
        const discountPercentage = Math.round(((oldPrice - currentPrice) / oldPrice) * 100);
        promotionMechanism = `-${discountPercentage}%`;
      } else {
        promotionMechanism = `Was €${oldPrice.toFixed(2)}`;
      }
    }
    
    // Secondary: Explicit promotion flags (fallback)
    else if (product.priceReduction && product.priceReduction.trim() !== '') {
      isPromotion = true;
      promotionType = 'PRICE_REDUCTION';
      promotionMechanism = product.priceReduction;
    } 
    else if (product.priceInfo && product.priceInfo.trim() !== '') {
      isPromotion = true;
      promotionType = 'PRICE_INFO';
      promotionMechanism = product.priceInfo;
    }

    // Tertiary: Check for products in the "discount" category without explicit promotion
    else if (product.mainCategory === 'discount') {
      isPromotion = true;
      promotionType = 'WEEKLY_OFFER';
      promotionMechanism = 'Weekaanbieding';
    }

    return { isPromotion, promotionType, promotionMechanism };
  }

  /**
   * Get the start and end dates of the current week
   */
  private getWeekDates(specificDate?: Date): { startDate: string; endDate: string } {
    const date = specificDate || new Date();
    const day = date.getDay();

    // Calculate Monday (start of week)
    const daysToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(date);
    monday.setDate(date.getDate() - daysToMonday);
    monday.setHours(0, 0, 0, 0);

    // Calculate Sunday (end of week)
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return {
      startDate: monday.toISOString().split('T')[0],
      endDate: sunday.toISOString().split('T')[0]
    };
  }

  // calculateCurrentPrice method removed - now using centralized parsePromotionMechanism

  private extractInitialCategory(articleId: string): string {
    if (!articleId) return 'Uncategorized';
    const parts = articleId.split('/');
    return parts.length > 1 ? parts.slice(0, -1).join('/') : 'Uncategorized';
  }
}

// Export standalone functions for use in tests
export function shouldSkipProduct(product: AldiProduct): boolean {
  if (product.isNotAvailable || product.isSoldOut) {
    return true;
  }

  // Skip "cadeaukaarten" products as they don't fit the target application
  if (product.mainCategory === 'cadeaukaarten') {
    return true;
  }

  return false;
}

export function transformAldiProduct(product: AldiProduct): UnifiedProduct {
  const processor = new AldiProcessor({
    inputDir: '',
    outputDir: '',
    inputFile: '',
    batchSize: 100,
    parallelProcessing: false
  });

  return processor['transformProduct'](product);
}