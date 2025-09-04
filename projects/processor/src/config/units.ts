// src/config/units.ts
/**
 * Configuration for unit standardization and normalization
 * This file centralizes all unit-related mappings and conversion factors
 */

/**
 * Maps various unit representations to standard unit codes
 * e.g., 'gram', 'gr', 'grs' all map to 'g'
 *
 * This comprehensive mapping covers the ~80 different quantity formats
 * used by Albert Heijn and other supermarkets
 */
export const unitMappings: Record<string, string> = {
    // Weight units - comprehensive list
    'gram': 'g', 'gr': 'g', 'grs': 'g', 'grams': 'g', 'gramm': 'g',
    'g': 'g', 'gm': 'g', 'grammes': 'g', 'grm': 'g', 'grammi': 'g',
    'kilogram': 'kg', 'kilo': 'kg', 'kgrams': 'kg', 'kilos': 'kg',
    'kg': 'kg', 'kgs': 'kg', 'kilograms': 'kg', 'kilogrammes': 'kg',
    'ounce': 'oz', 'oz': 'oz', 'ounces': 'oz',
    'pound': 'lb', 'lb': 'lb', 'lbs': 'lb', 'pounds': 'lb',
    'mg': 'mg', 'milligram': 'mg', 'milligrams': 'mg',

    // Volume units - comprehensive list
    'liter': 'l', 'liters': 'l', 'litre': 'l', 'litres': 'l', 'lt': 'l',
    'l': 'l', 'ltr': 'l', 'litro': 'l', 'litros': 'l',
    'milliliter': 'ml', 'milliliters': 'ml', 'millilitre': 'ml', 'millilitres': 'ml',
    'mililiters': 'ml', 'ml': 'ml', 'mls': 'ml', 'mililitro': 'ml',
    'centiliter': 'cl', 'centiliters': 'cl', 'centilitre': 'cl', 'centilitres': 'cl',
    'cl': 'cl', 'cls': 'cl', 'centilitro': 'cl',
    'deciliter': 'dl', 'deciliters': 'dl', 'decilitre': 'dl', 'decilitres': 'dl',
    'dl': 'dl', 'dls': 'dl', 'decilitro': 'dl',
    'fluid ounce': 'fl oz', 'fl oz': 'fl oz', 'fl. oz.': 'fl oz',
    'gallon': 'gal', 'gal': 'gal', 'gallons': 'gal',
    'pint': 'pt', 'pt': 'pt', 'pints': 'pt',
    'quart': 'qt', 'qt': 'qt', 'quarts': 'qt',

    // Pieces and counts - comprehensive list
    'stuk': 'stuk', 'stuks': 'stuk', 'st': 'stuk', 'stks': 'stuk',
    'piece': 'stuk', 'pieces': 'stuk', 'pc': 'stuk', 'pcs': 'stuk',
    'item': 'stuk', 'items': 'stuk', 'each': 'stuk', 'ea': 'stuk',
    'count': 'stuk', 'ct': 'stuk', 'cnt': 'stuk', 'aantal': 'stuk',
    'unit': 'stuk', 'units': 'stuk', 'eenheid': 'stuk', 'eenheden': 'stuk',
    'single': 'stuk', 'singles': 'stuk', 'enkelvoud': 'stuk',

    // Multi-packs and specific counts
    'pack': 'stuk', 'packs': 'stuk', 'pak': 'stuk', 'pakken': 'stuk',
    'multipack': 'stuk', 'multipak': 'stuk', 'multi-pack': 'stuk',
    'duo': 'stuk', 'trio': 'stuk', 'quad': 'stuk', 'set': 'stuk',
    'twin': 'stuk', 'double': 'stuk', 'triple': 'stuk', 'dubbel': 'stuk',
    '2-pack': 'stuk', '3-pack': 'stuk', '4-pack': 'stuk', '6-pack': 'stuk',
    '8-pack': 'stuk', '10-pack': 'stuk', '12-pack': 'stuk', '24-pack': 'stuk',

    // Packaging types
    'rol': 'stuk', 'roll': 'stuk', 'rolls': 'stuk', 'rollen': 'stuk',
    'fles': 'stuk', 'bottle': 'stuk', 'bottles': 'stuk', 'flessen': 'stuk',
    'doos': 'stuk', 'box': 'stuk', 'boxes': 'stuk', 'dozen': 'stuk',
    'zak': 'stuk', 'bag': 'stuk', 'bags': 'stuk', 'zakken': 'stuk',
    'zakje': 'stuk', 'sachet': 'stuk', 'sachets': 'stuk', 'zakjes': 'stuk',
    'blik': 'stuk', 'can': 'stuk', 'cans': 'stuk', 'blikken': 'stuk',
    'pot': 'stuk', 'jar': 'stuk', 'jars': 'stuk', 'potten': 'stuk',
    'tube': 'stuk', 'tubes': 'stuk', 'tuben': 'stuk',
    'verpakking': 'stuk', 'package': 'stuk', 'packages': 'stuk',
    'pakket': 'stuk', 'packet': 'stuk', 'packets': 'stuk',
    'doseringen': 'stuk', 'dosering': 'stuk', 'dose': 'stuk', 'doses': 'stuk',
    'portion': 'stuk', 'portions': 'stuk',
    'capsule': 'stuk', 'capsules': 'stuk', 'cap': 'stuk', 'caps': 'stuk',
    'tablet': 'stuk', 'tablets': 'stuk', 'tab': 'stuk', 'tabs': 'stuk',
    'tabletten': 'stuk', 'tabletjes': 'stuk', 'pil': 'stuk', 'pillen': 'stuk',
    'plakje': 'stuk', 'plakjes': 'stuk', 'slice': 'stuk', 'slices': 'stuk',

    // Usage-based units
    'wasbeurt': 'stuk', 'wasbeurten': 'stuk', 'wash': 'stuk', 'washes': 'stuk',
    'gebruik': 'stuk', 'gebruiken': 'stuk', 'use': 'stuk', 'uses': 'stuk',
    'toepassing': 'stuk', 'toepassingen': 'stuk', 'application': 'stuk',
    'persoon': 'stuk', 'personen': 'stuk', 'pers': 'stuk', 'person': 'stuk',
    'portie_unit': 'stuk', 'porties_unit': 'stuk', 'serving': 'stuk', 'servings': 'stuk',
    'maaltijd': 'stuk', 'maaltijden': 'stuk', 'meal': 'stuk', 'meals': 'stuk',

    // Miscellaneous units
    'paar': 'stuk', 'pair': 'stuk', 'pairs': 'stuk', 'paren': 'stuk',
    'artikel': 'stuk', 'artikelen': 'stuk', 'article': 'stuk', 'articles': 'stuk',

    // Plant and produce units
    'bosje': 'stuk', 'bos': 'stuk', 'bunch': 'stuk', 'bunches': 'stuk',
    'tros': 'stuk', 'trossen': 'stuk', 'cluster': 'stuk', 'clusters': 'stuk',
    'stengel': 'stuk', 'stengels': 'stuk', 'stalk': 'stuk', 'stalks': 'stuk',
    'krop': 'stuk', 'kroppen': 'stuk', 'head': 'stuk', 'heads': 'stuk',

    // Area units
    'vierkante meter': 'm2', 'm2': 'm2', 'sq m': 'm2', 'square meter': 'm2',
    'm²': 'm2', 'sqm': 'm2', 'square meters': 'm2', 'vierkante meters': 'm2',

    // Length units
    'meter': 'm', 'm': 'm', 'meters': 'm', 'metre': 'm', 'metres': 'm',
    'centimeter': 'cm', 'cm': 'cm', 'centimeters': 'cm', 'centimetre': 'cm',
    'millimeter': 'mm', 'mm': 'mm', 'millimeters': 'mm', 'millimetre': 'mm'
  };

  /**
   * Conversion factors for standardizing quantities
   * Each category has a base unit, and all other units are converted to it
   */
  export const unitConversionFactors: Record<string, Record<string, number>> = {
    'weight': {
      'g': 1,        // base unit for weight (grams)
      'mg': 0.001,   // 1 mg = 0.001 g
      'kg': 1000,    // 1 kg = 1000 g
      'oz': 28.35,   // 1 oz = 28.35 g
      'lb': 453.59,  // 1 lb = 453.59 g
      't': 1000000   // 1 metric ton = 1,000,000 g
    },
    'volume': {
      'ml': 1,       // base unit for volume (milliliters)
      'cl': 10,      // 1 cl = 10 ml
      'dl': 100,     // 1 dl = 100 ml
      'l': 1000,     // 1 l = 1000 ml
      'fl oz': 29.57,// 1 fl oz = 29.57 ml
      'pt': 473.18,  // 1 pint = 473.18 ml
      'qt': 946.35,  // 1 quart = 946.35 ml
      'gal': 3785.41 // 1 gallon = 3785.41 ml
    },
    'length': {
      'mm': 1,       // base unit for length (millimeters)
      'cm': 10,      // 1 cm = 10 mm
      'm': 1000,     // 1 m = 1000 mm
      'in': 25.4,    // 1 inch = 25.4 mm
      'ft': 304.8    // 1 foot = 304.8 mm
    },
    'area': {
      'mm2': 1,      // base unit for area (square millimeters)
      'cm2': 100,    // 1 cm² = 100 mm²
      'm2': 1000000  // 1 m² = 1,000,000 mm²
    }
  };

  /**
   * Standard units for each measurement category
   * These are the units we normalize to
   */
  export const standardUnits = ['kg', 'l', 'stuk'];

  /**
   * Categorization of units by measurement type
   */
  export const unitCategories: Record<string, string[]> = {
    'weight': ['g', 'mg', 'kg', 'oz', 'lb', 't'],
    'volume': ['ml', 'cl', 'dl', 'l', 'fl oz', 'pt', 'qt', 'gal'],
    'length': ['mm', 'cm', 'm', 'in', 'ft'],
    'area': ['mm2', 'cm2', 'm2'],
    'piece': ['stuk']
  };

  /**
   * Determines the category of a unit
   * @param unit The unit to categorize
   * @returns The category of the unit ('weight', 'volume', 'length', 'area', or 'piece')
   */
  export function getUnitCategory(unit: string): 'weight' | 'volume' | 'length' | 'area' | 'piece' {
    const normalizedUnit = unit.toLowerCase();

    for (const [category, units] of Object.entries(unitCategories)) {
      if (units.includes(normalizedUnit)) {
        return category as 'weight' | 'volume' | 'length' | 'area' | 'piece';
      }
    }

    // If no direct match, try to infer from unit string
    if (/^(g|kg|mg|oz|lb|gram|kilo)/i.test(normalizedUnit)) {
      return 'weight';
    }

    if (/^(l|ml|cl|dl|liter|gallon|pint|quart)/i.test(normalizedUnit)) {
      return 'volume';
    }

    if (/^(m$|mm$|cm$|meter|foot|feet|inch)/i.test(normalizedUnit)) {
      return 'length';
    }

    if (/^(m2|m²|sq|square)/i.test(normalizedUnit)) {
      return 'area';
    }

    return 'piece'; // Default to piece if unknown
  }

  /**
   * Standard quantity reference units
   * These are the units we normalize to for price comparison
   */
  export const referenceUnits = {
    'weight': 'kg',  // Price per kg
    'volume': 'l',   // Price per liter
    'length': 'm',   // Price per meter
    'area': 'm2',    // Price per square meter
    'piece': 'stuk'  // Price per piece
  };

  /**
   * Convert a quantity to a standard reference unit
   * @param amount The original amount
   * @param unit The original unit
   * @returns The converted amount and unit
   */
  export function convertToReferenceUnit(
    amount: number,
    unit: string
  ): { amount: number; unit: string } {
    // Ensure we have valid inputs
    if (!amount || amount <= 0 || !unit) {
      return { amount: 1, unit: 'stuk' };
    }

    const normalizedUnit = unit.toLowerCase();
    const category = getUnitCategory(normalizedUnit);
    const referenceUnit = referenceUnits[category];

    // If the unit is already the reference unit, return as is
    if (normalizedUnit === referenceUnit) {
      return { amount, unit: referenceUnit };
    }

    try {
      switch (category) {
        case 'weight': {
          // Get conversion factor from unit to base unit (g)
          const toBaseUnit = unitConversionFactors.weight[normalizedUnit] || 1;
          // Get conversion factor from base unit to reference unit (kg)
          const fromBaseToReference = unitConversionFactors.weight[referenceUnit] || 1000;

          // Convert: amount in original unit -> amount in base unit -> amount in reference unit
          const baseAmount = amount * toBaseUnit;
          const referenceAmount = baseAmount / fromBaseToReference;

          return {
            amount: parseFloat(referenceAmount.toFixed(3)),
            unit: referenceUnit
          };
        }

        case 'volume': {
          // Get conversion factor from unit to base unit (ml)
          const toBaseUnit = unitConversionFactors.volume[normalizedUnit] || 1;
          // Get conversion factor from base unit to reference unit (l)
          const fromBaseToReference = unitConversionFactors.volume[referenceUnit] || 1000;

          // Convert: amount in original unit -> amount in base unit -> amount in reference unit
          const baseAmount = amount * toBaseUnit;
          const referenceAmount = baseAmount / fromBaseToReference;

          return {
            amount: parseFloat(referenceAmount.toFixed(3)),
            unit: referenceUnit
          };
        }

        case 'length': {
          // Get conversion factor from unit to base unit (mm)
          const toBaseUnit = unitConversionFactors.length[normalizedUnit] || 1;
          // Get conversion factor from base unit to reference unit (m)
          const fromBaseToReference = unitConversionFactors.length[referenceUnit] || 1000;

          // Convert: amount in original unit -> amount in base unit -> amount in reference unit
          const baseAmount = amount * toBaseUnit;
          const referenceAmount = baseAmount / fromBaseToReference;

          return {
            amount: parseFloat(referenceAmount.toFixed(3)),
            unit: referenceUnit
          };
        }

        case 'area': {
          // Get conversion factor from unit to base unit (mm²)
          const toBaseUnit = unitConversionFactors.area[normalizedUnit] || 1;
          // Get conversion factor from base unit to reference unit (m²)
          const fromBaseToReference = unitConversionFactors.area[referenceUnit] || 1000000;

          // Convert: amount in original unit -> amount in base unit -> amount in reference unit
          const baseAmount = amount * toBaseUnit;
          const referenceAmount = baseAmount / fromBaseToReference;

          return {
            amount: parseFloat(referenceAmount.toFixed(3)),
            unit: referenceUnit
          };
        }

        case 'piece':
        default:
          // For pieces, just return as is with the reference unit
          return {
            amount: Math.max(amount, 1), // Ensure minimum of 1 piece
            unit: referenceUnit
          };
      }
    } catch (error) {
      // If any error occurs during conversion, return a safe default
      return { amount: 1, unit: referenceUnit };
    }
  }