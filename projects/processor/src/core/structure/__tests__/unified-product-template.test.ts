/**
 * Test suite for UnifiedProductTemplate - Structure compliance validation
 * 
 * These tests ensure 100% structure compliance across all processors.
 * Following TDD approach - tests define the requirements.
 */

import {
  UnifiedProductTemplate,
  REQUIRED_FIELDS,
  createProductTemplate,
  ensureCompleteStructure,
  isUnifiedProductTemplate,
  getRequiredFields,
  getRequiredFieldCount
} from '../unified-product-template';

describe('UnifiedProductTemplate', () => {
  describe('REQUIRED_FIELDS constant', () => {
    it('should contain exactly 32 fields', () => {
      expect(REQUIRED_FIELDS).toHaveLength(32);
    });

    it('should contain all expected core fields', () => {
      const expectedFields = [
        'unified_id', 'shop_type', 'title', 'main_category', 'brand', 'image_url', 'sales_unit_size',
        'quantity_amount', 'quantity_unit', 'default_quantity_amount', 'default_quantity_unit',
        'price_before_bonus', 'current_price', 'unit_price', 'unit_price_unit',
        'is_promotion', 'promotion_type', 'promotion_mechanism', 'promotion_start_date', 'promotion_end_date',
        'parsed_promotion_effective_unit_price', 'parsed_promotion_required_quantity', 
        'parsed_promotion_total_price', 'parsed_promotion_is_multi_purchase_required',
        'normalized_quantity_amount', 'normalized_quantity_unit', 'conversion_factor',
        'price_per_standard_unit', 'current_price_per_standard_unit',
        'discount_absolute', 'discount_percentage', 'is_active'
      ];

      expectedFields.forEach(field => {
        expect(REQUIRED_FIELDS).toContain(field);
      });
    });

    it('should not contain duplicate fields', () => {
      const uniqueFields = [...new Set(REQUIRED_FIELDS)];
      expect(uniqueFields).toHaveLength(REQUIRED_FIELDS.length);
    });
  });

  describe('createProductTemplate', () => {
    it('should create a template with all required fields present', () => {
      const template = createProductTemplate();

      REQUIRED_FIELDS.forEach(field => {
        expect(template).toHaveProperty(field);
      });
    });

    it('should use provided base data when available', () => {
      const baseData = {
        unified_id: 'test-id',
        shop_type: 'ah',
        title: 'Test Product',
        current_price: 2.99
      };

      const template = createProductTemplate(baseData);

      expect(template.unified_id).toBe('test-id');
      expect(template.shop_type).toBe('ah');
      expect(template.title).toBe('Test Product');
      expect(template.current_price).toBe(2.99);
    });

    it('should set appropriate defaults for all fields', () => {
      const template = createProductTemplate();

      // String fields should have empty string defaults
      expect(template.unified_id).toBe('');
      expect(template.shop_type).toBe('');
      expect(template.title).toBe('');
      expect(template.brand).toBe('');
      expect(template.image_url).toBe('');
      expect(template.sales_unit_size).toBe('');
      expect(template.quantity_unit).toBe('');

      // Number fields should have zero defaults
      expect(template.quantity_amount).toBe(0);
      expect(template.price_before_bonus).toBe(0);
      expect(template.current_price).toBe(0);

      // Boolean fields should have appropriate defaults
      expect(template.is_promotion).toBe(false);
      expect(template.is_active).toBe(true);

      // Nullable fields should be null
      expect(template.main_category).toBeNull();
      expect(template.promotion_start_date).toBeNull();
      expect(template.promotion_end_date).toBeNull();
    });

    it('should handle partial data without missing fields', () => {
      const partialData = {
        title: 'Partial Product',
        current_price: 1.50
      };

      const template = createProductTemplate(partialData);

      // Provided fields should be used
      expect(template.title).toBe('Partial Product');
      expect(template.current_price).toBe(1.50);

      // All other fields should be present with defaults
      REQUIRED_FIELDS.forEach(field => {
        expect(template).toHaveProperty(field);
      });
    });
  });

  describe('ensureCompleteStructure', () => {
    it('should throw error for non-object input', () => {
      expect(() => ensureCompleteStructure(null)).toThrow('Product must be an object');
      expect(() => ensureCompleteStructure(undefined)).toThrow('Product must be an object');
      expect(() => ensureCompleteStructure('string')).toThrow('Product must be an object');
      expect(() => ensureCompleteStructure(123)).toThrow('Product must be an object');
    });

    it('should add missing fields to partial product', () => {
      const partialProduct = {
        unified_id: 'test-123',
        title: 'Incomplete Product'
      };

      const complete = ensureCompleteStructure(partialProduct);

      // All required fields should be present
      REQUIRED_FIELDS.forEach(field => {
        expect(complete).toHaveProperty(field);
      });

      // Original data should be preserved
      expect(complete.unified_id).toBe('test-123');
      expect(complete.title).toBe('Incomplete Product');
    });

    it('should preserve existing complete structure', () => {
      const completeProduct = createProductTemplate({
        unified_id: 'complete-123',
        shop_type: 'jumbo',
        title: 'Complete Product',
        current_price: 3.99
      });

      const result = ensureCompleteStructure(completeProduct);

      // Should be identical to input
      expect(result).toEqual(completeProduct);
    });
  });

  describe('isUnifiedProductTemplate', () => {
    it('should return true for valid template', () => {
      const validTemplate = createProductTemplate({
        unified_id: 'valid-123',
        shop_type: 'aldi',
        title: 'Valid Product'
      });

      expect(isUnifiedProductTemplate(validTemplate)).toBe(true);
    });

    it('should return false for incomplete objects', () => {
      const incompleteProduct = {
        unified_id: 'incomplete-123',
        title: 'Incomplete Product'
        // Missing many required fields
      };

      expect(isUnifiedProductTemplate(incompleteProduct)).toBe(false);
    });

    it('should return false for non-objects', () => {
      expect(isUnifiedProductTemplate(null)).toBe(false);
      expect(isUnifiedProductTemplate(undefined)).toBe(false);
      expect(isUnifiedProductTemplate('string')).toBe(false);
      expect(isUnifiedProductTemplate(123)).toBe(false);
      expect(isUnifiedProductTemplate([])).toBe(false);
    });

    it('should validate all required fields are present', () => {
      const templateWithMissingField = createProductTemplate();
      delete (templateWithMissingField as any).is_active;

      expect(isUnifiedProductTemplate(templateWithMissingField)).toBe(false);
    });
  });

  describe('utility functions', () => {
    it('getRequiredFields should return readonly array of fields', () => {
      const fields = getRequiredFields();
      
      expect(fields).toEqual(REQUIRED_FIELDS);
      expect(fields).toHaveLength(32);
      
      // Should be readonly - this test verifies the type
      // TypeScript compilation will catch if it's not readonly
    });

    it('getRequiredFieldCount should return 32', () => {
      expect(getRequiredFieldCount()).toBe(32);
    });
  });

  describe('Structure Compliance Requirements', () => {
    it('should enforce zero tolerance for missing fields', () => {
      // This test defines our core requirement: NO missing fields allowed
      const productWithMissingFields = {
        unified_id: 'test-123',
        shop_type: 'ah',
        title: 'Test Product',
        brand: 'Test Brand'
        // Missing 28+ other required fields
      };

      expect(isUnifiedProductTemplate(productWithMissingFields)).toBe(false);
    });

    it('should allow null values for optional fields but not missing fields', () => {
      const template = createProductTemplate();
      
      // These fields can be null
      template.main_category = null;
      template.promotion_start_date = null;
      template.promotion_end_date = null;
      
      expect(isUnifiedProductTemplate(template)).toBe(true);

      // But removing them entirely should fail
      delete (template as any).main_category;
      expect(isUnifiedProductTemplate(template)).toBe(false);
    });

    it('should maintain field consistency across all processors', () => {
      // This test will be expanded when processor compliance is implemented
      const templateFromAH = createProductTemplate({ shop_type: 'ah' });
      const templateFromJumbo = createProductTemplate({ shop_type: 'jumbo' });
      const templateFromAldi = createProductTemplate({ shop_type: 'aldi' });

      // All should have identical structure
      const ahFields = Object.keys(templateFromAH).sort();
      const jumboFields = Object.keys(templateFromJumbo).sort();
      const aldiFields = Object.keys(templateFromAldi).sort();

      expect(ahFields).toEqual(jumboFields);
      expect(jumboFields).toEqual(aldiFields);
      expect(ahFields).toHaveLength(32);
    });
  });
});