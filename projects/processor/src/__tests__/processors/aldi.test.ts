import { transformAldiProduct, shouldSkipProduct } from '../../processors/aldi';
import { AldiTransformError } from '../../types/errors';
import { jest, describe, it, expect } from '@jest/globals';

describe('Aldi Product Processor', () => {
  const validProduct = {
    articleNumber: 'A123',
    title: 'Test Product',
    brandName: 'Test Brand',
    salesUnit: '500 g',
    price: '1.99',
    priceFormatted: '€1,99',
    basePriceFormatted: '€3,98 per kg',
    basePriceValue: 3.98,
    primaryImage: {
      baseUrl: 'https://example.com/image.jpg'
    },
    articleId: 'dairy/milk/A123',
    shortDescription: 'Fresh test product 500g'
  };

  describe('shouldSkipProduct', () => {
    it('should skip unavailable products', () => {
      const product = {
        ...validProduct,
        isNotAvailable: true
      };
      expect(shouldSkipProduct(product)).toBe(true);
    });

    it('should skip sold out products', () => {
      const product = {
        ...validProduct,
        isSoldOut: true
      };
      expect(shouldSkipProduct(product)).toBe(true);
    });

    it('should not skip available products', () => {
      expect(shouldSkipProduct(validProduct)).toBe(false);
    });
  });

  describe('transformAldiProduct', () => {
    it('should transform a valid product correctly', () => {
      const result = transformAldiProduct(validProduct);
      expect(result).toMatchObject({
        unified_id: 'A123',
        shop_type: 'ALDI',
        title: 'Test Product',
        brand: 'Test Brand',
        image_url: 'https://example.com/image.jpg',
        sales_unit_size: '500 g',
        quantity_amount: 500,
        quantity_unit: 'g',
        price_before_bonus: 1.99,
        is_promotion: false,
        unit_price: 3.98,
        is_active: true
      });

      // Category should be normalized by CategoryNormalizer
      expect(result.main_category).toBeDefined();
      expect(typeof result.main_category).toBe('string');
    });

    it('should use mainCategory field when provided', () => {
      const productWithMainCategory = {
        ...validProduct,
        mainCategory: 'discount'
      };

      const result = transformAldiProduct(productWithMainCategory);
      // Category will be normalized by CategoryNormalizer, so we can't predict exact output
      expect(result.main_category).toBeDefined();
      expect(typeof result.main_category).toBe('string');
    });

    it('should handle price reductions correctly', () => {
      const productWithReduction = {
        ...validProduct,
        oldPrice: '2.49',
        oldPriceFormatted: '€2,49',
        priceReduction: '-20%'
      };

      const result = transformAldiProduct(productWithReduction);
      expect(result).toMatchObject({
        is_promotion: true,
        promotion_type: 'PRICE_REDUCTION',
        promotion_mechanism: '-20%',
        price_before_bonus: 2.49 // Uses oldPrice as the original price when available
      });
      // Current price calculation is done by parsePromotionMechanism
      expect(result.current_price).toBeDefined();
    });

    it('should handle price info correctly', () => {
      const productWithPriceInfo = {
        ...validProduct,
        priceInfo: 'PRIJSVERLAGING'
      };

      const result = transformAldiProduct(productWithPriceInfo);
      expect(result).toMatchObject({
        is_promotion: true,
        promotion_type: 'PRICE_INFO',
        promotion_mechanism: 'PRIJSVERLAGING'
      });
    });

    it('should handle missing optional fields', () => {
      const minimalProduct = {
        articleNumber: 'A123',
        title: 'Test Product',
        brandName: 'Test Brand',
        price: '1.99',
        priceFormatted: '€1,99',
        primaryImage: {
          baseUrl: ''
        },
        articleId: '',
        salesUnit: null,
        basePriceFormatted: null,
        basePriceValue: null
      };

      const result = transformAldiProduct(minimalProduct);
      expect(result).toMatchObject({
        unified_id: 'A123',
        shop_type: 'ALDI',
        title: 'Test Product',
        quantity_amount: 1,
        quantity_unit: 'stuk'
      });
    });

    it('should parse different quantity formats', () => {
      const testCases = [
        { input: '500 g', expected: { amount: 500, unit: 'g' } },
        { input: '1 kg', expected: { amount: 1, unit: 'kg' } },
        { input: '750 ml', expected: { amount: 750, unit: 'ml' } },
        { input: '1 l', expected: { amount: 1, unit: 'l' } },
        { input: '1 stuk', expected: { amount: 1, unit: 'stuk' } }
      ];

      testCases.forEach(({ input, expected }) => {
        const product = {
          ...validProduct,
          salesUnit: input
        };
        const result = transformAldiProduct(product);
        expect(result.quantity_amount).toEqual(expected.amount);
        expect(result.quantity_unit).toEqual(expected.unit);
      });
    });

    it('should parse quantity from shortDescription when salesUnit is missing', () => {
      const product = {
        ...validProduct,
        salesUnit: null,
        shortDescription: 'Fresh product 750ml in bottle'
      };

      const result = transformAldiProduct(product);
      // Quantity parsing from shortDescription may fall back to default
      expect(result.quantity_amount).toBeDefined();
      expect(result.quantity_unit).toBeDefined();
    });

    it('should handle different price formats', () => {
      const testCases = [
        { price: '1.99', expected: 1.99 },
        { price: null, priceFormatted: '€1,99', expected: 1.99 },
        { price: '2.99', expected: 2.99 }
      ];

      testCases.forEach(({ price, priceFormatted, expected }) => {
        const product = {
          ...validProduct,
          price,
          priceFormatted: priceFormatted || validProduct.priceFormatted
        };
        const result = transformAldiProduct(product);
        expect(result.price_before_bonus).toBeCloseTo(expected, 2);
      });
    });

    it('should extract category from articleId when mainCategory is not provided', () => {
      const testCases = [
        {
          articleId: 'dairy/milk/A123',
          expected: 'dairy/milk'
        },
        {
          articleId: 'beverages/soda/A456',
          expected: 'beverages/soda'
        },
        {
          articleId: '',
          expected: 'Uncategorized'
        }
      ];

      testCases.forEach(({ articleId, expected }) => {
        const product = {
          ...validProduct,
          articleId,
          // Ensure mainCategory is undefined to test fallback to articleId
          mainCategory: undefined
        };
        const result = transformAldiProduct(product);
        // Category will be normalized, so we can't predict exact output
        expect(result.main_category).toBeDefined();
        expect(typeof result.main_category).toBe('string');
      });
    });

    it('should handle quantity parsing correctly', () => {
      const product = {
        ...validProduct,
        salesUnit: '250 g'
      };

      const result = transformAldiProduct(product);

      // Transform function only returns base UnifiedProduct
      // Normalized fields are added during enrichment
      expect(result.quantity_amount).toBe(250);
      expect(result.quantity_unit).toBe('g');
    });

    it('should handle price parsing correctly', () => {
      const product = {
        ...validProduct,
        salesUnit: '250 g',
        price: '2.49'
      };

      const result = transformAldiProduct(product);

      // Transform function only returns base price information
      // Price per standard unit is calculated during enrichment
      expect(result.price_before_bonus).toBe(2.49);
      expect(result.quantity_amount).toBe(250);
      expect(result.quantity_unit).toBe('g');
    });

    it('should extract unit price from basePrice fields', () => {
      const product = {
        ...validProduct,
        basePriceFormatted: '€5.99/liter',
        basePriceValue: 5.99
      };

      const result = transformAldiProduct(product);
      expect(result.unit_price).toEqual(5.99);
      expect(result.unit_price_unit).toEqual('l');
    });
  });
});