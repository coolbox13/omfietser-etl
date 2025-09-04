export function calculateFuzzyMatchScore(a: string, b: string): number {
    if (!a || !b) return 0;
  
    const aLen = a.length;
    const bLen = b.length;
  
    if (aLen === 0) return bLen === 0 ? 1 : 0;
    if (bLen === 0) return 0;
  
    const matrix = [];
  
    // Initialize matrix
    for (let i = 0; i <= bLen; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= aLen; j++) {
      matrix[0][j] = j;
    }
  
    // Calculate Levenshtein distance
    for (let i = 1; i <= bLen; i++) {
      for (let j = 1; j <= aLen; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
  
    const distance = matrix[bLen][aLen];
    const maxLength = Math.max(aLen, bLen);
  
    // Return similarity score (1 - normalized distance)
    return 1 - (distance / maxLength);
  }

// src/utils/string.ts

/**
 * Normalize a string by removing special characters, converting to lowercase,
 * and standardizing whitespace.
 * 
 * @param str The input string to normalize
 * @returns Normalized string
 */
export function normalizeString(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ') // Replace non-alphanumeric characters with spaces
    .replace(/\s+/g, ' ')        // Standardize multiple spaces
    .trim();
}

/**
 * Calculate similarity score between two strings using Levenshtein distance
 * 
 * @param a First string
 * @param b Second string
 * @returns Similarity score between 0 and 1 (1 being identical)
 */
export function calculateSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  
  const aLen = a.length;
  const bLen = b.length;
  
  if (aLen === 0) return bLen === 0 ? 1 : 0;
  if (bLen === 0) return 0;
  
  const matrix: number[][] = [];
  
  // Initialize matrix
  for (let i = 0; i <= bLen; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= aLen; j++) {
    matrix[0][j] = j;
  }
  
  // Calculate Levenshtein distance
  for (let i = 1; i <= bLen; i++) {
    for (let j = 1; j <= aLen; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  const distance = matrix[bLen][aLen];
  const maxLength = Math.max(aLen, bLen);
  
  // Return similarity score (1 - normalized distance)
  return 1 - (distance / maxLength);
}

/**
 * Extract numbers from a string
 * 
 * @param str Input string
 * @returns Array of numbers found in the string
 */
export function extractNumbers(str: string): number[] {
  if (!str) return [];
  
  const matches = str.match(/[-+]?\d*\.?\d+/g);
  return matches ? matches.map(Number) : [];
}

/**
 * Format a string as a price
 * 
 * @param value The price value
 * @param currency Currency symbol (default: €)
 * @param decimals Number of decimal places (default: 2)
 * @returns Formatted price string
 */
export function formatPrice(
  value: number,
  currency: string = '€',
  decimals: number = 2
): string {
  if (value === undefined || value === null) return '';
  
  return `${currency}${value.toFixed(decimals)}`;
}

/**
 * Parse a price string to number
 * 
 * @param priceStr The price string to parse
 * @returns Parsed price as number
 */
export function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  
  // Remove currency symbols and non-numeric characters except dot and comma
  const cleaned = priceStr.replace(/[^0-9.,]/g, '');
  
  // Replace comma with dot for parsing
  const normalized = cleaned.replace(',', '.');
  
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Truncate a string to a maximum length with ellipsis
 * 
 * @param str Input string
 * @param maxLength Maximum length (default: 50)
 * @param ellipsis Ellipsis string (default: '...')
 * @returns Truncated string
 */
export function truncate(
  str: string,
  maxLength: number = 50,
  ellipsis: string = '...'
): string {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  
  return str.slice(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Convert camelCase to snake_case
 * 
 * @param str Input string in camelCase
 * @returns String in snake_case
 */
export function camelToSnake(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

/**
 * Convert snake_case to camelCase
 * 
 * @param str Input string in snake_case
 * @returns String in camelCase
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}