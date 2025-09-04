/**
 * Structure Validator - Ensures 100% compliance with UnifiedProductTemplate
 * 
 * This validator enforces that ALL processors output the exact required structure
 * with zero tolerance for missing fields or structural drift.
 */

import {
  UnifiedProductTemplate,
  ValidationResult,
  DriftReport,
  REQUIRED_FIELDS,
  RequiredField,
  createProductTemplate,
  isUnifiedProductTemplate
} from './unified-product-template';

export interface StructureValidationOptions {
  /** Whether to allow extra fields not in template (default: false) */
  allowExtraFields?: boolean;
  /** Whether to perform deep type validation (default: true) */
  validateTypes?: boolean;
  /** Whether to validate field values (not just presence) (default: false) */
  validateValues?: boolean;
}

export interface FieldTypeDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'string|null' | 'number?' | 'string?' | 'boolean?';
  required: boolean;
  description: string;
}

/**
 * Comprehensive structure validator for UnifiedProduct compliance
 */
export class StructureValidator {
  private readonly fieldDefinitions: Map<string, FieldTypeDefinition>;

  constructor() {
    this.fieldDefinitions = this.initializeFieldDefinitions();
  }

  /**
   * Validates complete structure compliance for a single product
   */
  public validateCompleteStructure(
    product: any,
    options: StructureValidationOptions = {}
  ): ValidationResult {
    const opts = {
      allowExtraFields: false,
      validateTypes: true,
      validateValues: false,
      ...options
    };

    const result: ValidationResult = {
      isValid: true,
      missingFields: [],
      extraFields: [],
      typeErrors: [],
      complianceScore: 0
    };

    if (!product || typeof product !== 'object') {
      result.isValid = false;
      result.complianceScore = 0;
      result.missingFields = [...REQUIRED_FIELDS];
      return result;
    }

    // Check for missing required fields
    for (const field of REQUIRED_FIELDS) {
      if (!(field in product)) {
        result.missingFields.push(field);
        result.isValid = false;
      }
    }

    // Check for extra fields (if not allowed)
    if (!opts.allowExtraFields) {
      const productFields = Object.keys(product);
      const requiredFieldsSet = new Set(REQUIRED_FIELDS); // Convert to Set for O(1) lookup
      for (const field of productFields) {
        if (!requiredFieldsSet.has(field as RequiredField)) {
          result.extraFields.push(field);
          result.isValid = false;
        }
      }
    }

    // Type validation
    if (opts.validateTypes) {
      this.validateFieldTypes(product, result);
    }

    // Calculate compliance score
    const totalFields = REQUIRED_FIELDS.length;
    const presentFields = totalFields - result.missingFields.length;
    const typeErrors = result.typeErrors.length;
    result.complianceScore = Math.max(0, (presentFields - typeErrors) / totalFields);

    return result;
  }

  /**
   * Ensures all required fields are present - adds missing fields with defaults
   */
  public ensureAllFieldsPresent(product: any): UnifiedProductTemplate {
    if (!product || typeof product !== 'object') {
      throw new Error('Product must be an object');
    }

    return createProductTemplate(product);
  }

  /**
   * Detects structural drift across multiple products
   */
  public detectStructureDrift(products: any[]): DriftReport {
    const report: DriftReport = {
      totalProducts: products.length,
      productsWithMissingFields: 0,
      productsWithExtraFields: 0,
      fieldPresenceStats: {},
      commonIssues: []
    };

    if (products.length === 0) {
      return report;
    }

    // Initialize field presence stats
    for (const field of REQUIRED_FIELDS) {
      report.fieldPresenceStats[field] = {
        present: 0,
        missing: 0,
        presenceRate: 0
      };
    }

    const issueCount = new Map<string, number>();

    // Analyze each product
    for (const product of products) {
      const validation = this.validateCompleteStructure(product, { allowExtraFields: true });
      const extraFieldValidation = this.validateCompleteStructure(product, { allowExtraFields: false });

      if (validation.missingFields.length > 0) {
        report.productsWithMissingFields++;
      }

      if (extraFieldValidation.extraFields.length > 0) {
        report.productsWithExtraFields++;
      }

      // Track field presence
      for (const field of REQUIRED_FIELDS) {
        const stats = report.fieldPresenceStats[field];
        if (field in product) {
          stats.present++;
        } else {
          stats.missing++;
        }
      }

      // Track common issues
      for (const missingField of validation.missingFields) {
        const issue = `Missing field: ${missingField}`;
        issueCount.set(issue, (issueCount.get(issue) || 0) + 1);
      }

      for (const extraField of extraFieldValidation.extraFields) {
        const issue = `Extra field: ${extraField}`;
        issueCount.set(issue, (issueCount.get(issue) || 0) + 1);
      }

      for (const typeError of validation.typeErrors) {
        const issue = `Type error in ${typeError.field}: expected ${typeError.expected}, got ${typeError.actual}`;
        issueCount.set(issue, (issueCount.get(issue) || 0) + 1);
      }
    }

    // Calculate presence rates
    for (const field of REQUIRED_FIELDS) {
      const stats = report.fieldPresenceStats[field];
      stats.presenceRate = stats.present / products.length;
    }

    // Sort and format common issues
    report.commonIssues = Array.from(issueCount.entries())
      .map(([issue, count]) => ({
        issue,
        count,
        percentage: (count / products.length) * 100
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 issues

    return report;
  }

  /**
   * Validates that all products in a batch have identical structure
   */

  /**
   * Validates field types against expected types
   */
  private validateFieldTypes(product: any, result: ValidationResult): void {
    for (const [fieldName, fieldDef] of this.fieldDefinitions.entries()) {
      if (fieldName in product) {
        const value = product[fieldName];
        const expectedType = fieldDef.type;
        const actualType = this.getActualType(value);

        if (!this.isTypeCompatible(actualType, expectedType)) {
          result.typeErrors.push({
            field: fieldName,
            expected: expectedType,
            actual: actualType
          });
          result.isValid = false;
        }
      }
    }
  }

  /**
   * Gets the actual type of a value
   */
  private getActualType(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  /**
   * Checks if an actual type is compatible with expected type
   */
  private isTypeCompatible(actual: string, expected: string): boolean {
    switch (expected) {
      case 'string':
        return actual === 'string';
      case 'number':
        return actual === 'number';
      case 'boolean':
        return actual === 'boolean';
      case 'string|null':
        return actual === 'string' || actual === 'null';
      case 'number?':
        return actual === 'number' || actual === 'undefined';
      case 'string?':
        return actual === 'string' || actual === 'undefined';
      case 'boolean?':
        return actual === 'boolean' || actual === 'undefined';
      default:
        return false;
    }
  }

  /**
   * Initialize field type definitions for validation
   */
  private initializeFieldDefinitions(): Map<string, FieldTypeDefinition> {
    const definitions = new Map<string, FieldTypeDefinition>();

    // Core Product Identification
    definitions.set('unified_id', { name: 'unified_id', type: 'string', required: true, description: 'Unique product identifier' });
    definitions.set('shop_type', { name: 'shop_type', type: 'string', required: true, description: 'Shop type identifier' });
    definitions.set('title', { name: 'title', type: 'string', required: true, description: 'Product title' });
    definitions.set('main_category', { name: 'main_category', type: 'string|null', required: true, description: 'Main category' });

    // Brand & Media
    definitions.set('brand', { name: 'brand', type: 'string', required: true, description: 'Brand name' });
    definitions.set('image_url', { name: 'image_url', type: 'string', required: true, description: 'Image URL' });

    // Physical Product
    definitions.set('sales_unit_size', { name: 'sales_unit_size', type: 'string', required: true, description: 'Sales unit size' });

    // Quantity Information
    definitions.set('quantity_amount', { name: 'quantity_amount', type: 'number', required: true, description: 'Quantity amount' });
    definitions.set('quantity_unit', { name: 'quantity_unit', type: 'string', required: true, description: 'Quantity unit' });
    definitions.set('default_quantity_amount', { name: 'default_quantity_amount', type: 'number?', required: false, description: 'Default quantity amount' });
    definitions.set('default_quantity_unit', { name: 'default_quantity_unit', type: 'string?', required: false, description: 'Default quantity unit' });

    // Price Information
    definitions.set('price_before_bonus', { name: 'price_before_bonus', type: 'number', required: true, description: 'Original price' });
    definitions.set('current_price', { name: 'current_price', type: 'number', required: true, description: 'Current price' });
    definitions.set('unit_price', { name: 'unit_price', type: 'number?', required: false, description: 'Unit price' });
    definitions.set('unit_price_unit', { name: 'unit_price_unit', type: 'string?', required: false, description: 'Unit price unit' });

    // Promotion Information
    definitions.set('is_promotion', { name: 'is_promotion', type: 'boolean', required: true, description: 'Is promotion active' });
    definitions.set('promotion_type', { name: 'promotion_type', type: 'string', required: true, description: 'Promotion type' });
    definitions.set('promotion_mechanism', { name: 'promotion_mechanism', type: 'string', required: true, description: 'Promotion mechanism' });
    definitions.set('promotion_start_date', { name: 'promotion_start_date', type: 'string|null', required: true, description: 'Promotion start date' });
    definitions.set('promotion_end_date', { name: 'promotion_end_date', type: 'string|null', required: true, description: 'Promotion end date' });

    // Parsed Promotion Details
    definitions.set('parsed_promotion_effective_unit_price', { name: 'parsed_promotion_effective_unit_price', type: 'number?', required: false, description: 'Effective unit price' });
    definitions.set('parsed_promotion_required_quantity', { name: 'parsed_promotion_required_quantity', type: 'number?', required: false, description: 'Required quantity' });
    definitions.set('parsed_promotion_total_price', { name: 'parsed_promotion_total_price', type: 'number?', required: false, description: 'Total promotion price' });
    definitions.set('parsed_promotion_is_multi_purchase_required', { name: 'parsed_promotion_is_multi_purchase_required', type: 'boolean?', required: false, description: 'Multi-purchase required' });

    // Normalized Quantities
    definitions.set('normalized_quantity_amount', { name: 'normalized_quantity_amount', type: 'number?', required: false, description: 'Normalized quantity amount' });
    definitions.set('normalized_quantity_unit', { name: 'normalized_quantity_unit', type: 'string?', required: false, description: 'Normalized quantity unit' });
    definitions.set('conversion_factor', { name: 'conversion_factor', type: 'number?', required: false, description: 'Unit conversion factor' });

    // Standard Unit Pricing
    definitions.set('price_per_standard_unit', { name: 'price_per_standard_unit', type: 'number?', required: false, description: 'Price per standard unit' });
    definitions.set('current_price_per_standard_unit', { name: 'current_price_per_standard_unit', type: 'number?', required: false, description: 'Current price per standard unit' });

    // Discount Information
    definitions.set('discount_absolute', { name: 'discount_absolute', type: 'number?', required: false, description: 'Absolute discount amount' });
    definitions.set('discount_percentage', { name: 'discount_percentage', type: 'number?', required: false, description: 'Discount percentage' });

    // Availability
    definitions.set('is_active', { name: 'is_active', type: 'boolean', required: true, description: 'Is product active' });

    return definitions;
  }

  /**
   * Validates that all products in a batch have consistent structure
   */
  public validateBatchStructureConsistency(products: any[]): {
    isConsistent: boolean;
    totalProducts: number;
    fullyCompliant: number;
    complianceRate: number;
    averageScore: number;
    criticalIssues: number;
    structuralDrift: DriftReport;
  } {
    const drift = this.detectStructureDrift(products);
    const metrics = this.getComplianceMetrics(products);
    
    return {
      isConsistent: drift.productsWithMissingFields === 0 && drift.productsWithExtraFields === 0,
      ...metrics,
      structuralDrift: drift
    };
  }

  /**
   * Get structure compliance metrics for monitoring
   */
  public getComplianceMetrics(products: any[]): {
    totalProducts: number;
    fullyCompliant: number;
    complianceRate: number;
    averageScore: number;
    criticalIssues: number;
  } {
    if (products.length === 0) {
      return {
        totalProducts: 0,
        fullyCompliant: 0,
        complianceRate: 1,
        averageScore: 1,
        criticalIssues: 0
      };
    }

    let fullyCompliant = 0;
    let totalScore = 0;
    let criticalIssues = 0;

    for (const product of products) {
      const validation = this.validateCompleteStructure(product);
      
      if (validation.isValid) {
        fullyCompliant++;
      }

      totalScore += validation.complianceScore;

      // Critical issues: missing required fields
      if (validation.missingFields.length > 0) {
        criticalIssues++;
      }
    }

    return {
      totalProducts: products.length,
      fullyCompliant,
      complianceRate: fullyCompliant / products.length,
      averageScore: totalScore / products.length,
      criticalIssues
    };
  }
}

// Singleton instance for global use
export const structureValidator = new StructureValidator();

// Convenience functions for common operations
export function validateProduct(product: any, options?: StructureValidationOptions): ValidationResult {
  return structureValidator.validateCompleteStructure(product, options);
}

export function ensureProductStructure(product: any): UnifiedProductTemplate {
  return structureValidator.ensureAllFieldsPresent(product);
}

export function detectDrift(products: any[]): DriftReport {
  return structureValidator.detectStructureDrift(products);
}

export function validateBatchConsistency(products: any[]) {
  return structureValidator.validateBatchStructureConsistency(products);
}