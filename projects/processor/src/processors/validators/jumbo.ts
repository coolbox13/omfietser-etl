// src/processors/validators/jumbo.ts
import { JumboProductWrapper } from '../jumbo';
import { ValidationError } from '../../utils/error';

/**
 * Validates a Jumbo product before transformation
 * @param wrapper The Jumbo product wrapper to validate
 * @returns True if product is valid, false if it should be skipped
 * @throws ValidationError if validation fails with critical errors
 */
export function validateJumboProduct(wrapper: JumboProductWrapper): boolean {
  // Check if wrapper exists
  if (!wrapper || !wrapper.product) {
    throw new ValidationError('Missing product data in wrapper', { 
      productId: 'unknown'
    });
  }

  const product = wrapper.product;

  // Validate required fields
  if (!product.id) {
    throw new ValidationError('Missing required field: id', { 
      productId: 'unknown', 
      field: 'id' 
    });
  }

  if (!product.title || product.title.trim() === '') {
    return false; // Skip products without title
  }

  // Validate price data - prices are now integers representing cents
  if (!product.prices || !product.prices.price || product.prices.price <= 0) {
    return false; // Skip products without valid price
  }

  // Skip products not in assortment
  if (product.inAssortment === false) {
    return false;
  }

  // Skip unavailable products
  if (product.availability && !product.availability.isAvailable) {
    return false;
  }

  return true;
}