// src/types/product.ts

/**
 * Unified product model aligned with database schema
 */
export interface UnifiedProduct {
  // Base Product Data - maps directly to DB columns
  unified_id: string;
  shop_type: string;
  title: string;
  main_category: string | null;
  brand: string;
  image_url: string;
  sales_unit_size: string;
  
  // Quantity Information
  quantity_amount: number;
  quantity_unit: string;
  default_quantity_amount?: number;
  default_quantity_unit?: string;

  // Price Information  
  price_before_bonus: number;
  current_price: number;
  unit_price?: number;
  unit_price_unit?: string;

  // Promotion Information
  is_promotion: boolean;
  promotion_type: string;
  promotion_mechanism: string;
  promotion_start_date: string | null;
  promotion_end_date: string | null;
  
  // Parsed Promotion Fields
  parsed_promotion_effective_unit_price?: number;
  parsed_promotion_required_quantity?: number;
  parsed_promotion_total_price?: number;
  parsed_promotion_is_multi_purchase_required?: boolean;
  
  // Normalized Quantities and Conversion
  normalized_quantity_amount?: number;
  normalized_quantity_unit?: string;
  conversion_factor?: number;
  
  // Standard Unit Pricing
  price_per_standard_unit?: number;
  current_price_per_standard_unit?: number;
  
  // Discount Information
  discount_absolute?: number;
  discount_percentage?: number;
  
  // Availability
  is_active: boolean;
}

/**
 * Interface for the product statistics after processing
 */
export interface ProcessingResult {
  success: number;
  failed: number;
  skipped: number;
  deduped: number;
  errors: Array<{
    productId: string;
    error: string;
    details?: unknown;
  }>;
  shopType: string;
}

/**
 * Unit price structure
 */
export interface UnitPrice {
  unit: string;
  price: number;
}

/**
 * Quantity option structure
 */
export interface QuantityOption {
  unit: string;
  defaultAmount: number;
  minimumAmount?: number;
  maximumAmount?: number;
  amountStep?: number;
}

/**
 * Interface for the product statistics after processing
 */
export interface ProductStats {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  deduped: number;
  withPromotion: number;
  withoutPromotion: number;
  duration: number;
}

/**
 * Interface for category statistics
 */
export interface CategoryStats {
  categoryName: string;
  count: number;
  percentage: number;
  uniqueProducts: string[];
}