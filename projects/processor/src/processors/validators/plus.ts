// src/processors/validators/plus.ts
import { PlusProductWrapper } from '../plus';
import { ValidationError } from '../../utils/error';

/**
 * Validates a Plus product wrapper to determine if it should be processed
 * @param wrapper The Plus product wrapper to validate
 * @returns True if the product is valid, false if it should be skipped
 */
export function validatePlusProduct(wrapper: PlusProductWrapper): boolean {
  // Check if wrapper exists
  if (!wrapper || !wrapper.PLP_Str) {
    return false;
  }

  const product = wrapper.PLP_Str;

  // Skip unavailable products
  if (!product.IsAvailable) {
    return false;
  }

  // Skip products with no SKU
  if (!product.SKU) {
    return false;
  }

  // Skip products with no name
  if (!product.Name || product.Name.trim() === '') {
    return false;
  }

  // Skip products with no price information
  if (!product.OriginalPrice) {
    return false;
  }

  // Skip products with invalid price
  const price = parseFloat(product.OriginalPrice);
  if (isNaN(price) || price <= 0) {
    return false;
  }

  return true;
}