// src/utils/units.ts
/**
 * Utility functions for working with product units and quantities
 */
import {
    unitMappings,
    unitConversionFactors,
    getUnitCategory,
    standardUnits
  } from '../config/units';

  /**
   * Parse a quantity string into amount and unit
   *
   * @param quantityStr The quantity string to parse (e.g., "500 g", "2 stuks")
   * @returns Parsed quantity object or default if parsing fails
   */
  export function parseQuantityString(
    quantityStr?: string
  ): { amount: number; unit: string } {
    if (!quantityStr) {
      return { amount: 1, unit: 'stuk' };
    }

    // Try to match patterns like "500 g", "1.5 kg", "3 stuks"
    const match = quantityStr.match(/(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)/);
    if (match) {
      const [, amount, unit] = match;
      return {
        amount: parseFloat(amount.replace(',', '.')),
        unit: normalizeUnit(unit)
      };
    }

    // Try to match patterns like "per stuk", "per 100 g"
    const perMatch = quantityStr.match(/per\s+(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)/i);
    if (perMatch) {
      const [, amount, unit] = perMatch;
      return {
        amount: parseFloat(amount.replace(',', '.')),
        unit: normalizeUnit(unit)
      };
    }

    // If we can't parse it, return default
    return { amount: 1, unit: 'stuk' };
  }

  /**
   * Normalize a unit to a standardized format
   *
   * @param unit The unit to normalize
   * @returns Normalized unit string
   */
  export function normalizeUnit(unit: string): string {
    if (!unit) return 'stuk';

    // Clean the unit string
    const cleanUnit = unit.toLowerCase().trim()
      .replace(/^per\s+/, '')  // Remove 'per' prefix
      .replace(/s$/, '')       // Remove trailing 's' (e.g., 'grams' -> 'gram')
      .replace(/[.,;:\(\)]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ');   // Normalize whitespace

    // Handle multi-pack formats (e.g., "6 x 150g")
    const multiPackMatch = cleanUnit.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*([a-z]+)/i);
    if (multiPackMatch) {
      const [, , , itemUnit] = multiPackMatch;
      // Return the unit of the individual items
      if (unitMappings[itemUnit]) {
        return unitMappings[itemUnit];
      }
    }

    // Check for direct match in mappings
    if (unitMappings[cleanUnit]) {
      return unitMappings[cleanUnit];
    }

    // Check for partial matches
    for (const [key, value] of Object.entries(unitMappings)) {
      if (cleanUnit.includes(key)) {
        return value;
      }
    }

    // Handle numeric pack sizes (e.g., "12-pack", "6 pack")
    const packSizeMatch = cleanUnit.match(/(\d+)[\s-]*(pack|stuks|pieces|items)/i);
    if (packSizeMatch) {
      return 'stuk';
    }

    // Check if it's already a standard unit
    if (standardUnits.includes(cleanUnit)) {
      return cleanUnit;
    }

    // Default to stuk if no match found
    return 'stuk';
  }

  /**
   * Convert a quantity to a standard reference unit
   *
   * @param quantity The quantity to convert
   * @param targetUnit The target unit to convert to (or auto-determine if not specified)
   * @returns Converted quantity and conversion factor
   */
  export function convertToStandardUnit(
    quantity: { amount: number; unit: string },
    targetUnit?: string
  ): {
    standardQuantity: { amount: number; unit: string };
    conversionFactor: number;
  } {
    if (!quantity || !quantity.amount || !quantity.unit) {
      return {
        standardQuantity: { amount: 1, unit: 'stuk' },
        conversionFactor: 1
      };
    }

    const { amount, unit } = quantity;
    const normalizedUnit = normalizeUnit(unit);
    const category = getUnitCategory(normalizedUnit);

    // Determine target unit if not specified
    const autoTargetUnit = targetUnit || getDefaultTargetUnit(category);

    switch (category) {
      case 'weight': {
        // Convert from source unit to base unit (g), then to target unit
        const gramsPerSourceUnit = unitConversionFactors.weight[normalizedUnit] || 1;
        const gramsPerTargetUnit = unitConversionFactors.weight[autoTargetUnit] || 1000;

        const amountInGrams = amount * gramsPerSourceUnit;
        const weightAmountInTargetUnit = amountInGrams / gramsPerTargetUnit;

        return {
          standardQuantity: {
            amount: weightAmountInTargetUnit,
            unit: autoTargetUnit
          },
          conversionFactor: amountInGrams / gramsPerTargetUnit
        };
      }

      case 'volume': {
        // Convert from source unit to base unit (ml), then to target unit
        const mlPerSourceUnit = unitConversionFactors.volume[normalizedUnit] || 1;
        const mlPerTargetUnit = unitConversionFactors.volume[autoTargetUnit] || 1000;

        const amountInMl = amount * mlPerSourceUnit;
        const volumeAmountInTargetUnit = amountInMl / mlPerTargetUnit;

        return {
          standardQuantity: {
            amount: volumeAmountInTargetUnit,
            unit: autoTargetUnit
          },
          conversionFactor: amountInMl / mlPerTargetUnit
        };
      }

      case 'piece':
      default:
        // For pieces, just normalize to the target unit (typically 'stuk')
        return {
          standardQuantity: {
            amount: amount,
            unit: autoTargetUnit
          },
          conversionFactor: amount
        };
    }
  }

  /**
   * Get the default target unit for a category
   */
  function getDefaultTargetUnit(category: 'weight' | 'volume' | 'piece' | 'length' | 'area'): string {
    switch (category) {
      case 'weight':
        return 'kg';
      case 'volume':
        return 'l';
      case 'length':
        return 'm';
      case 'area':
        return 'm2';
      case 'piece':
      default:
        return 'stuk';
    }
  }

  /**
   * Calculate price per standard unit
   *
   * @param price The price
   * @param conversionFactor The conversion factor from original to standard unit
   * @returns The price per standard unit
   */
  export function calculatePricePerUnit(
    price: number,
    conversionFactor: number
  ): number {
    if (!price || price <= 0 || !conversionFactor || conversionFactor <= 0) {
      return 0;
    }

    // Price per standard unit = original price / conversion factor
    return parseFloat((price / conversionFactor).toFixed(2));
  }

  /**
   * Extract unit from a unit price description string
   *
   * @param description The unit price description (e.g., "€3.99 per kg")
   * @returns The extracted unit or null if not found
   */
  export function extractUnitFromDescription(description?: string): string | null {
    if (!description) return null;

    // Try to match patterns like "per kg", "per 100g", "per stuk"
    const match = description.match(/per\s+(?:\d+\s*)?([a-zA-Z]+)/i);
    if (match) {
      return normalizeUnit(match[1]);
    }

    return null;
  }

  /**
   * Parse a unit price description into a structured unit price object
   *
   * @param description The unit price description (e.g., "€3.99 per kg")
   * @returns The parsed unit price or null if parsing fails
   */
  export function parseUnitPrice(
    description?: string
  ): { unit: string; price: number } | null {
    if (!description) return null;

    // Try to match patterns like "€3.99 per kg", "3,99 per stuk", "prijs per kg €3.99"
    const patterns = [
      /(?:€|EUR|)\s*(\d+[.,]\d+)\s+per\s+([a-zA-Z]+)/i,
      /per\s+([a-zA-Z]+)\s+(?:€|EUR|)\s*(\d+[.,]\d+)/i,
      /prijs\s+per\s+([a-zA-Z]+)\s+(?:€|EUR|)\s*(\d+[.,]\d+)/i
    ];

    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match) {
        // Extract price and unit based on pattern
        const priceIndex = pattern.toString().indexOf('(\\d+') < pattern.toString().indexOf('([a-zA-Z]+)') ? 1 : 2;
        const unitIndex = priceIndex === 1 ? 2 : 1;

        const price = parseFloat(match[priceIndex].replace(',', '.'));
        const unit = normalizeUnit(match[unitIndex]);

        return { unit, price };
      }
    }

    return null;
  }