import { transformJumboProduct, shouldSkipProduct } from '../../processors/jumbo';
import { JumboTransformError } from '../../types/errors';

describe('Jumbo Product Processor', () => {
  const validProduct = {
    product: {
      id: '123',
      title: 'Test Product',
      brand: 'Jumbo',
      category: 'Groenten & Fruit',
      subtitle: '500 g',
      quantityDetails: {
        maxAmount: 99,
        minAmount: 1,
        stepAmount: 1,
        defaultAmount: 1
      },
      image: 'https://example.com/image.jpg',
      inAssortment: true,
      availability: {
        availability: 'AVAILABLE',
        isAvailable: true
      },
      prices: {
        price: 199, // €1.99 in cents
        promoPrice: null,
        pricePerUnit: {
          price: 398, // €3.98 per kg in cents
          unit: 'kg'
        }
      }
    }
  };

  describe('shouldSkipProduct', () => {
    it('should skip products without title', () => {
      const product = {
        product: {
          ...validProduct.product,
          title: ''
        }
      };
      expect(shouldSkipProduct(product)).toBe(true);
    });

    it('should skip products with invalid price', () => {
      const product = {
        product: {
          ...validProduct.product,
          prices: {
            price: 0
          }
        }
      };
      expect(shouldSkipProduct(product)).toBe(true);
    });

    it('should skip products not in assortment', () => {
      const product = {
        product: {
          ...validProduct.product,
          inAssortment: false
        }
      };
      expect(shouldSkipProduct(product)).toBe(true);
    });

    it('should skip unavailable products', () => {
      const product = {
        product: {
          ...validProduct.product,
          availability: {
            availability: 'UNAVAILABLE',
            isAvailable: false
          }
        }
      };
      expect(shouldSkipProduct(product)).toBe(true);
    });

    it('should not skip valid products', () => {
      expect(shouldSkipProduct(validProduct)).toBe(false);
    });

    it('should skip products with missing wrapper', () => {
      const invalidProduct = null;
      expect(shouldSkipProduct(invalidProduct as any)).toBe(true);
    });

    it('should skip products with missing product data', () => {
      const invalidProduct = { product: null };
      expect(shouldSkipProduct(invalidProduct as any)).toBe(true);
    });
  });

  describe('transformJumboProduct', () => {
    it('should transform a valid product correctly', () => {
      const result = transformJumboProduct(validProduct);

      expect(result).toMatchObject({
        unified_id: '123',
        shop_type: 'JUMBO',
        title: 'Test Product',
        brand: 'Jumbo',
        main_category: expect.any(String),
        image_url: 'https://example.com/image.jpg',
        sales_unit_size: '500 g',
        quantity_amount: 500,
        quantity_unit: 'g',
        price_before_bonus: 1.99, // Converted from cents
        current_price: 1.99,
        unit_price: 3.98, // Converted from cents
        unit_price_unit: 'kg',
        is_promotion: false,
        is_active: true
      });
    });

    it('should handle products without brand', () => {
      const productWithoutBrand = {
        product: {
          ...validProduct.product,
          brand: undefined
        }
      };

      const result = transformJumboProduct(productWithoutBrand);
      expect(result.brand).toBe('Test'); // First word of title
    });

    it('should handle promotion products correctly', () => {
      const promotionProduct = {
        product: {
          ...validProduct.product,
          promotions: [
            {
              tags: [
                { text: 'In de aanbieding' },
                { text: '1+1 gratis' }
              ],
              start: {},
              end: {}
            }
          ]
        }
      };

      const result = transformJumboProduct(promotionProduct);
      expect(result.current_price).toBeDefined();
      expect(result.promotion_mechanism).toBe('In de aanbieding; 1+1 gratis');
      expect(result.is_promotion).toBe(true);
    });

    it('should handle promo price correctly', () => {
      const promoProduct = {
        product: {
          ...validProduct.product,
          prices: {
            ...validProduct.product.prices,
            promoPrice: 149 // €1.49 in cents
          }
        }
      };

      const result = transformJumboProduct(promoProduct);
      expect(result.current_price).toBe(1.49); // Should use promo price
      expect(result.price_before_bonus).toBe(1.99); // Original price
    });

    it('should handle missing optional fields', () => {
      const minimalProduct = {
        product: {
          id: '123',
          title: 'Test Product',
          prices: {
            price: 199 // €1.99 in cents
          },
          inAssortment: true,
          availability: {
            availability: 'AVAILABLE',
            isAvailable: true
          }
        }
      };

      const result = transformJumboProduct(minimalProduct);
      expect(result).toMatchObject({
        unified_id: '123',
        shop_type: 'JUMBO',
        title: 'Test Product',
        quantity_amount: 1,
        quantity_unit: 'stuk',
        price_before_bonus: 1.99,
        is_active: true
      });
    });

    it('should handle price conversion correctly', () => {
      const productWithDifferentPrice = {
        product: {
          ...validProduct.product,
          prices: {
            price: 1234, // €12.34 in cents
            pricePerUnit: {
              price: 567, // €5.67 per unit in cents
              unit: 'kg'
            }
          }
        }
      };

      const result = transformJumboProduct(productWithDifferentPrice);
      expect(result.price_before_bonus).toBe(12.34);
      expect(result.current_price).toBe(12.34);
      expect(result.unit_price).toBe(5.67);
    });
  });
});