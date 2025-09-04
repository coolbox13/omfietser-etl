// src/processors/validators/ah.ts
import { AHProduct } from '../ah';
import { ValidationError } from '../../utils/error';

/**
 * Validates an AH product before transformation
 * @param product The AH product to validate
 * @returns True if product is valid, false if it should be skipped
 * @throws ValidationError if validation fails with critical errors
 */
export function validateAHProduct(product: AHProduct): boolean {
  // Validate essential fields
  if (!product) {
    throw new ValidationError('Product is null or undefined');
  }

  // Check availability status
  if (product.orderAvailabilityStatus !== 'IN_ASSORTMENT') {
    return false; // Skip products not in assortment
  }

  // Skip virtual bundles
  if (product.isVirtualBundle) {
    return false;
  }

  // Check required fields
  if (!product.title || product.title.trim() === '') {
    throw new ValidationError('Missing required field: title', { 
      productId: product.webshopId?.toString(),
      field: 'title' 
    });
  }

  if (!product.webshopId) {
    throw new ValidationError('Missing required field: webshopId', { 
      productId: 'unknown',
      field: 'webshopId' 
    });
  }

  // Validate has at least one image
  if (!product.images || product.images.length === 0) {
    // Not critical, product can be processed without images
    return true;
  }

  return true;
}