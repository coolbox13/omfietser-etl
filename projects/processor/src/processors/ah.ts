// src/processors/ah.ts
import { BaseProcessor, BaseProcessorConfig } from './base';
import { UnifiedProduct } from '../types/product';
import { AHTransformError } from '../types/errors';
import { getLogger } from '../infrastructure/logging';
import { CategoryNormalizer } from '../core/services/category/normalizer';
import { normalizeUnit, parsePromotionMechanism } from '../utils/calculate-fields';
import { createProductTemplate, UnifiedProductTemplate } from '../core/structure/unified-product-template';
export interface AHProduct {
  webshopId: number;
  title: string;
  salesUnitSize?: string;
  unitPriceDescription?: string;
  images: Array<{
    url: string;
    width: number;
  }>;
  mainCategory?: string;
  brand?: string;
  shopType: string;
  priceBeforeBonus?: number;
  currentPrice?: number;
  bonusStartDate?: string;
  bonusEndDate?: string;
  promotionType?: string;
  bonusMechanism?: string;
  isBonus?: boolean;
  isVirtualBundle?: boolean;
  orderAvailabilityStatus?: string;
  discountLabels: Array<{
    code: string;
    defaultDescription?: string;
    count?: number;
    price?: number;
    freeCount?: number;
    percentage?: number;
    precisePercentage?: number;
    amount?: number;
    unit?: string;
  }>;
}

export class AHProcessor extends BaseProcessor<AHProduct> {
  private readonly categoryNormalizer: CategoryNormalizer;

  constructor(config: BaseProcessorConfig) {
    super(config, 'AH');
    this.categoryNormalizer = CategoryNormalizer.getInstance();
  }

  protected shouldSkipProduct(product: AHProduct): boolean {
    if (!product) return true;

    if (product.isVirtualBundle) {
      this.logger.debug('Skipping virtual bundle product', {
        context: { productId: product.webshopId }
      });
      return true;
    }

    if (product.orderAvailabilityStatus !== 'IN_ASSORTMENT') {
      this.logger.debug('Skipping product not in assortment', {
        context: { productId: product.webshopId }
      });
      return true;
    }

    // Skip "AH Voordeelshop" products as they don't fit the target application
    if (product.mainCategory === 'AH Voordeelshop') {
      this.logger.debug('Skipping AH Voordeelshop product', {
        context: {
          productId: product.webshopId,
          title: product.title?.substring(0, 50),
          category: product.mainCategory
        }
      });
      return true;
    }

    // Skip bundle products without individual pricing information
    // These are typically meal kits, multi-packs, etc. that don't have individual item prices
    if (!product.priceBeforeBonus && !product.currentPrice) {
      this.logger.debug('Skipping bundle product without individual pricing', {
        context: {
          productId: product.webshopId,
          title: product.title?.substring(0, 50),
          isBonus: product.isBonus,
          hasDiscountLabels: !!product.discountLabels?.length
        }
      });
      return true;
    }

    return false;
  }

  protected getProductId(product: AHProduct): string {
    return product.webshopId?.toString() || 'unknown';
  }

  protected transformProduct(product: AHProduct): UnifiedProduct {
    try {
      // Extract basic product information
      const id = this.getProductId(product);
      const title = product.title;

      // Normalize category
      let mainCategory = product.mainCategory || '';
      mainCategory = this.categoryNormalizer.normalizeCategory(
        title,
        mainCategory,
        'AH'
      );

      // Extract brand
      const brand = product.brand || '';

      // Extract image URL
      const imageURL = product.images?.length > 0 ?
        product.images.reduce((prev, current) =>
          (prev.width > current.width) ? prev : current
        ).url : '';

      // Get product quantity information
      const salesUnitSize = product.salesUnitSize || 'per stuk';
      const quantity = this.parseQuantity(salesUnitSize);

      // Handle pricing information
      const priceBeforeBonus = product.priceBeforeBonus || 0;
      
      // Get promotion information for validation
      const isPromotion = product.isBonus || false;
      
      // For promotional products, check if we have structured discount data with pricing
      const hasStructuredPricing = isPromotion && product.discountLabels && 
        product.discountLabels.some(label => 
          label.price !== undefined || 
          label.percentage !== undefined ||
          label.amount !== undefined
        );
      
      // For promotional products, validate that we have proper price information
      if (isPromotion && !hasStructuredPricing && (product.priceBeforeBonus === null || product.priceBeforeBonus === undefined)) {
        this.logger.debug('Skipping promotional product: Missing both priceBeforeBonus and structured pricing', {
          context: { 
            productId: id, 
            priceBeforeBonus: product.priceBeforeBonus,
            currentPrice: product.currentPrice,
            bonusMechanism: product.bonusMechanism,
            hasDiscountLabels: !!product.discountLabels?.length,
            title: title?.substring(0, 50)
          }
        });
        throw new AHTransformError('Missing price data for promotional product', {
          id: id,
          availableFields: Object.keys(product),
          missingFields: ['priceBeforeBonus_for_promotion']
        });
      }
      
      // For any product (promotional or not), ensure we have some valid price or structured pricing
      if (!hasStructuredPricing && priceBeforeBonus <= 0 && (product.currentPrice === null || product.currentPrice === undefined || product.currentPrice <= 0)) {
        this.logger.debug('Skipping product: No valid price information', {
          context: { 
            productId: id, 
            priceBeforeBonus: product.priceBeforeBonus,
            currentPrice: product.currentPrice,
            hasStructuredPricing,
            title: title?.substring(0, 50)
          }
        });
        throw new AHTransformError('No valid price information available', {
          id: id,
          availableFields: Object.keys(product),
          missingFields: ['valid_price']
        });
      }

      // Get promotion information (already declared above for validation)
      const promotionType = isPromotion ? (product.promotionType || 'DISCOUNT') : '';
      const promotionMechanism = isPromotion ? (product.bonusMechanism || '') : '';
      const promotionStartDate = isPromotion ? product.bonusStartDate || null : null;
      const promotionEndDate = isPromotion ? product.bonusEndDate || null : null;

      // Enhanced promotion handling: Use structured discountLabels for pricing calculations
      // but keep the original mechanism text for display purposes
      let effectiveDiscountPrice: number | undefined;
      let hasStructuredDiscount = false;
      
              if (isPromotion && product.discountLabels && product.discountLabels.length > 0) {
          for (const label of product.discountLabels) {
          
                      switch (label.code) {
              case 'DISCOUNT_FIXED_PRICE':
                effectiveDiscountPrice = label.price;
                hasStructuredDiscount = true;
                break;
              case 'DISCOUNT_PERCENTAGE':
                if (label.percentage && priceBeforeBonus > 0) {
                  effectiveDiscountPrice = priceBeforeBonus * (1 - label.percentage / 100);
                  hasStructuredDiscount = true;
                }
                break;
              case 'DISCOUNT_AMOUNT':
                if (label.amount && priceBeforeBonus > 0) {
                  effectiveDiscountPrice = Math.max(0, priceBeforeBonus - label.amount);
                  hasStructuredDiscount = true;
                }
                break;
            case 'DISCOUNT_X_FOR_Y':
              if (label.count && label.price && label.count > 0) {
                effectiveDiscountPrice = label.price / label.count;
                hasStructuredDiscount = true;
              }
              break;
            case 'DISCOUNT_BUNDLE_BULK':
              // Volume discount (e.g., "5% volume voordeel")
              if (label.percentage) {
                // For bundles without priceBeforeBonus, use currentPrice as base
                const basePrice = priceBeforeBonus > 0 ? priceBeforeBonus : (product.currentPrice || 0);
                if (basePrice > 0) {
                  effectiveDiscountPrice = basePrice * (1 - label.percentage / 100);
                  hasStructuredDiscount = true;
                }
              }
              break;
            case 'DISCOUNT_X_PLUS_Y_FREE':
              // Buy X get Y free (e.g., "1 + 1 gratis", "2 + 1 gratis")
              if (label.count && label.freeCount && label.count > 0 && label.freeCount > 0) {
                const totalItems = label.count + label.freeCount;
                const effectiveUnitPrice = (priceBeforeBonus * label.count) / totalItems;
                effectiveDiscountPrice = effectiveUnitPrice;
                hasStructuredDiscount = true;
              }
              break;
            case 'DISCOUNT_ONE_HALF_PRICE':
              // Second item half price (e.g., "2e Halve Prijs")
              if (label.count && label.count >= 2) {
                // For "2e Halve Prijs": pay full price for first, half price for second
                const discountedPrice = priceBeforeBonus * 0.75; // Average: (1.0 + 0.5) / 2 = 0.75
                effectiveDiscountPrice = discountedPrice;
                hasStructuredDiscount = true;
              }
              break;
            case 'DISCOUNT_BUNDLE':
              // Package discount - use current price as is since it's already discounted
              effectiveDiscountPrice = product.currentPrice || priceBeforeBonus;
              hasStructuredDiscount = true;
              break;
            case 'DISCOUNT_BUNDLE_MIXED':
              // Mixed package discount with percentage
              if (label.percentage) {
                // For bundles without priceBeforeBonus, use currentPrice as base
                const basePrice = priceBeforeBonus > 0 ? priceBeforeBonus : (product.currentPrice || 0);
                if (basePrice > 0) {
                  effectiveDiscountPrice = basePrice * (1 - label.percentage / 100);
                  hasStructuredDiscount = true;
                }
              }
              break;
            case 'DISCOUNT_OP_IS_OP':
              // "Op=Op" clearance discount
              if (label.percentage && priceBeforeBonus > 0) {
                effectiveDiscountPrice = priceBeforeBonus * (1 - label.percentage / 100);
                hasStructuredDiscount = true;
              }
              break;
            case 'DISCOUNT_TIERED_PERCENT':
              // Tiered percentage discount (e.g., "stapelen tot 55%")
              // Use the highest percentage available
              if (label.percentage && priceBeforeBonus > 0) {
                effectiveDiscountPrice = priceBeforeBonus * (1 - label.percentage / 100);
                hasStructuredDiscount = true;
              }
              break;
            case 'DISCOUNT_WEIGHT':
              // Weight-based discount (e.g., "500 GRAM VOOR 2.99")
              if (label.count && label.price && label.count > 0) {
                // This is typically per unit weight, use the given price
                effectiveDiscountPrice = label.price;
                hasStructuredDiscount = true;
              }
              break;
            case 'DISCOUNT_TIERED_PRICE':
              // Tiered price discount (e.g., "2 STAPELEN VOOR 2.99")
              if (label.count && label.price && label.count > 0) {
                effectiveDiscountPrice = label.price / label.count;
                hasStructuredDiscount = true;
              }
              break;
            case 'DISCOUNT_FALLBACK':
              // Fallback discount with fixed price
              if (label.price) {
                effectiveDiscountPrice = label.price;
                hasStructuredDiscount = true;
              }
              break;
            case 'DISCOUNT_BONUS':
              // Generic bonus - use current price as is
              effectiveDiscountPrice = product.currentPrice || priceBeforeBonus;
              hasStructuredDiscount = true;
              break;
            default:
              // Log unknown discount types for future implementation
              this.logger.warn('Unknown discount label type encountered', {
                context: {
                  productId: product.webshopId,
                  discountCode: label.code,
                  bonusMechanism: product.bonusMechanism,
                  label: label
                }
              });
              break;
          }
          // Use the first (primary) discount label
          if (hasStructuredDiscount) break;
        }
      }

      // Calculate current price using structured data when available
      let currentPrice = product.currentPrice || priceBeforeBonus;
      if (isPromotion) {
        if (hasStructuredDiscount && effectiveDiscountPrice !== undefined) {
          // Use the structured discount price for accurate calculations
          currentPrice = effectiveDiscountPrice;
        } else if (promotionMechanism) {
          // AH products should always have structured discount data
          // Log cases where structured data is missing for investigation
          this.logger.error('AH promotional product missing structured discount data', {
            context: {
              productId: product.webshopId,
              bonusMechanism: promotionMechanism,
              discountLabels: product.discountLabels,
              hasStructuredDiscount,
              effectiveDiscountPrice,
              reason: 'This should not happen - all AH bonus products should have discountLabels'
            }
          });
          
          // Use current price as fallback instead of text parsing
          // since we know AH provides accurate currentPrice values
          currentPrice = product.currentPrice || priceBeforeBonus;
        }
      }

      // Final validation: ensure current_price is valid
      if (currentPrice <= 0) {
        this.logger.warn('Computed current_price is zero or negative, using priceBeforeBonus', {
          context: { 
            productId: id, 
            priceBeforeBonus,
            computedCurrentPrice: currentPrice,
            originalCurrentPrice: product.currentPrice,
            isPromotion,
            promotionMechanism
          }
        });
        currentPrice = priceBeforeBonus; // Fallback to original price
      }

      // Extract unit price information if available
      let unitPrice: number | undefined;
      let unitPriceUnit: string | undefined;

      if (product.unitPriceDescription) {
        const unitPriceInfo = this.parseUnitPriceDescription(product.unitPriceDescription);
        unitPrice = unitPriceInfo.price;
        unitPriceUnit = unitPriceInfo.unit;
      }

      this.logger.debug('Successfully transformed AH product', {
        context: {
          productId: id,
          title,
          shopType: 'AH',
          hasPromotion: isPromotion
        }
      });


      // Calculate discount information
      let discountAbsolute: number | undefined;
      let discountPercentage: number | undefined;

      if (isPromotion && priceBeforeBonus > 0 && currentPrice < priceBeforeBonus) {
        discountAbsolute = priceBeforeBonus - currentPrice;
        discountPercentage = (discountAbsolute / priceBeforeBonus) * 100;
      }

      // Extract promotion parsing data if available
      let parsedPromotionData = {
        effectiveUnitPrice: isPromotion ? currentPrice : undefined,
        requiredQuantity: undefined as number | undefined,
        totalPrice: undefined as number | undefined,
        isMultiPurchaseRequired: false
      };

      // Parse discount labels for promotion details
      if (isPromotion && product.discountLabels && product.discountLabels.length > 0) {
        const label = product.discountLabels[0]; // Use primary label
        if (label.count && label.count > 1) {
          parsedPromotionData.requiredQuantity = label.count;
          parsedPromotionData.isMultiPurchaseRequired = true;
        }
        if (label.price && label.count) {
          parsedPromotionData.totalPrice = label.price;
        }
      }
      // Use the complete structure template to ensure all fields are present
      return createProductTemplate({
        // Core Product Identification
        unified_id: id,
        shop_type: 'AH',
        title: title,
        main_category: mainCategory,

        // Brand & Media  
        brand: brand,
        image_url: imageURL,

        // Physical Product Information
        sales_unit_size: salesUnitSize,

        // Quantity Information
        quantity_amount: quantity.amount,
        quantity_unit: quantity.unit,
        default_quantity_amount: 1, // AH default quantity is typically 1
        default_quantity_unit: quantity.unit,

        // Price Information
        price_before_bonus: priceBeforeBonus,
        current_price: currentPrice,
        unit_price: unitPrice,
        unit_price_unit: unitPriceUnit,

        // Promotion Information
        is_promotion: isPromotion,
        promotion_type: promotionType,
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
        price_per_standard_unit: unitPrice,
        current_price_per_standard_unit: unitPrice, // Will be calculated by calculateFields

        // Discount Information
        discount_absolute: discountAbsolute,
        discount_percentage: discountPercentage,

        // Availability
        is_active: product.orderAvailabilityStatus === 'IN_ASSORTMENT'
      });
    } catch (error) {
      throw new AHTransformError(
        error instanceof Error ? error.message : 'Unknown error during transformation',
        {
          id: product.webshopId?.toString() || 'unknown',
          availableFields: Object.keys(product),
          missingFields: []
        }
      );
    }
  }

  private parseQuantity(salesUnitSize: string): { amount: number; unit: string } {
    if (!salesUnitSize) {
      return { amount: 1, unit: 'stuk' };
    }

    const match = salesUnitSize.match(/(\d+(?:[.,]\d+)?)\s*(\w+)/);
    if (match) {
      const [, amount, unit] = match;
      return {
        amount: parseFloat(amount.replace(',', '.')),
        unit: normalizeUnit(unit)
      };
    }

    // Handle "stuks" case
    const piecesMatch = salesUnitSize.match(/(\d+)\s+stuks?/i);
    if (piecesMatch) {
      return {
        amount: parseInt(piecesMatch[1], 10),
        unit: 'stuk'
      };
    }

    return { amount: 1, unit: 'stuk' };
  }

  private parseUnitPriceDescription(description: string): { price: number; unit: string } {
    // Example: "prijs per kg €3.98"
    if (!description) {
      return { price: 0, unit: '' };
    }

    // Extract price and unit from unit price description
    const match = description.match(/prijs per (\w+) €(\d+(?:[.,]\d+)?)/i);
    if (match) {
      const [, unit, price] = match;
      return {
        price: parseFloat(price.replace(',', '.')),
        unit: normalizeUnit(unit)
      };
    }

    return { price: 0, unit: '' };
  }
}

// Standalone function for use in tests
export function shouldSkipProduct(product: AHProduct): boolean {
  if (!product) return true;

  if (product.isVirtualBundle) {
    return true;
  }

  if (product.orderAvailabilityStatus !== 'IN_ASSORTMENT') {
    return true;
  }

  // Skip "AH Voordeelshop" products as they don't fit the target application
  if (product.mainCategory === 'AH Voordeelshop') {
    return true;
  }

  // Skip bundle products without individual pricing information
  // These are typically meal kits, multi-packs, etc. that don't have individual item prices
  if (!product.priceBeforeBonus && !product.currentPrice) {
    return true;
  }

  return false;
}

export function transformAHProduct(product: AHProduct): UnifiedProduct {
  const processor = new AHProcessor({
    inputDir: '',
    outputDir: '',
    inputFile: '',
    batchSize: 100,
    parallelProcessing: false
  });

  return processor['transformProduct'](product);
}