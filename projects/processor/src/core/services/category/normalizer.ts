// src/core/services/category/normalizer.ts
import Levenshtein from 'fast-levenshtein';
import { getLogger } from '../../../infrastructure/logging';
import { MLPredictionService } from './prediction';
import { MLFallbackTracker } from './ml-fallback-tracker';

// The definitive final list of categories
export const FINAL_CATEGORIES = [
  'Aardappel, groente, fruit',
  'Baby en kind',
  'Bakkerij',
  'Bewuste voeding',
  'Bier en aperitieven',
  'Chips, noten, toast, popcorn',
  'Diepvries',
  'Drogisterij',
  'Frisdrank, sappen, siropen, water',
  'Gezondheid, sport',
  'Huisdier',
  'Huishouden',
  'Kaas, vleeswaren, tapas',
  'Koffie, thee',
  'Koken, tafelen, vrije tijd',
  'Ontbijtgranen en beleg',
  'Pasta, rijst en wereldkeuken',
  'Salades, pizza, maaltijden',
  'Seizoensartikelen',
  'Snoep, chocolade, koek',
  'Soepen, sauzen, kruiden, olie',
  'Tussendoortjes',
  'Vegetarisch, vegan en plantaardig',
  'Vlees, vis',
  'Wijn en bubbels',
  'Zuivel, eieren, boter'
];

type MappingMethod = 'direct' | 'partial' | 'fuzzy' | 'ml' | 'special_case';

export class CategoryNormalizer {
  private static instance: CategoryNormalizer | null = null;
  private readonly mlService: MLPredictionService;
  private readonly mlFallbackTracker: MLFallbackTracker;
  private readonly confidenceThreshold = 0.65;

  // Lazy-loaded logger to avoid initialization issues
  private get logger() {
    return getLogger();
  }

  private normalizedCategoryMap: Map<string, string> = new Map();
  private exactMatchMap: Map<string, string> = new Map();
  private commonMappings: Map<string, string> = new Map();
  private unmappedCategories: Map<string, number> = new Map();
  private allObservedCategories: Map<string, Set<string>> = new Map();
  private mappingStats: Map<MappingMethod, number> = new Map();

  constructor() {
    // Initialize mapping stats
    this.mappingStats.set('direct', 0);
    this.mappingStats.set('partial', 0);
    this.mappingStats.set('fuzzy', 0);
    this.mappingStats.set('ml', 0);
    this.mappingStats.set('special_case', 0);

    // Initialize the normalized category map for lookups
    for (const category of FINAL_CATEGORIES) {
      // Create exact match mapping (case-insensitive)
      this.exactMatchMap.set(category.toLowerCase(), category);

      // Create normalized mapping (more aggressive normalization)
      const normalized = this.normalizeString(category);
      this.normalizedCategoryMap.set(normalized, category);

      // Also add version without spaces
      const withoutSpaces = normalized.replace(/\s+/g, '');
      this.normalizedCategoryMap.set(withoutSpaces, category);
    }

    // Initialize common mapping patterns
    this.initializeCommonMappings();

    // Initialize ML Service and Fallback Tracker
    this.mlService = MLPredictionService.getInstance();
    this.mlFallbackTracker = MLFallbackTracker.getInstance();
  }

  public static getInstance(): CategoryNormalizer {
    if (!CategoryNormalizer.instance) {
      CategoryNormalizer.instance = new CategoryNormalizer();
    }
    return CategoryNormalizer.instance;
  }

  private normalizeString(str: string): string {
    if (!str) return "";
    return str
      .toLowerCase()
      .trim()
      .replace(/[,\-_\/\\()&]/g, ' ')  // Replace punctuation with spaces
      .replace(/\b(de|het|een|en|met|van|voor|bij|tot|aan|in|op|over|uit)\b/g, '')  // Remove stop words
      .replace(/\s+/g, ' ')  // Standardize multiple spaces
      .trim();
  }

  private initializeCommonMappings(): void {
    // Map common patterns to final categories
    const commonPatterns: [string, string][] = [
      // Aardappel, groente, fruit variations
      ['aardappelen groente fruit', 'Aardappel, groente, fruit'],
      ['aardappels groente fruit', 'Aardappel, groente, fruit'],
      ['groente fruit', 'Aardappel, groente, fruit'],
      ['agf', 'Aardappel, groente, fruit'],
      ['groenten', 'Aardappel, groente, fruit'],
      ['fruit', 'Aardappel, groente, fruit'],

      // Baby variations
      ['baby peuter', 'Baby en kind'],
      ['babyvoeding', 'Baby en kind'],
      ['kindervoeding', 'Baby en kind'],

      // Bakkerij variations
      ['brood', 'Bakkerij'],
      ['broodjes', 'Bakkerij'],
      ['gebak', 'Bakkerij'],
      ['banket', 'Bakkerij'],

      // Bewuste voeding variations
      ['biologisch', 'Bewuste voeding'],
      ['eco', 'Bewuste voeding'],
      ['fairtrade', 'Bewuste voeding'],
      ['glutenvrij', 'Bewuste voeding'],
      ['lactosevrij', 'Bewuste voeding'],
      ['suikervrij', 'Bewuste voeding'],

      // Bier variations
      ['speciaalbier', 'Bier en aperitieven'],
      ['pils', 'Bier en aperitieven'],
      ['alcohol', 'Bier en aperitieven'],
      ['aperitieven', 'Bier en aperitieven'],

      // Chips variations
      ['chips', 'Chips, noten, toast, popcorn'],
      ['noten', 'Chips, noten, toast, popcorn'],
      ['pinda', 'Chips, noten, toast, popcorn'],
      ['popcorn', 'Chips, noten, toast, popcorn'],
      ['toast', 'Chips, noten, toast, popcorn'],
      ['zoutjes', 'Chips, noten, toast, popcorn'],

      // Diepvries variations
      ['bevroren', 'Diepvries'],
      ['frozen', 'Diepvries'],
      ['ijsjes', 'Diepvries'],

      // Drogisterij variations
      ['drogist', 'Drogisterij'],
      ['drogisterij artikelen', 'Drogisterij'],
      ['verzorging', 'Drogisterij'],
      ['persoonlijke verzorging', 'Drogisterij'],

      // Frisdrank variations
      ['frisdrank', 'Frisdrank, sappen, siropen, water'],
      ['dranken', 'Frisdrank, sappen, siropen, water'],
      ['sap', 'Frisdrank, sappen, siropen, water'],
      ['sappen', 'Frisdrank, sappen, siropen, water'],
      ['siroop', 'Frisdrank, sappen, siropen, water'],
      ['water', 'Frisdrank, sappen, siropen, water'],
      ['limonade', 'Frisdrank, sappen, siropen, water'],

      // Gezondheid variations
      ['gezond', 'Gezondheid, sport'],
      ['sport', 'Gezondheid, sport'],
      ['vitamine', 'Gezondheid, sport'],
      ['supplementen', 'Gezondheid, sport'],

      // Huisdier variations
      ['dier', 'Huisdier'],
      ['hond', 'Huisdier'],
      ['kat', 'Huisdier'],
      ['diervoeding', 'Huisdier'],
      ['dierenvoer', 'Huisdier'],

      // Huishouden variations
      ['schoonmaak', 'Huishouden'],
      ['wasmiddel', 'Huishouden'],
      ['afwasmiddel', 'Huishouden'],
      ['schoonmaakmiddel', 'Huishouden'],
      ['huishoudelijk', 'Huishouden'],
      ['wassen', 'Huishouden'],

      // Kaas variations
      ['kaas', 'Kaas, vleeswaren, tapas'],
      ['vleeswaren', 'Kaas, vleeswaren, tapas'],
      ['worst', 'Kaas, vleeswaren, tapas'],
      ['tapas', 'Kaas, vleeswaren, tapas'],
      ['delicatessen', 'Kaas, vleeswaren, tapas'],

      // Koffie variations
      ['koffie', 'Koffie, thee'],
      ['thee', 'Koffie, thee'],

      // Koken variations
      ['koken', 'Koken, tafelen, vrije tijd'],
      ['tafelen', 'Koken, tafelen, vrije tijd'],
      ['vrije tijd', 'Koken, tafelen, vrije tijd'],
      ['keuken', 'Koken, tafelen, vrije tijd'],
      ['keukengerei', 'Koken, tafelen, vrije tijd'],
      ['non food', 'Koken, tafelen, vrije tijd'],

      // Ontbijt variations
      ['ontbijt', 'Ontbijtgranen en beleg'],
      ['beleg', 'Ontbijtgranen en beleg'],
      ['granen', 'Ontbijtgranen en beleg'],
      ['cornflakes', 'Ontbijtgranen en beleg'],
      ['muesli', 'Ontbijtgranen en beleg'],
      ['hagelslag', 'Ontbijtgranen en beleg'],
      ['jam', 'Ontbijtgranen en beleg'],

      // Pasta variations
      ['pasta', 'Pasta, rijst en wereldkeuken'],
      ['rijst', 'Pasta, rijst en wereldkeuken'],
      ['wereldkeuken', 'Pasta, rijst en wereldkeuken'],
      ['aziatisch', 'Pasta, rijst en wereldkeuken'],
      ['mexicaans', 'Pasta, rijst en wereldkeuken'],
      ['italiaans', 'Pasta, rijst en wereldkeuken'],

      // Salades variations
      ['salades', 'Salades, pizza, maaltijden'],
      ['pizza', 'Salades, pizza, maaltijden'],
      ['maaltijd', 'Salades, pizza, maaltijden'],
      ['kant klaar', 'Salades, pizza, maaltijden'],
      ['koelvers', 'Salades, pizza, maaltijden'],
      ['ready to eat', 'Salades, pizza, maaltijden'],

      // Seizoensartikelen variations
      ['seizoen', 'Seizoensartikelen'],
      ['kerst', 'Seizoensartikelen'],
      ['paas', 'Seizoensartikelen'],
      ['pasen', 'Seizoensartikelen'],
      ['sint', 'Seizoensartikelen'],
      ['sinterklaas', 'Seizoensartikelen'],
      ['bbq', 'Seizoensartikelen'],
      ['feest', 'Seizoensartikelen'],

      // Snoep variations
      ['snoep', 'Snoep, chocolade, koek'],
      ['chocolade', 'Snoep, chocolade, koek'],
      ['koek', 'Snoep, chocolade, koek'],
      ['koekjes', 'Snoep, chocolade, koek'],
      ['zoetwaren', 'Snoep, chocolade, koek'],

      // Soepen variations
      ['soep', 'Soepen, sauzen, kruiden, olie'],
      ['saus', 'Soepen, sauzen, kruiden, olie'],
      ['sauzen', 'Soepen, sauzen, kruiden, olie'],
      ['kruiden', 'Soepen, sauzen, kruiden, olie'],
      ['specerijen', 'Soepen, sauzen, kruiden, olie'],
      ['olie', 'Soepen, sauzen, kruiden, olie'],
      ['azijn', 'Soepen, sauzen, kruiden, olie'],
      ['conserven', 'Soepen, sauzen, kruiden, olie'],

      // Tussendoortjes variations
      ['tussendoor', 'Tussendoortjes'],
      ['snack', 'Tussendoortjes'],
      ['koeken', 'Tussendoortjes'],
      ['repen', 'Tussendoortjes'],

      // Vegetarisch variations
      ['vegetarisch', 'Vegetarisch, vegan en plantaardig'],
      ['vegan', 'Vegetarisch, vegan en plantaardig'],
      ['veggie', 'Vegetarisch, vegan en plantaardig'],
      ['veganistisch', 'Vegetarisch, vegan en plantaardig'],
      ['plantaardig', 'Vegetarisch, vegan en plantaardig'],
      ['vega', 'Vegetarisch, vegan en plantaardig'],

      // Vlees variations
      ['vlees', 'Vlees, vis'],
      ['kip', 'Vlees, vis'],
      ['rundvlees', 'Vlees, vis'],
      ['varkensvlees', 'Vlees, vis'],
      ['gehakt', 'Vlees, vis'],
      ['vis', 'Vlees, vis'],
      ['zeevruchten', 'Vlees, vis'],
      ['seafood', 'Vlees, vis'],

      // Wijn variations
      ['wijn', 'Wijn en bubbels'],
      ['bubbels', 'Wijn en bubbels'],
      ['champagne', 'Wijn en bubbels'],
      ['prosecco', 'Wijn en bubbels'],
      ['cava', 'Wijn en bubbels'],

      // Zuivel variations
      ['zuivel', 'Zuivel, eieren, boter'],
      ['melk', 'Zuivel, eieren, boter'],
      ['yoghurt', 'Zuivel, eieren, boter'],
      ['boter', 'Zuivel, eieren, boter'],
      ['margarine', 'Zuivel, eieren, boter'],
      ['eieren', 'Zuivel, eieren, boter'],
      ['kaas', 'Zuivel, eieren, boter'],
      ['dairy', 'Zuivel, eieren, boter'],

      // Special case for "trotsvanaldi"
      ['trotsvanaldi', 'Aardappel, groente, fruit'],
      ['trots van aldi', 'Aardappel, groente, fruit'],

      // === ALDI-SPECIFIC CATEGORY MAPPINGS ===
      // ALDI: "bier-en-likeuren" → "Bier en aperitieven"
      ['bier likeuren', 'Bier en aperitieven'],
      ['bier en likeuren', 'Bier en aperitieven'],

      // ALDI: "zonnebrand" → "Drogisterij"
      ['zonnebrand', 'Drogisterij'],

      // === AH-SPECIFIC CATEGORY MAPPINGS ===
      // These mappings fix the AH category mismatch issue that was causing ML prediction fallback

      // AH: "Groente, aardappelen" → "Aardappel, groente, fruit"
      ['groente aardappelen', 'Aardappel, groente, fruit'],
      ['groente aardappel', 'Aardappel, groente, fruit'],

      // AH: "Fruit, verse sappen" → "Aardappel, groente, fruit"
      ['fruit verse sappen', 'Aardappel, groente, fruit'],
      ['verse sappen', 'Aardappel, groente, fruit'],

      // AH: "Bier, wijn, aperitieven" → Split mapping
      ['bier wijn aperitieven', 'Bier en aperitieven'], // Default to beer category

      // AH: "Koek, snoep, chocolade" → "Snoep, chocolade, koek"
      ['koek snoep chocolade', 'Snoep, chocolade, koek'],

      // AH: "Borrel, chips, snacks" → "Chips, noten, toast, popcorn"
      ['borrel chips snacks', 'Chips, noten, toast, popcorn'],
      ['borrel', 'Chips, noten, toast, popcorn'],
      ['snacks', 'Chips, noten, toast, popcorn'],

      // AH: "Frisdrank, sappen, water" → "Frisdrank, sappen, siropen, water"
      ['frisdrank sappen water', 'Frisdrank, sappen, siropen, water'],

      // AH: "Soepen, sauzen, kruiden, olie" → Exact match (already correct)

      // AH: "Gezondheid en sport" → "Gezondheid, sport"
      ['gezondheid sport', 'Gezondheid, sport'],

      // AH: "Zuivel, eieren" → "Zuivel, eieren, boter"
      ['zuivel eieren', 'Zuivel, eieren, boter'],

      // AH: "Maaltijden, salades" → "Salades, pizza, maaltijden"
      ['maaltijden salades', 'Salades, pizza, maaltijden'],

      // AH: "Ontbijtgranen, beleg" → "Ontbijtgranen en beleg"
      ['ontbijtgranen beleg', 'Ontbijtgranen en beleg'],

      // AH: "Vis, schaal- en schelpdieren" → "Vlees, vis"
      ['vis schaal schelpdieren', 'Vlees, vis'],
      ['schaal schelpdieren', 'Vlees, vis'],
      ['schelpdieren', 'Vlees, vis'],

      // AH: "Bewuste voeding" → Exact match (already correct)

      // AH: "Vegetarisch, vegan" → "Vegetarisch, vegan en plantaardig"
      ['vegetarisch vegan', 'Vegetarisch, vegan en plantaardig'],

      // AH: "Huisdieren" → "Huisdier"
      ['huisdieren', 'Huisdier'],

      // AH: "Seizoen" → "Seizoensartikelen"
      ['seizoen', 'Seizoensartikelen']
    ];

    // Add all patterns to the map
    for (const [pattern, targetCategory] of commonPatterns) {
      // Verify the target is in our final categories
      if (!FINAL_CATEGORIES.includes(targetCategory)) {
        this.logger.error(`Invalid target category in mappings: "${targetCategory}"`);
        continue;
      }

      // Add normalized pattern
      const normalizedPattern = this.normalizeString(pattern);
      this.commonMappings.set(normalizedPattern, targetCategory);
    }
  }

  public normalizeCategory(
    title: string,
    currentCategory: string,
    shopType: string
  ): string {
    try {
      // Track the observed category
      if (currentCategory) {
        this.trackObservedCategory(currentCategory, shopType);
      }

      if (!currentCategory || currentCategory.trim() === '') {
        if (title) {
          return this.getMlPredictionOrFallback(title, 'Aardappel, groente, fruit', shopType);
        }
        return 'Aardappel, groente, fruit';
      }

      // Method 1: Check for exact match in final categories (case-insensitive)
      const exactMatch = this.exactMatchMap.get(currentCategory.toLowerCase());
      if (exactMatch) {
        this.incrementMappingStats('direct');
        return exactMatch;
      }

      // Method 2: Normalize and check against normalized map
      const normalizedInput = this.normalizeString(currentCategory);
      const normalizedMatch = this.normalizedCategoryMap.get(normalizedInput);
      if (normalizedMatch) {
        this.incrementMappingStats('direct');
        return normalizedMatch;
      }

      // Method 3: Check common mapping patterns
      const commonMatch = this.commonMappings.get(normalizedInput);
      if (commonMatch) {
        this.incrementMappingStats('direct');
        return commonMatch;
      }

      // Method 4: Try partial matches within normalized input
      for (const [pattern, target] of this.commonMappings.entries()) {
        if (normalizedInput.includes(pattern) || pattern.includes(normalizedInput)) {
          this.incrementMappingStats('partial');
          return target;
        }
      }

      // Method 5: Special case for Aldi "trots" categories
      if (shopType === 'ALDI' &&
          (normalizedInput.includes('trots') || normalizedInput.includes('aldi'))) {
        // Try ML for these special cases if we have a title
        if (title) {
          const prediction = this.mlService.getPrediction(title, 0.4); // Lower threshold for special cases
          if (prediction) {
            const predictedCategory = this.mapMlPredictionToFinalCategory(prediction.category);
            this.incrementMappingStats('special_case');
            return predictedCategory;
          }
        }
        // Default fallback for Aldi trots products
        return 'Aardappel, groente, fruit';
      }

      // Method 6: Try ML prediction if available
      if (title) {
        const prediction = this.mlService.getPrediction(title, this.confidenceThreshold);
        if (prediction) {
          const predictedCategory = this.mapMlPredictionToFinalCategory(prediction.category);
          this.incrementMappingStats('ml');

          // Track ML fallback usage
          this.mlFallbackTracker.trackMLFallback({
            shopType,
            originalCategory: currentCategory,
            productTitle: title.substring(0, 100), // Limit title length
            mlPrediction: prediction.category,
            mlConfidence: prediction.confidence,
            finalCategory: predictedCategory,
            mappingMethod: 'ml'
          });

          return predictedCategory;
        }
      }

      // Method 7: Use fuzzy matching as final fallback
      const fuzzyMatch = this.findBestCategoryMatch(currentCategory);
      this.incrementMappingStats('fuzzy');

      // Track fuzzy fallback usage
      this.mlFallbackTracker.trackMLFallback({
        shopType,
        originalCategory: currentCategory,
        productTitle: title?.substring(0, 100) || 'No title',
        finalCategory: fuzzyMatch,
        mappingMethod: 'fuzzy_fallback'
      });

      return fuzzyMatch;

    } catch (error) {
      this.logger.error('Error normalizing category', {
        context: {
          title: title?.substring(0, 50),
          currentCategory,
          shopType,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
      return 'Aardappel, groente, fruit'; // Safe default fallback
    }
  }

  private mapMlPredictionToFinalCategory(mlCategory: string): string {
    // Check if the ML prediction is already a final category
    if (FINAL_CATEGORIES.includes(mlCategory)) {
      return mlCategory;
    }

    // Try to map it to a final category
    const normalizedMlCategory = this.normalizeString(mlCategory);

    // Check normalized category map
    const normalizedMatch = this.normalizedCategoryMap.get(normalizedMlCategory);
    if (normalizedMatch) {
      return normalizedMatch;
    }

    // Check common mappings
    const commonMatch = this.commonMappings.get(normalizedMlCategory);
    if (commonMatch) {
      return commonMatch;
    }

    // Try partial matches
    for (const [pattern, target] of this.commonMappings.entries()) {
      if (normalizedMlCategory.includes(pattern) || pattern.includes(normalizedMlCategory)) {
        return target;
      }
    }

    // Fallback to fuzzy matching
    return this.findBestCategoryMatch(mlCategory);
  }

  private findBestCategoryMatch(category: string): string {
    const normalizedInput = this.normalizeString(category);
    let bestMatch = 'Aardappel, groente, fruit'; // Default fallback
    let bestScore = 0;

    for (const finalCategory of FINAL_CATEGORIES) {
      const normalizedFinal = this.normalizeString(finalCategory);
      const score = this.calculateFuzzyMatchScore(normalizedInput, normalizedFinal);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = finalCategory;
      }
    }

    return bestMatch;
  }

  private calculateFuzzyMatchScore(a: string, b: string): number {
    if (!a || !b) return 0;
    const distance = Levenshtein.get(a, b);
    return 1 - (distance / Math.max(a.length, b.length));
  }

  private getMlPredictionOrFallback(title: string, fallback: string, shopType: string = 'UNKNOWN'): string {
    if (!title) return fallback;

    const prediction = this.mlService.getPrediction(title, this.confidenceThreshold);
    if (prediction) {
      const predictedCategory = this.mapMlPredictionToFinalCategory(prediction.category);

      // Track ML fallback usage for empty categories
      this.mlFallbackTracker.trackMLFallback({
        shopType,
        originalCategory: '', // Empty category case
        productTitle: title.substring(0, 100),
        mlPrediction: prediction.category,
        mlConfidence: prediction.confidence,
        finalCategory: predictedCategory,
        mappingMethod: 'ml'
      });

      return predictedCategory;
    }
    return fallback;
  }

  private incrementMappingStats(method: MappingMethod): void {
    const current = this.mappingStats.get(method) || 0;
    this.mappingStats.set(method, current + 1);
  }

  private trackObservedCategory(category: string, shopType: string): void {
    let shopCategories = this.allObservedCategories.get(shopType);
    if (!shopCategories) {
      shopCategories = new Set<string>();
      this.allObservedCategories.set(shopType, shopCategories);
    }
    shopCategories.add(category);
  }

  private trackUnmappedCategory(category: string, shopType: string): void {
    const key = `${shopType}:${category}`;
    const count = (this.unmappedCategories.get(key) || 0) + 1;
    this.unmappedCategories.set(key, count);
  }

  public generateCategoryMappingReport(): string {
    let report = "Category Mapping Report:\n";
    report += "=====================\n\n";

    report += "Final Categories:\n";
    FINAL_CATEGORIES.forEach(category => {
      report += `  - ${category}\n`;
    });

    report += "\nMapping Statistics:\n";
    for (const [method, count] of this.mappingStats.entries()) {
      report += `  ${method}: ${count}\n`;
    }

    return report;
  }

  public generateObservedCategoriesReport(): string {
    let report = "Observed Categories Report:\n";
    report += "========================\n\n";

    // Sort categories for consistent output
    const sortedCategories = Array.from(this.allObservedCategories.entries())
      .sort((a, b) => a[0].localeCompare(b[0]));

    sortedCategories.forEach(([category, shops]) => {
      report += `Category: ${category}\n`;
      report += `  Observed in shops: ${Array.from(shops).join(', ')}\n\n`;
    });

    return report;
  }

  public getUnmappedCategoriesReport(): Record<string, number> {
    return Object.fromEntries(this.unmappedCategories);
  }

  public getAllObservedCategories(): Map<string, Set<string>> {
    return this.allObservedCategories;
  }

  public getUnmappedCategories(): Map<string, number> {
    return this.unmappedCategories;
  }

  public getFinalCategories(): string[] {
    return [...FINAL_CATEGORIES];
  }

  /**
   * Clean up resources and reset the singleton instance
   * Used primarily for testing to prevent memory leaks
   */
  public static cleanup(): void {
    if (CategoryNormalizer.instance) {
      CategoryNormalizer.instance.normalizedCategoryMap.clear();
      CategoryNormalizer.instance.exactMatchMap.clear();
      CategoryNormalizer.instance.commonMappings.clear();
      CategoryNormalizer.instance.unmappedCategories.clear();
      CategoryNormalizer.instance.allObservedCategories.clear();
      CategoryNormalizer.instance.mappingStats.clear();
      CategoryNormalizer.instance = null;
    }
  }
}
