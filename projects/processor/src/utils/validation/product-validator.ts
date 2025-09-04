// src/utils/validation/product-validator.ts
import { UnifiedProduct } from '../../types';
import { getLogger } from '../../infrastructure/logging';

export interface ValidationRule {
  name: string;
  description: string;
  validate: (product: UnifiedProduct) => boolean;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationResult {
  productId: string;
  shopType: string;
  passed: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  infos: ValidationIssue[];
}

export interface ValidationIssue {
  rule: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationSummary {
  totalValidated: number;
  passed: number;
  withErrors: number;
  withWarnings: number;
  withInfos: number;
  issuesByType: Record<string, number>;
  issuesByShop: Record<string, Record<string, number>>;
}

/**
 * Validates product data quality
 */
export class ProductValidator {
  private readonly logger = getLogger();
  private readonly rules: ValidationRule[] = [];

  constructor() {
    this.initializeRules();
  }

  /**
   * Initialize the validation rules
   */
  private initializeRules(): void {
    // Required fields
    this.rules.push({
      name: 'required-id',
      description: 'Product must have a valid ID',
      validate: (product) => !!product.unified_id && product.unified_id.trim() !== '',
      severity: 'error'
    });

    this.rules.push({
      name: 'required-title',
      description: 'Product must have a valid title',
      validate: (product) => !!product.title && product.title.trim() !== '',
      severity: 'error'
    });

    this.rules.push({
      name: 'required-shoptype',
      description: 'Product must have a valid shop type',
      validate: (product) => !!product.shop_type && ['AH', 'JUMBO', 'ALDI', 'PLUS'].includes(product.shop_type),
      severity: 'error'
    });

    // Price consistency
    this.rules.push({
      name: 'valid-price',
      description: 'Product must have a valid price (greater than 0)',
      validate: (product) => product.price_before_bonus > 0,
      severity: 'error'
    });

    this.rules.push({
      name: 'price-consistency',
      description: 'Current price should be consistent with the promotion status',
      validate: (product) => {
        if (product.is_promotion) {
          // If it's a promotion, current price should be different from priceBeforeBonus
          return product.current_price !== product.price_before_bonus;
        } else {
          // If it's not a promotion, current price should equal priceBeforeBonus
          return product.current_price === product.price_before_bonus;
        }
      },
      severity: 'warning'
    });

    // Promotion consistency
    this.rules.push({
      name: 'promotion-consistency',
      description: 'Promotion fields should be consistent with isPromotion flag',
      validate: (product) => {
        if (product.is_promotion) {
          // If it's a promotion, it should have promotionType and promotionMechanism
          return !!product.promotion_type && !!product.promotion_mechanism;
        } else {
          // If it's not a promotion, it should not have promotion fields
          return !product.promotion_type && !product.promotion_mechanism && 
                 !product.promotion_start_date && !product.promotion_end_date;
        }
      },
      severity: 'warning'
    });

    // Date validation for promotions
    this.rules.push({
      name: 'promotion-dates',
      description: 'Promotion start date should be before end date',
      validate: (product) => {
        if (product.is_promotion && product.promotion_start_date && product.promotion_end_date) {
          return new Date(product.promotion_start_date) <= new Date(product.promotion_end_date);
        }
        return true;
      },
      severity: 'warning'
    });

    // Quantity validation
    this.rules.push({
      name: 'valid-quantity',
      description: 'Product must have valid quantity information',
      validate: (product) => 
        typeof product.quantity_amount === 'number' && 
        product.quantity_amount > 0 &&
        !!product.quantity_unit,
      severity: 'error'
    });

    // Category validation
    this.rules.push({
      name: 'valid-category',
      description: 'Product should have a category',
      validate: (product) => !!product.main_category && product.main_category.trim() !== '',
      severity: 'warning'
    });

    // Image URL validation
    this.rules.push({
      name: 'valid-image-url',
      description: 'Product should have a valid image URL',
      validate: (product) => !!product.image_url && product.image_url.startsWith('http'),
      severity: 'info'
    });

    // Unit price consistency
    this.rules.push({
      name: 'unit-price-consistency',
      description: 'Unit price should be consistent with the price and quantity',
      validate: (product) => {
        if (!product.unit_price) return true; // No unit price is fine
        
        const { unit_price, quantity_amount, quantity_unit, price_before_bonus, unit_price_unit } = product;
        
        // Ensure necessary fields exist for comparison
        if (!quantity_amount || !quantity_unit || !price_before_bonus || !unit_price_unit) return false;
        
        // Skip for non-weight/volume units where comparison might not make sense
        if (quantity_unit === 'stuk' || unit_price_unit === 'stuk') return true;
        
        // Perform basic consistency check
        // For example, if price is €2 for 500g, unit price should be approximately €4 per kg
        
        const ratio = this.convertToBaseUnit(quantity_amount, quantity_unit) / 
                      this.convertToBaseUnit(1, unit_price_unit);
        
        // Avoid division by zero or invalid ratios
        if (ratio <= 0 || !isFinite(ratio)) return false;
                      
        const calculatedUnitPrice = price_before_bonus / ratio;
        
        // Allow 10% tolerance for rounding differences
        const tolerance = 0.1;
        const lowerBound = unit_price * (1 - tolerance);
        const upperBound = unit_price * (1 + tolerance);
        
        return calculatedUnitPrice >= lowerBound && calculatedUnitPrice <= upperBound;
      },
      severity: 'info'
    });
  }

  /**
   * Convert a quantity to a base unit for comparison
   */
  private convertToBaseUnit(amount: number, unit: string): number {
    switch (unit.toLowerCase()) {
      case 'kg':
        return amount * 1000; // 1 kg = 1000 g
      case 'g':
        return amount;
      case 'l':
        return amount * 1000; // 1 l = 1000 ml
      case 'ml':
        return amount;
      default:
        return amount;
    }
  }

  /**
   * Validate a single product
   */
  public validateProduct(product: UnifiedProduct): ValidationResult {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];
    const infos: ValidationIssue[] = [];

    // Run all validation rules
    for (const rule of this.rules) {
      const isValid = rule.validate(product);
      
      if (!isValid) {
        const issue: ValidationIssue = {
          rule: rule.name,
          description: rule.description,
          severity: rule.severity
        };

        if (rule.severity === 'error') {
          errors.push(issue);
        } else if (rule.severity === 'warning') {
          warnings.push(issue);
        } else {
          infos.push(issue);
        }
      }
    }

    return {
      productId: product.unified_id,
      shopType: product.shop_type,
      passed: errors.length === 0,
      errors,
      warnings,
      infos
    };
  }

  /**
   * Validate a batch of products
   */
  public validateProducts(products: UnifiedProduct[]): ValidationResult[] {
    return products.map(product => this.validateProduct(product));
  }

  /**
   * Generate a summary of validation results
   */
  public generateSummary(results: ValidationResult[]): ValidationSummary {
    const summary: ValidationSummary = {
      totalValidated: results.length,
      passed: 0,
      withErrors: 0,
      withWarnings: 0,
      withInfos: 0,
      issuesByType: {},
      issuesByShop: {}
    };

    // Initialize shop counters
    const shopTypes = ['AH', 'JUMBO', 'ALDI', 'PLUS'];
    for (const shopType of shopTypes) {
      summary.issuesByShop[shopType] = {};
    }

    // Process validation results
    for (const result of results) {
      if (result.passed) {
        summary.passed++;
      }
      
      if (result.errors.length > 0) {
        summary.withErrors++;
      }
      
      if (result.warnings.length > 0) {
        summary.withWarnings++;
      }
      
      if (result.infos.length > 0) {
        summary.withInfos++;
      }

      // Count issues by type
      [...result.errors, ...result.warnings, ...result.infos].forEach(issue => {
        summary.issuesByType[issue.rule] = (summary.issuesByType[issue.rule] || 0) + 1;
        
        if (summary.issuesByShop[result.shopType]) {
          summary.issuesByShop[result.shopType][issue.rule] = 
            (summary.issuesByShop[result.shopType][issue.rule] || 0) + 1;
        }
      });
    }

    return summary;
  }

  /**
   * Generate a comprehensive validation report
   */
  public async generateReport(results: ValidationResult[]): Promise<string> {
    const summary = this.generateSummary(results);
    
    const report = [
      '# Product Data Quality Report',
      `Generated: ${new Date().toISOString()}`,
      '',
      '## Summary',
      `- Total products validated: ${summary.totalValidated}`,
      `- Products with no errors: ${summary.passed} (${(summary.passed / summary.totalValidated * 100).toFixed(2)}%)`,
      `- Products with errors: ${summary.withErrors} (${(summary.withErrors / summary.totalValidated * 100).toFixed(2)}%)`,
      `- Products with warnings: ${summary.withWarnings} (${(summary.withWarnings / summary.totalValidated * 100).toFixed(2)}%)`,
      `- Products with info issues: ${summary.withInfos} (${(summary.withInfos / summary.totalValidated * 100).toFixed(2)}%)`,
      '',
      '## Issues by Type',
      ...Object.entries(summary.issuesByType)
        .sort((a, b) => b[1] - a[1])
        .map(([rule, count]) => `- ${rule}: ${count} (${(count / summary.totalValidated * 100).toFixed(2)}%)`),
      '',
      '## Issues by Shop'
    ];

    // Add shop-specific information
    for (const shopType of Object.keys(summary.issuesByShop)) {
      const shopIssues = summary.issuesByShop[shopType];
      const issueCount = Object.values(shopIssues).reduce((sum, count) => sum + count, 0);
      const shopProductCount = results.filter(r => r.shopType === shopType).length;
      
      report.push(`### ${shopType}`);
      report.push(`- Total products: ${shopProductCount}`);
      report.push(`- Total issues: ${issueCount}`);
      
      if (Object.keys(shopIssues).length > 0) {
        report.push('- Issues breakdown:');
        
        Object.entries(shopIssues)
          .sort((a, b) => b[1] - a[1])
          .forEach(([rule, count]) => {
            report.push(`  - ${rule}: ${count} (${(count / shopProductCount * 100).toFixed(2)}%)`);
          });
      } else {
        report.push('- No issues found');
      }
      
      report.push('');
    }

    // Add sample issues
    report.push('## Sample Issues');
    
    // Find examples of each issue type
    const issueExamples = new Map<string, ValidationResult>();
    
    for (const result of results) {
      const allIssues = [...result.errors, ...result.warnings, ...result.infos];
      
      for (const issue of allIssues) {
        if (!issueExamples.has(issue.rule)) {
          issueExamples.set(issue.rule, result);
        }
      }
    }
    
    for (const [rule, result] of issueExamples.entries()) {
      report.push(`### ${rule}`);
      report.push(`- Product ID: ${result.productId}`);
      report.push(`- Shop: ${result.shopType}`);
      report.push(`- Severity: ${result.errors.find(e => e.rule === rule)?.severity || 
                                result.warnings.find(w => w.rule === rule)?.severity || 
                                result.infos.find(i => i.rule === rule)?.severity}`);
      report.push('');
    }

    return report.join('\n');
  }
}

// Export singleton instance
export const productValidator = new ProductValidator();

// Example usage:
// const results = productValidator.validateProducts(unifiedProducts);
// const summary = productValidator.generateSummary(results);
// await productValidator.generateReport(results);