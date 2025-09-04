// src/utils/dedupe.ts
import { UnifiedProduct } from '../types/product';
import { getLogger } from '../infrastructure/logging';

// Lazy-loaded logger to avoid initialization issues
function getLoggerInstance() {
  return getLogger();
}

/**
 * Internal interface for products with quality metrics
 */
interface ProductWithQualityMetrics extends UnifiedProduct {
  quality_score?: number;
  quality_factors?: Record<string, number>;
}

/**
 * Deduplicates products based on unified_id
 * @param products Array of products to deduplicate
 * @returns Deduplicated array of products
 */
export function dedupeProducts(products: UnifiedProduct[]): UnifiedProduct[] {
  getLoggerInstance().info(`Deduplicating ${products.length} products`);

  // Use a Map to deduplicate by unified_id
  const dedupeMap = new Map<string, UnifiedProduct>();

  products.forEach(product => {
    const existingProduct = dedupeMap.get(product.unified_id);

    if (!existingProduct) {
      dedupeMap.set(product.unified_id, product);
    } else {
      // If we have quality metrics, use them to decide which product to keep
      const existingWithMetrics = existingProduct as ProductWithQualityMetrics;
      const currentWithMetrics = product as ProductWithQualityMetrics;

      // If the current product has a higher quality score, replace the existing one
      if (currentWithMetrics.quality_score &&
          existingWithMetrics.quality_score &&
          currentWithMetrics.quality_score > existingWithMetrics.quality_score) {
        dedupeMap.set(product.unified_id, product);
      }
    }
  });

  const dedupedProducts = Array.from(dedupeMap.values());
  getLoggerInstance().info(`Deduplication complete. ${dedupedProducts.length} products remaining.`);

  return dedupedProducts;
}

/**
 * Groups products by shop_type
 * @param products Array of products to group
 * @returns Map of shop_type to product arrays
 */
export function groupProductsByRetailer(products: UnifiedProduct[]): Map<string, UnifiedProduct[]> {
  const groupedProducts = new Map<string, UnifiedProduct[]>();

  products.forEach(product => {
    const shopType = product.shop_type;
    const existingProducts = groupedProducts.get(shopType) || [];

    existingProducts.push(product);
    groupedProducts.set(shopType, existingProducts);
  });

  // Log counts per retailer
  groupedProducts.forEach((products, shopType) => {
    getLoggerInstance().debug(`Shop ${shopType}: ${products.length} products`);
  });

  return groupedProducts;
}

/**
 * Filters out products with missing required fields
 * @param products Array of products to filter
 * @returns Filtered array of products with all required fields
 */
export function filterIncompleteProducts(products: UnifiedProduct[]): UnifiedProduct[] {
  const filteredProducts = products.filter(product =>
    product.unified_id &&
    product.shop_type &&
    product.title &&
    product.current_price !== undefined
  );

  getLoggerInstance().info(`Filtered out ${products.length - filteredProducts.length} incomplete products`);
  return filteredProducts;
}

/**
 * Finds similar products based on name and retailer
 * @param products Array of products to check
 * @returns Groups of similar products
 */
export function findSimilarProducts(products: UnifiedProduct[]): Map<string, UnifiedProduct[]> {
  const similarityGroups = new Map<string, UnifiedProduct[]>();

  products.forEach(product => {
    // Create a simplified name for comparison (lowercase, no special chars)
    const simpleName = product.title.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Create a key combining retailer and simplified name
    const key = `${product.shop_type}:${simpleName}`;

    const existingGroup = similarityGroups.get(key) || [];
    existingGroup.push(product);
    similarityGroups.set(key, existingGroup);
  });

  // Filter out groups with only one product
  Array.from(similarityGroups.keys()).forEach(key => {
    const group = similarityGroups.get(key);
    if (group && group.length <= 1) {
      similarityGroups.delete(key);
    }
  });

  return similarityGroups;
}