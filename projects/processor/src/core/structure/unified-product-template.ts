/**
 * Unified Product Structure Template - Foundation for all processors
 * 
 * CRITICAL REQUIREMENT: All processors MUST output this EXACT structure.
 * No fields can be omitted - null is allowed for optional fields, but missing fields are NOT allowed.
 * 
 * This module ensures 100% structure compliance across all shop processors.
 */

// The DEFINITIVE list of required fields that every processor must output
export const REQUIRED_FIELDS = [
  'unified_id', 'shop_type', 'title', 'main_category', 'brand', 'image_url', 'sales_unit_size',
  'quantity_amount', 'quantity_unit', 'default_quantity_amount', 'default_quantity_unit',
  'price_before_bonus', 'current_price', 'unit_price', 'unit_price_unit',
  'is_promotion', 'promotion_type', 'promotion_mechanism', 'promotion_start_date', 'promotion_end_date',
  'parsed_promotion_effective_unit_price', 'parsed_promotion_required_quantity', 
  'parsed_promotion_total_price', 'parsed_promotion_is_multi_purchase_required',
  'normalized_quantity_amount', 'normalized_quantity_unit', 'conversion_factor',
  'price_per_standard_unit', 'current_price_per_standard_unit',
  'discount_absolute', 'discount_percentage', 'is_active'
] as const;

export type RequiredField = typeof REQUIRED_FIELDS[number];

/**
 * The DEFINITIVE structure template that all processors must follow.
 * This interface enforces the complete field set - no omissions allowed.
 */
export interface UnifiedProductTemplate {
  // === Core Product Identification === (4 fields)
  /** Unique identifier for the product across all shops - REQUIRED */
  unified_id: string;
  /** Shop type identifier (ah, jumbo, aldi, plus, etc.) - REQUIRED */
  shop_type: string;
  /** Product title/name - REQUIRED */
  title: string;
  /** Main product category - OPTIONAL (null allowed) */
  main_category: string | null;

  // === Brand & Media === (2 fields)  
  /** Product brand name - REQUIRED */
  brand: string;
  /** Product image URL - REQUIRED (empty string if none) */
  image_url: string;

  // === Physical Product Information === (1 field)
  /** Sales unit size description (e.g., "500ml", "1kg") - REQUIRED */
  sales_unit_size: string;

  // === Quantity Information === (4 fields)
  /** Base quantity amount - REQUIRED */
  quantity_amount: number;
  /** Base quantity unit - REQUIRED */
  quantity_unit: string;
  /** Default quantity amount for ordering - OPTIONAL */
  default_quantity_amount?: number;
  /** Default quantity unit for ordering - OPTIONAL */
  default_quantity_unit?: string;

  // === Price Information === (4 fields)
  /** Original price before any discounts - REQUIRED */
  price_before_bonus: number;
  /** Current selling price (after discounts) - REQUIRED */
  current_price: number;
  /** Unit price value - OPTIONAL */
  unit_price?: number;
  /** Unit price unit - OPTIONAL */
  unit_price_unit?: string;

  // === Promotion Information === (5 fields)
  /** Whether product is currently on promotion - REQUIRED */
  is_promotion: boolean;
  /** Type of promotion (discount, bonus, etc.) - REQUIRED */
  promotion_type: string;
  /** Promotion mechanism description - REQUIRED */
  promotion_mechanism: string;
  /** Promotion start date (ISO string) - OPTIONAL */
  promotion_start_date: string | null;
  /** Promotion end date (ISO string) - OPTIONAL */
  promotion_end_date: string | null;

  // === Parsed Promotion Details === (4 fields)
  /** Calculated effective unit price with promotion - OPTIONAL */
  parsed_promotion_effective_unit_price?: number;
  /** Required quantity for promotion - OPTIONAL */
  parsed_promotion_required_quantity?: number;
  /** Total price with promotion - OPTIONAL */
  parsed_promotion_total_price?: number;
  /** Whether promotion requires multiple purchase - OPTIONAL */
  parsed_promotion_is_multi_purchase_required?: boolean;

  // === Normalized Quantities === (3 fields)
  /** Normalized quantity amount for comparison - OPTIONAL */
  normalized_quantity_amount?: number;
  /** Normalized quantity unit for comparison - OPTIONAL */
  normalized_quantity_unit?: string;
  /** Conversion factor to standard units - OPTIONAL */
  conversion_factor?: number;

  // === Standard Unit Pricing === (2 fields)
  /** Price per standard unit (original) - OPTIONAL */
  price_per_standard_unit?: number;
  /** Current price per standard unit (with discounts) - OPTIONAL */
  current_price_per_standard_unit?: number;

  // === Discount Information === (2 fields)
  /** Absolute discount amount - OPTIONAL */
  discount_absolute?: number;
  /** Percentage discount - OPTIONAL */
  discount_percentage?: number;

  // === Availability === (1 field)
  /** Whether product is currently available - REQUIRED */
  is_active: boolean;
}

/**
 * Validation result for structure compliance
 */
export interface ValidationResult {
  /** Whether the structure is fully compliant */
  isValid: boolean;
  /** List of missing required fields */
  missingFields: string[];
  /** List of extra fields not in template */
  extraFields: string[];
  /** List of fields with incorrect types */
  typeErrors: Array<{ field: string; expected: string; actual: string }>;
  /** Overall compliance score (0-1) */
  complianceScore: number;
}

/**
 * Structure drift detection report
 */
export interface DriftReport {
  /** Total products analyzed */
  totalProducts: number;
  /** Products with missing fields */
  productsWithMissingFields: number;
  /** Products with extra fields */
  productsWithExtraFields: number;
  /** Field presence statistics */
  fieldPresenceStats: Record<string, {
    present: number;
    missing: number;
    presenceRate: number;
  }>;
  /** Most common structural issues */
  commonIssues: Array<{
    issue: string;
    count: number;
    percentage: number;
  }>;
}

/**
 * Creates a template product with all required fields initialized
 * Use this as the base for all processor outputs
 */
export function createProductTemplate(baseData: Partial<UnifiedProductTemplate> = {}): UnifiedProductTemplate {
  const template: UnifiedProductTemplate = {
    // Core Product Identification - defaults
    unified_id: baseData.unified_id || '',
    shop_type: baseData.shop_type || '',
    title: baseData.title || '',
    main_category: baseData.main_category || null,

    // Brand & Media - defaults  
    brand: baseData.brand || '',
    image_url: baseData.image_url || '',

    // Physical Product Information - defaults
    sales_unit_size: baseData.sales_unit_size || '',

    // Quantity Information - defaults
    quantity_amount: baseData.quantity_amount || 0,
    quantity_unit: baseData.quantity_unit || '',
    default_quantity_amount: baseData.default_quantity_amount,
    default_quantity_unit: baseData.default_quantity_unit,

    // Price Information - defaults
    price_before_bonus: baseData.price_before_bonus || 0,
    current_price: baseData.current_price || 0,
    unit_price: baseData.unit_price,
    unit_price_unit: baseData.unit_price_unit,

    // Promotion Information - defaults
    is_promotion: baseData.is_promotion || false,
    promotion_type: baseData.promotion_type || 'none',
    promotion_mechanism: baseData.promotion_mechanism || 'none',
    promotion_start_date: baseData.promotion_start_date || null,
    promotion_end_date: baseData.promotion_end_date || null,

    // Parsed Promotion Details - defaults
    parsed_promotion_effective_unit_price: baseData.parsed_promotion_effective_unit_price,
    parsed_promotion_required_quantity: baseData.parsed_promotion_required_quantity,
    parsed_promotion_total_price: baseData.parsed_promotion_total_price,
    parsed_promotion_is_multi_purchase_required: baseData.parsed_promotion_is_multi_purchase_required,

    // Normalized Quantities - defaults
    normalized_quantity_amount: baseData.normalized_quantity_amount,
    normalized_quantity_unit: baseData.normalized_quantity_unit,
    conversion_factor: baseData.conversion_factor,

    // Standard Unit Pricing - defaults
    price_per_standard_unit: baseData.price_per_standard_unit,
    current_price_per_standard_unit: baseData.current_price_per_standard_unit,

    // Discount Information - defaults
    discount_absolute: baseData.discount_absolute,
    discount_percentage: baseData.discount_percentage,

    // Availability - defaults
    is_active: baseData.is_active !== undefined ? baseData.is_active : true
  };

  return template;
}

/**
 * Ensures a product object has all required fields
 * Missing fields are added with appropriate default values
 */
export function ensureCompleteStructure(product: any): UnifiedProductTemplate {
  if (!product || typeof product !== 'object') {
    throw new Error('Product must be an object');
  }

  return createProductTemplate(product);
}

/**
 * Type guard to check if an object conforms to UnifiedProductTemplate
 */
export function isUnifiedProductTemplate(obj: any): obj is UnifiedProductTemplate {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  // Check that all required fields are present
  for (const field of REQUIRED_FIELDS) {
    if (!(field in obj)) {
      return false;
    }
  }

  return true;
}

/**
 * Gets the complete field list for validation
 */
export function getRequiredFields(): readonly string[] {
  return REQUIRED_FIELDS;
}

/**
 * Counts the total number of required fields
 */
export function getRequiredFieldCount(): number {
  return REQUIRED_FIELDS.length;
}