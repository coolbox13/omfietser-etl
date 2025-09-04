// src/processors/validators/aldi.ts
import { AldiProduct } from '../aldi';
import { ValidationError } from '../../utils/error';

/**
 * Validates an Aldi product before transformation
 * @param product The Aldi product to validate
 * @returns True if product is valid, false if it should be skipped
 * @throws ValidationError if validation fails with critical errors
 */
export function validateAldiProduct(product: AldiProduct): boolean {
  // Skip unavailable or sold out products
  if (product.isNotAvailable || product.isSoldOut) {
    return false;
  }

  // Skip products with no article number
  if (!product.articleNumber) {
    return false;
  }

  // Skip products with no title
  if (!product.title || product.title.trim() === '') {
    return false;
  }

  // Skip products with no price information
  if ((!product.price || product.price === 'null') && 
      (!product.priceFormatted || product.priceFormatted === 'null')) {
    return false;
  }

  return true;
}