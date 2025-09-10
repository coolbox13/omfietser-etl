// Unit tests for API validation schemas
import {
  createJobSchema,
  startJobSchema,
  cancelJobSchema,
  processShopSchema,
  webhookN8nSchema
} from '../../api/validation';

describe('API Validation Schemas', () => {
  describe('createJobSchema', () => {
    test('should validate valid job creation data', () => {
      const validData = {
        shop_type: 'ah' as const,
        batch_size: 1000,
        metadata: { key: 'value' }
      };

      const result = createJobSchema.parse(validData);
      expect(result).toEqual(validData);
    });

    test('should fail for invalid shop_type', () => {
      const invalidData = {
        shop_type: 'invalid_shop',
        batch_size: 1000
      };

      expect(() => createJobSchema.parse(invalidData)).toThrow();
    });

    test('should fail for invalid batch_size', () => {
      const invalidData = {
        shop_type: 'ah' as const,
        batch_size: -1
      };

      expect(() => createJobSchema.parse(invalidData)).toThrow();
    });

    test('should work without optional fields', () => {
      const minimalData = {
        shop_type: 'jumbo' as const
      };

      const result = createJobSchema.parse(minimalData);
      expect(result.shop_type).toBe('jumbo');
    });
  });

  describe('cancelJobSchema', () => {
    test('should validate with reason', () => {
      const validData = {
        reason: 'User requested cancellation'
      };

      const result = cancelJobSchema.parse(validData);
      expect(result).toEqual(validData);
    });

    test('should validate without reason', () => {
      const result = cancelJobSchema.parse({});
      expect(result).toEqual({});
    });

    test('should fail for empty reason', () => {
      const invalidData = {
        reason: ''
      };

      expect(() => cancelJobSchema.parse(invalidData)).toThrow();
    });
  });

  describe('processShopSchema', () => {
    test('should validate valid process shop data', () => {
      const validData = {
        batch_size: 500,
        metadata: { source: 'api' }
      };

      const result = processShopSchema.parse(validData);
      expect(result).toEqual(validData);
    });

    test('should validate empty body', () => {
      const result = processShopSchema.parse({});
      expect(result).toEqual({});
    });
  });

  describe('webhookN8nSchema', () => {
    test('should validate valid webhook data', () => {
      const validData = {
        action: 'process',
        shop_type: 'aldi' as const,
        batch_id: 'batch_123',
        metadata: { trigger: 'n8n' }
      };

      const result = webhookN8nSchema.parse(validData);
      expect(result).toEqual(validData);
    });

    test('should fail without required action', () => {
      const invalidData = {
        shop_type: 'plus' as const
      };

      expect(() => webhookN8nSchema.parse(invalidData)).toThrow();
    });

    test('should fail without required shop_type', () => {
      const invalidData = {
        action: 'process'
      };

      expect(() => webhookN8nSchema.parse(invalidData)).toThrow();
    });
  });

  describe('startJobSchema', () => {
    test('should validate empty body', () => {
      const result = startJobSchema.parse({});
      expect(result).toEqual({});
    });

    test('should validate undefined body', () => {
      const result = startJobSchema.parse(undefined);
      expect(result).toBe(undefined);
    });
  });
});
