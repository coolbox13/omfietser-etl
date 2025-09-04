// src/processors/validators/index.ts

// Export common validation utility functions
export function validateRequiredString(value: string | undefined, fieldName: string): boolean {
  if (!value || value.trim() === '') {
    return false;
  }
  return true;
}

export function validateRequiredNumber(value: number | undefined, fieldName: string): boolean {
  if (value === undefined || value === null || isNaN(value) || value <= 0) {
    return false;
  }
  return true;
}

export function validateImageUrl(url: string | undefined): boolean {
  if (!url) return false;
  // Basic URL validation
  return url.startsWith('http') || url.startsWith('https');
}

// Export individual validators
export * from './ah';
export * from './jumbo';
export * from './aldi';
export * from './plus';