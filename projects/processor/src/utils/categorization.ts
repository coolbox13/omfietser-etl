// src/utils/categorization.ts
/**
 * Utility functions for working with product categories
 */
import { calculateFuzzyMatchScore } from './string';

/**
 * Find the best matching category from a list of target categories
 * based on fuzzy string matching.
 * 
 * @param input The category string to match
 * @param targetCategories Array of target categories to match against
 * @param threshold Minimum match score threshold (0-1)
 * @returns The best matching category or null if no match above threshold
 */
export function findBestCategoryMatch(
  input: string,
  targetCategories: string[],
  threshold: number = 0.6
): string | null {
  if (!input || !targetCategories.length) {
    return null;
  }
  
  const normalizedInput = normalizeString(input);
  let bestMatch: string | null = null;
  let bestScore = threshold;
  
  for (const category of targetCategories) {
    const normalizedCategory = normalizeString(category);
    const score = calculateFuzzyMatchScore(normalizedInput, normalizedCategory);
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = category;
    }
  }
  
  return bestMatch;
}

/**
 * Check if a category belongs to a given parent category
 * 
 * @param category The category to check
 * @param parentCategory The parent category to check against
 * @returns True if the category belongs to the parent category
 */
export function isCategoryInHierarchy(
  category: string,
  parentCategory: string
): boolean {
  if (!category || !parentCategory) {
    return false;
  }
  
  const normalizedCategory = normalizeString(category);
  const normalizedParent = normalizeString(parentCategory);
  
  // Direct match
  if (normalizedCategory === normalizedParent) {
    return true;
  }
  
  // Category starts with parent (hierarchical relationship)
  if (normalizedCategory.startsWith(normalizedParent)) {
    return true;
  }
  
  // Category contains parent with separator characters
  const separatorPattern = /[\/\-_,;>|]/;
  if (separatorPattern.test(normalizedCategory)) {
    const parts = normalizedCategory.split(separatorPattern);
    return parts.some(part => part.trim() === normalizedParent);
  }
  
  return false;
}

/**
 * Extract the most specific subcategory from a hierarchical category string
 * 
 * @param categoryPath Hierarchical category path
 * @returns The most specific (leaf) subcategory
 */
export function extractLeafCategory(categoryPath: string): string {
  if (!categoryPath) {
    return '';
  }
  
  // Split by common hierarchy separators
  const separators = /[\/\-_>|]/;
  if (separators.test(categoryPath)) {
    const parts = categoryPath.split(separators).map(p => p.trim());
    // Return the last non-empty part
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i]) {
        return parts[i];
      }
    }
  }
  
  return categoryPath.trim();
}

/**
 * Normalize a string for category comparison
 * 
 * @param str String to normalize
 * @returns Normalized string
 */
function normalizeString(str: string): string {
  if (!str) return '';
  
  return str
    .toLowerCase()
    .trim()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Group products by their main category
 * 
 * @param products Array of products with mainCategory field
 * @returns Map of category to products
 */
export function groupProductsByCategory<T extends { mainCategory: string | null }>(
  products: T[]
): Map<string, T[]> {
  const categoryMap = new Map<string, T[]>();
  
  products.forEach(product => {
    const category = product.mainCategory || 'Uncategorized';
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category)!.push(product);
  });
  
  return categoryMap;
}

/**
 * Calculate category distribution statistics
 * 
 * @param products Array of products with mainCategory field
 * @returns Array of category distribution objects
 */
export function calculateCategoryDistribution<T extends { mainCategory: string | null }>(
  products: T[]
): Array<{ category: string; count: number; percentage: number }> {
  const categoryMap = groupProductsByCategory(products);
  const totalProducts = products.length;
  
  return Array.from(categoryMap.entries())
    .map(([category, categoryProducts]) => ({
      category,
      count: categoryProducts.length,
      percentage: (categoryProducts.length / totalProducts) * 100
    }))
    .sort((a, b) => b.count - a.count);
}