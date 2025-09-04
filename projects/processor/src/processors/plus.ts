// src/processors/plus.ts
import { BaseProcessor, BaseProcessorConfig } from './base';
import { UnifiedProduct, UnitPrice } from '../types/product';
import { PlusTransformError } from '../types/errors';
import { CategoryNormalizer } from '../core/services/category/normalizer';
import { normalizeUnit, parsePromotionMechanism } from '../utils/calculate-fields';
import { createProductTemplate, UnifiedProductTemplate } from '../core/structure/unified-product-template';

// Wrapper interface for PLUS products
export interface PlusProductWrapper {
  PLP_Str: PlusProduct;
  BadgeQuantity?: number;
}

export interface PlusProduct {
  SKU: string;
  Brand?: string;
  Name: string;
  Product_Subtitle?: string;  // Expected e.g., "Per 500 g"
  Slug?: string;
  ImageURL?: string;
  ImageLabel?: string;
  MetaTitle?: string;
  MetaDescription?: string;
  OriginalPrice: string;      // e.g., "1.99"
  NewPrice?: string;          // Promotional price, if any
  Quantity?: number;
  LineItemId?: string;
  IsProductOverMajorityAge?: boolean;
  Logos?: {
    PLPInUpperLeft?: { List: any[]; EmptyListItem?: any };
    PLPAboveTitle?: { List: any[]; EmptyListItem?: any };
    PLPBehindSizeUnit?: { List: any[]; EmptyListItem?: any };
  };
  EAN?: string;
  Packging?: string;          // Note: typo in original data "Packging" not "Packaging"
  IsAvailable: boolean;
  PromotionLabel?: string;    // e.g., "2 voor €3"
  PromotionBasedLabel?: string;
  PromotionStartDate?: string; // e.g., "2025-02-01"
  PromotionEndDate?: string;   // e.g., "2025-02-07"
  IsFreeDeliveryOffer?: boolean;
  IsOfflineSaleOnly?: boolean;
  MaxOrderLimit?: number;
  CitrusAdId?: string;
  Categories?: {
    List: Array<{ Name: string }>;
  };
}

export class PlusProcessor extends BaseProcessor<PlusProductWrapper> {
  private readonly categoryNormalizer: CategoryNormalizer;

  constructor(config: BaseProcessorConfig) {
    super(config, 'PLUS');
    this.categoryNormalizer = CategoryNormalizer.getInstance();
  }

  protected shouldSkipProduct(wrapper: PlusProductWrapper): boolean {
    // Check if wrapper exists
    if (!wrapper || !wrapper.PLP_Str) {
      this.logger.debug('Skipping product: Missing product data', {
        context: { productId: 'unknown' }
      });
      return true;
    }

    const product = wrapper.PLP_Str;

    if (!product.IsAvailable) {
      this.logger.debug('Skipping unavailable product', {
        context: {
          sku: product.SKU,
          name: product.Name
        }
      });
      return true;
    }
    return false;
  }

  protected getProductId(wrapper: PlusProductWrapper): string {
    return wrapper.PLP_Str?.SKU || 'unknown';
  }

  protected transformProduct(wrapper: PlusProductWrapper): UnifiedProduct {
    try {
      const product = wrapper.PLP_Str;
      this.validatePlusRequiredFields(product);

      const id = product.SKU;
      const title = product.Name;

      // Get initial category and normalize using the category normalizer
      let initialCategory = product.Categories?.List?.[0]?.Name || null;
      let normalizedCategory = initialCategory;

      if (initialCategory) {
        normalizedCategory = this.categoryNormalizer.normalizeCategory(
          title,
          initialCategory,
          'PLUS'
        );
      }

      const brand = product.Brand || title.split(' ')[0];
      const imageURL = product.ImageURL || '';

      // Parse quantity from available fields
      const quantity = this.parseQuantity(product);
      const salesUnitSize = product.Product_Subtitle && product.Product_Subtitle.trim().length > 0
        ? product.Product_Subtitle.replace(/^Per\s+/i, '')
        : `${quantity.amount} ${quantity.unit}`;

      const priceBeforeBonus = parseFloat(product.OriginalPrice) || 0;

      // Get initial current price from NewPrice if available
      let initialCurrentPrice: number;
      if (product.NewPrice) {
        const parsedNewPrice = parseFloat(product.NewPrice);
        // Use parsed promotion price only if it's valid and non-zero
        initialCurrentPrice = parsedNewPrice && !isNaN(parsedNewPrice) && parsedNewPrice > 0
          ? parsedNewPrice
          : priceBeforeBonus;
      } else {
        initialCurrentPrice = priceBeforeBonus;
      }

      // Add a safety check to ensure we never return zero price unless original price was zero
      if (initialCurrentPrice === 0 && priceBeforeBonus > 0) {
        this.logger.warn(`Zero currentPrice detected for ${product.SKU}, using priceBeforeBonus instead`, {
          context: {
            sku: product.SKU,
            originalPrice: product.OriginalPrice,
            newPrice: product.NewPrice
          }
        });
        initialCurrentPrice = priceBeforeBonus;
      }

      const unitPriceInfo = this.calculateUnitPrice(priceBeforeBonus, quantity);

      // Consolidate promotion/discount information
      const isPromotion =
        product.PromotionLabel !== undefined &&
        product.PromotionStartDate !== '1900-01-01' &&
        product.PromotionEndDate !== '1900-01-01';
      const promotionMechanism = isPromotion ? product.PromotionLabel || '' : '';
      const promotionStartDate = isPromotion ? product.PromotionStartDate || null : null;
      const promotionEndDate = isPromotion ? product.PromotionEndDate || null : null;

      // Use the centralized promotion parser to calculate the current price if there's a promotion
      let currentPrice = initialCurrentPrice;
      if (isPromotion && promotionMechanism) {
        const parsedPromotion = parsePromotionMechanism(
          promotionMechanism,
          'PLUS',
          priceBeforeBonus,
          initialCurrentPrice
        );

        // If the parsed promotion has an effective unit price, use it
        // Otherwise, keep the original current price
        if (parsedPromotion.effectiveUnitPrice) {
          currentPrice = parsedPromotion.effectiveUnitPrice;
        }
      }

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
      if (isPromotion && promotionMechanism) {
        const parsedPromotion = parsePromotionMechanism(
          promotionMechanism,
          'PLUS',
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
        unified_id: id,
        shop_type: 'PLUS',
        title: title,
        main_category: normalizedCategory,

        // Brand & Media
        brand: brand,
        image_url: imageURL,

        // Physical Product Information
        sales_unit_size: salesUnitSize,

        // Quantity Information
        quantity_amount: quantity.amount,
        quantity_unit: quantity.unit,
        default_quantity_amount: 1, // Plus default quantity is typically 1
        default_quantity_unit: quantity.unit,

        // Price Information
        price_before_bonus: priceBeforeBonus,
        current_price: currentPrice,
        unit_price: unitPriceInfo?.price,
        unit_price_unit: unitPriceInfo?.unit,

        // Promotion Information
        is_promotion: isPromotion,
        promotion_type: isPromotion ? 'DISCOUNT' : '',
        promotion_mechanism: promotionMechanism,
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
        price_per_standard_unit: unitPriceInfo?.price,
        current_price_per_standard_unit: unitPriceInfo?.price, // Will be calculated by calculateFields

        // Discount Information
        discount_absolute: discountAbsolute,
        discount_percentage: discountPercentage,

        // Availability
        is_active: product.IsAvailable
      });
    } catch (error) {
      throw new PlusTransformError(
        error instanceof Error ? error.message : 'Unknown error during transformation',
        {
          id: wrapper.PLP_Str?.SKU || 'unknown',
          sku: wrapper.PLP_Str?.SKU || 'unknown',
          availableFields: Object.keys(wrapper.PLP_Str || {}),
          missingFields: []
        }
      );
    }
  }

  private validatePlusRequiredFields(product: PlusProduct): void {
    const requiredFields = ['SKU', 'Name', 'OriginalPrice', 'Categories'];
    const missingFields = requiredFields.filter(field => !product[field as keyof PlusProduct]);

    if (missingFields.length > 0) {
      this.logger.error('Missing required fields', {
        context: {
          sku: product.SKU,
          missingFields
        }
      });
      throw new PlusTransformError(`Missing required fields: ${missingFields.join(', ')}`,
        {
          id: product.SKU || 'unknown',
          sku: product.SKU,
          availableFields: Object.keys(product),
          missingFields
        }
      );
    }
  }

  private parseQuantityFromSubtitle(subtitle: string): { amount: number; unit: string } | null {
    const match = subtitle.match(/Per\s+(\d+(?:[.,]\d+)?)\s*(\w+)/i);

    if (match) {
      const [, amount, unit] = match;
      return {
        amount: parseFloat(amount.replace(',', '.')),
        unit: normalizeUnit(unit)
      };
    }

    return null;
  }

  private extractQuantityFromSlug(slug: string): { amount: number; unit: string } | null {
    const match = slug.match(/-(\d+(?:[.,]\d+)?)-([a-zA-Z]+)/);

    if (match) {
      const [, amount, unit] = match;
      return {
        amount: parseFloat(amount.replace(',', '.')),
        unit: normalizeUnit(unit)
      };
    }
    return null;
  }

  private parseQuantityFromPackaging(packaging: string | undefined): { amount: number; unit: string } {
    if (packaging) {
      return { amount: 1, unit: normalizeUnit(packaging) };
    }
    return { amount: 1, unit: 'stuk' };
  }

  private parseQuantity(product: PlusProduct): { amount: number; unit: string } {
    // Try parsing from subtitle first (most reliable)
    if (product.Product_Subtitle) {
      const quantityFromSubtitle = this.parseQuantityFromSubtitle(product.Product_Subtitle);
      if (quantityFromSubtitle) return quantityFromSubtitle;
    }

    // Try parsing from slug as fallback
    if (product.Slug) {
      const quantityFromSlug = this.extractQuantityFromSlug(product.Slug);
      if (quantityFromSlug) return quantityFromSlug;
    }

    // Last resort: use packaging info or default
    return this.parseQuantityFromPackaging(product.Packging);
  }

  private calculateUnitPrice(price: number, quantity: { amount: number; unit: string }): UnitPrice | null {
    try {
      if (price <= 0 || quantity.amount <= 0) {
        return null;
      }

      // Convert to common units for unit price calculation
      let unitPrice: number;
      let unit: string;

      // For weight-based units, calculate per kg
      if (['g', 'gram', 'grams'].includes(quantity.unit.toLowerCase())) {
        unitPrice = (price / quantity.amount) * 1000; // Convert to per kg
        unit = 'kg';
      }
      // For volume-based units, calculate per liter
      else if (['ml', 'milliliter', 'milliliters'].includes(quantity.unit.toLowerCase())) {
        unitPrice = (price / quantity.amount) * 1000; // Convert to per liter
        unit = 'l';
      }
      // For item-based units, keep as per item
      else {
        unitPrice = price / quantity.amount;
        unit = quantity.unit;
      }

      // Only return unit price if it's different from the regular price
      // (i.e., the product is not a single unit)
      if (quantity.amount === 1 && quantity.unit === 'stuk') {
        return null;
      }

      return {
        price: Math.round(unitPrice * 100) / 100, // Round to 2 decimal places
        unit: unit
      };
    } catch (error) {
      this.logger.warn(`Error calculating unit price for ${quantity.amount} ${quantity.unit}`, {
        context: { price, quantity, error }
      });
      return null;
    }
  }
}

// Updated standalone function for use in tests
export function shouldSkipProduct(wrapper: PlusProductWrapper): boolean {
  if (!wrapper || !wrapper.PLP_Str) {
    return true;
  }

  const product = wrapper.PLP_Str;
  return !product.IsAvailable;
}

export function transformPlusProduct(wrapper: PlusProductWrapper): UnifiedProduct {
  const processor = new PlusProcessor({
    inputDir: '',
    outputDir: '',
    inputFile: '',
    batchSize: 100,
    parallelProcessing: false
  });

  return processor['transformProduct'](wrapper);
}