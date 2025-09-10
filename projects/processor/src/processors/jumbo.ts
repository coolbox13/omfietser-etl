// src/processors/jumbo.ts
import { BaseProcessor, BaseProcessorConfig } from './base';
import { UnifiedProduct, UnitPrice } from '../types/product';
import { JumboTransformError } from '../types/errors';
import { serializeError } from '../utils/error';
import { getLogger } from '../infrastructure/logging';
import { CategoryNormalizer } from '../core/services/category/normalizer';
import { normalizeUnit, parsePromotionMechanism } from '../utils/calculate-fields';
import { createProductTemplate, UnifiedProductTemplate } from '../core/structure/unified-product-template';

// Updated wrapper interface - no mainCategory, but still wrapped
export interface JumboProductWrapper {
  product: JumboProduct;
}

// Updated interface to match the actual data structure from Jumbo API
export interface JumboProduct {
  id: string;
  title: string;
  brand?: string;
  category?: string; // This is the category field from the API
  subtitle?: string;
  quantity?: string;
  quantityDetails?: {
    maxAmount: number;
    minAmount: number;
    stepAmount: number;
    defaultAmount: number;
  };
  image?: string; // Changed from imageInfo structure
  inAssortment?: boolean;
  availability?: {
    availability: string;
    isAvailable: boolean;
  };
  prices?: {
    price?: number; // Now a simple integer representing cents
    promoPrice?: number | null;
    pricePerUnit?: {
      price: number; // Also integer representing cents
      unit?: string;
    };
  };
  promotions?: Array<{
    tags?: Array<{ text: string }>;
    start?: any;
    end?: any;
  }>;
}

export interface QuantityOption {
  unit: string;
  defaultAmount: number;
  minimumAmount: number;
  maximumAmount: number;
  amountStep: number;
}

export class JumboProcessor extends BaseProcessor<JumboProductWrapper> {
  private readonly categoryNormalizer: CategoryNormalizer;

  constructor(config: BaseProcessorConfig) {
    super(config, 'JUMBO');
    this.categoryNormalizer = CategoryNormalizer.getInstance();
  }

  protected shouldSkipProduct(wrapper: JumboProductWrapper): boolean {
    // Check if wrapper exists
    if (!wrapper || !wrapper.product) {
      this.logger.debug('Skipping product: Missing product data', {
        context: { productId: 'unknown' }
      });
      return true;
    }

    const product = wrapper.product;

    // Skip products without title
    if (!product.title || product.title.trim() === '') {
      this.logger.debug('Skipping product: Missing title', {
        context: { productId: product.id }
      });
      return true;
    }

    // Skip products without price
    if (!product.prices?.price || product.prices.price <= 0) {
      this.logger.debug('Skipping product: Missing or invalid price', {
        context: { productId: product.id, price: product.prices?.price }
      });
      return true;
    }

    // Skip products not in assortment
    if (product.inAssortment === false) {
      this.logger.debug('Skipping product: Not in assortment', {
        context: { productId: product.id }
      });
      return true;
    }

    // Skip unavailable products
    if (product.availability && !product.availability.isAvailable) {
      this.logger.debug('Skipping product: Not available', {
        context: { productId: product.id }
      });
      return true;
    }

    return false;
  }

  protected getProductId(wrapper: JumboProductWrapper): string {
    return wrapper.product?.id || 'unknown';
  }

  protected transformProduct(wrapper: JumboProductWrapper): UnifiedProduct {
    try {
      const product = wrapper.product;

      // Use category normalizer to normalize category (from product.category instead of wrapper.mainCategory)
      const initialCategory = product.category || '';
      const normalizedCategory = this.categoryNormalizer.normalizeCategory(
        product.title,
        initialCategory,
        'JUMBO'
      );

      const quantity = this.parseQuantity(product.quantity || product.subtitle);
      const unitPriceInfo = this.extractUnitPrice(product.prices?.pricePerUnit);

      // Extract promotion tags from the new promotions structure
      let promotionMechanism = '';
      if (product.promotions && product.promotions.length > 0) {
        const allTags: string[] = [];
        product.promotions.forEach(promo => {
          if (promo.tags && promo.tags.length > 0) {
            allTags.push(...promo.tags.map(tag => tag.text));
          }
        });
        promotionMechanism = allTags.join('; ');
      }

      // Convert price from cents to euros (349 -> 3.49)
      const priceBeforeBonus = (product.prices?.price || 0) / 100;

      // Use the centralized promotion parser to calculate the current price
      let currentPrice = priceBeforeBonus;
      if (promotionMechanism) {
        const parsedPromotion = parsePromotionMechanism(
          promotionMechanism,
          'JUMBO',
          priceBeforeBonus,
          priceBeforeBonus // Pass the original price as current price since we're calculating it
        );

        // Use the effective unit price from the parsed promotion
        if (parsedPromotion.effectiveUnitPrice) {
          currentPrice = parsedPromotion.effectiveUnitPrice;
        }
      }

      // Handle promo price if available
      if (product.prices?.promoPrice && product.prices.promoPrice > 0) {
        currentPrice = product.prices.promoPrice / 100;
      }

      // Get brand from the product or title (basic approach)
      const brandName = product.brand || product.title.split(' ')[0] || '';

      // Extract default quantity amount if available from quantityDetails
      const defaultQuantityInfo = this.extractDefaultQuantity(product.quantityDetails);

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
      if (promotionMechanism) {
        const parsedPromotion = parsePromotionMechanism(
          promotionMechanism,
          'JUMBO',
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
        unified_id: product.id,
        shop_type: 'JUMBO',
        title: product.title,
        main_category: normalizedCategory,

        // Brand & Media
        brand: brandName,
        image_url: product.image || '',

        // Physical Product Information
        sales_unit_size: product.quantity || product.subtitle || 'per stuk',

        // Quantity Information
        quantity_amount: quantity.amount,
        quantity_unit: quantity.unit,
        default_quantity_amount: defaultQuantityInfo.amount || 1,
        default_quantity_unit: defaultQuantityInfo.unit || quantity.unit,

        // Price Information
        price_before_bonus: priceBeforeBonus,
        current_price: currentPrice,
        unit_price: unitPriceInfo.price,
        unit_price_unit: unitPriceInfo.unit,

        // Promotion Information
        is_promotion: Boolean(product.promotions && product.promotions.length > 0),
        promotion_type: promotionMechanism
          ? (promotionMechanism.includes('%') ? 'DISCOUNT_PERCENTAGE' : 'DISCOUNT_AMOUNT')
          : '',
        promotion_mechanism: promotionMechanism,
        promotion_start_date: null, // Need to parse from new structure if required
        promotion_end_date: null,   // Need to parse from new structure if required

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
        price_per_standard_unit: unitPriceInfo.price,
        current_price_per_standard_unit: unitPriceInfo.price, // Will be calculated by calculateFields

        // Discount Information
        discount_absolute: discountAbsolute,
        discount_percentage: discountPercentage,

        // Availability
        is_active: product.availability?.isAvailable !== false && product.inAssortment !== false
      });
    } catch (error) {
      throw new JumboTransformError(
        error instanceof Error ? error.message : 'Unknown error',
        {
          id: wrapper.product?.id || 'unknown',
          availableFields: Object.keys(wrapper.product || {}),
          missingFields: []
        }
      );
    }
  }

  private parseQuantity(quantityStr?: string): { amount: number; unit: string } {
    if (!quantityStr) {
      return { amount: 1, unit: 'stuk' };
    }

    const match = quantityStr.match(/(\d+(?:[.,]\d+)?)\s*(\w+)/);
    if (!match) {
      this.logger.debug(`Could not parse quantity string: ${quantityStr}, defaulting to 1 stuk`);
      return { amount: 1, unit: 'stuk' };
    }

    const [, amount, unit] = match;
    return {
      amount: parseFloat(amount.replace(',', '.')),
      unit: normalizeUnit(unit),
    };
  }

  private extractUnitPrice(unitPrice?: {
    price: number;
    unit?: string;
  }): { price: number | undefined; unit: string | undefined } {
    try {
      if (!unitPrice || typeof unitPrice.price !== 'number') {
        return { price: undefined, unit: undefined };
      }

      return {
        unit: normalizeUnit(unitPrice.unit || ''),
        price: unitPrice.price / 100, // Convert from cents to euros
      };
    } catch (error) {
      this.logger.warn(`Error converting unit price`, {
        context: {
          unitPrice,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      return { price: undefined, unit: undefined };
    }
  }

  private extractDefaultQuantity(quantityDetails?: {
    maxAmount: number;
    minAmount: number;
    stepAmount: number;
    defaultAmount: number;
  }): { amount: number | undefined; unit: string | undefined } {
    if (!quantityDetails) {
      return { amount: undefined, unit: undefined };
    }

    return {
      amount: quantityDetails.defaultAmount,
      unit: 'stuk' // Default unit since it's not specified in quantityDetails
    };
  }
}

// Updated standalone function for use in tests
export function shouldSkipProduct(wrapper: JumboProductWrapper): boolean {
  if (!wrapper || !wrapper.product) {
    return true;
  }

  const product = wrapper.product;

  if (!product.title || product.title.trim() === '') {
    return true;
  }

  if (!product.prices?.price || product.prices.price <= 0) {
    return true;
  }

  if (product.inAssortment === false) {
    return true;
  }

  if (product.availability && !product.availability.isAvailable) {
    return true;
  }

  return false;
}

export function transformJumboProduct(wrapper: JumboProductWrapper): UnifiedProduct {
  const processor = new JumboProcessor({
    inputDir: '',
    outputDir: '',
    inputFile: '',
    batchSize: 100,
    parallelProcessing: false
  });

  return processor['transformProduct'](wrapper);
}