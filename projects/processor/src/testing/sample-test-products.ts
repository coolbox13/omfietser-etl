// src/testing/sample-test-products.ts
import fs from 'fs-extra';
import path from 'path';
import { loadTestConfig } from './config-helper';

interface Shop {
  inputFile: string;
  webshopId: number;
}

interface ShopConfig {
  [key: string]: Shop;
}

interface PromotionCategory {
  type: string;
  matches: (promotionMechanism: string) => boolean;
  samples: any[];
}

/**
 * Extract promotion type from mechanism text
 */
function getPromotionType(mechanism: string): string {
  if (!mechanism) return 'UNKNOWN';
  
  const normalized = mechanism.toLowerCase().trim();
  
  // X for Y pattern
  if (normalized.match(/(\d+)\s*voor\s*[€]?(\d+[.,]?\d*)/i)) {
    return 'X_FOR_Y';
  }
  
  // X+Y free pattern
  if (normalized.match(/(\d+)\s*\+\s*(\d+)\s*gratis/i)) {
    return 'X_PLUS_Y_FREE';
  }
  
  // Percentage discount
  if (normalized.match(/(\d+)%\s*korting|-\s*(\d+)%/i)) {
    return 'PERCENTAGE_DISCOUNT';
  }
  
  // Second half price
  if (normalized.match(/2e\s+halve\s+prijs/i)) {
    return 'SECOND_HALF_PRICE';
  }
  
  // Second free
  if (normalized.match(/2e\s+gratis/i)) {
    return 'SECOND_FREE';
  }
  
  // ALDI specific - price reduced
  if (normalized.match(/prijs\s+verlaagd/i)) {
    return 'PRICE_REDUCTION';
  }
  
  return 'UNKNOWN';
}

/**
 * Samples products from each shop, ensuring coverage of all promotion types
 */
async function sampleTestProducts() {
  console.log('Sampling test products...');
  
  try {
    // Load configuration
    const config = await loadTestConfig();
    const inputDir = config.directories.input;
    const shops: ShopConfig = config.shops;
    
    // Create output directory
    const outputDir = path.join(process.cwd(), 'test_data');
    await fs.ensureDir(outputDir);
    
    // Process each shop
    for (const [shopName, shop] of Object.entries(shops)) {
      console.log(`Processing ${shopName}...`);
      
      const inputFile = path.join(inputDir, shop.inputFile);
      
      if (!await fs.pathExists(inputFile)) {
        console.warn(`Input file not found: ${inputFile}`);
        continue;
      }
      
      // Read and parse products
      const fileContent = await fs.readFile(inputFile, 'utf8');
      const products = JSON.parse(fileContent);
      
      console.log(`Found ${products.length} products for ${shopName}`);
      
      // Categories for sampling
      const nonPromotion: any[] = [];
      const promotionCategories: PromotionCategory[] = [
        {
          type: 'X_FOR_Y',
          matches: (m) => getPromotionType(m) === 'X_FOR_Y',
          samples: []
        },
        {
          type: 'X_PLUS_Y_FREE',
          matches: (m) => getPromotionType(m) === 'X_PLUS_Y_FREE',
          samples: []
        },
        {
          type: 'PERCENTAGE_DISCOUNT',
          matches: (m) => getPromotionType(m) === 'PERCENTAGE_DISCOUNT',
          samples: []
        },
        {
          type: 'SECOND_HALF_PRICE',
          matches: (m) => getPromotionType(m) === 'SECOND_HALF_PRICE',
          samples: []
        },
        {
          type: 'SECOND_FREE',
          matches: (m) => getPromotionType(m) === 'SECOND_FREE',
          samples: []
        },
        {
          type: 'PRICE_REDUCTION',
          matches: (m) => getPromotionType(m) === 'PRICE_REDUCTION',
          samples: []
        },
        {
          type: 'UNKNOWN',
          matches: (m) => getPromotionType(m) === 'UNKNOWN',
          samples: []
        }
      ];
      
      // Categorize products
      for (const product of products) {
        // Handle different shop structures
        const isPromotion = shopName === 'aldi' 
          ? Boolean(product.priceReduction || product.priceInfo)
          : Boolean(product.isBonus || product.promotion);
        
        const promotionMechanism = shopName === 'aldi'
          ? (product.priceReduction || product.priceInfo || '')
          : shopName === 'jumbo'
            ? (product.promotion?.tags?.[0]?.text || '')
            : shopName === 'plus'
              ? (product.PLP_Str?.PromotionLabel || '')
              : (product.bonusMechanism || '');
        
        if (!isPromotion) {
          nonPromotion.push(product);
          continue;
        }
        
        // Find matching promotion category
        for (const category of promotionCategories) {
          if (category.matches(promotionMechanism)) {
            category.samples.push(product);
            break;
          }
        }
      }
      
      // Sample products from each category
      const sampledProducts: any[] = [];
      
      // Add non-promotion sample
      if (nonPromotion.length > 0) {
        const randomIndex = Math.floor(Math.random() * nonPromotion.length);
        sampledProducts.push(nonPromotion[randomIndex]);
        console.log(`Added non-promotion sample`);
      }
      
      // Add samples from each promotion category
      for (const category of promotionCategories) {
        if (category.samples.length > 0) {
          const randomIndex = Math.floor(Math.random() * category.samples.length);
          sampledProducts.push(category.samples[randomIndex]);
          console.log(`Added ${category.type} promotion sample (found ${category.samples.length})`);
        } else {
          console.log(`No samples found for ${category.type}`);
        }
      }
      
      // Write sampled products to file
      if (sampledProducts.length > 0) {
        const outputFile = path.join(outputDir, shop.inputFile);
        await fs.writeJson(outputFile, sampledProducts, { spaces: 2 });
        console.log(`Wrote ${sampledProducts.length} sample products to ${outputFile}`);
      }
    }
    
    console.log('Sampling completed!');
    console.log(`Test files saved to ${outputDir}`);
    
  } catch (error) {
    console.error('Error sampling test products:', error);
  }
}

// Enhanced version that creates separate files for each promotion type
async function sampleTestProductsDetailed() {
  console.log('Sampling test products with detailed categorization...');
  
  try {
    // Load configuration
    const config = await loadTestConfig();
    const inputDir = config.directories.input;
    const shops: ShopConfig = config.shops;
    
    // Create output directory
    const outputDir = path.join(process.cwd(), 'test_data');
    await fs.ensureDir(outputDir);
    
    // Process each shop
    for (const [shopName, shop] of Object.entries(shops)) {
      console.log(`Processing ${shopName}...`);
      
      const inputFile = path.join(inputDir, shop.inputFile);
      
      if (!await fs.pathExists(inputFile)) {
        console.warn(`Input file not found: ${inputFile}`);
        continue;
      }
      
      // Read and parse products
      const fileContent = await fs.readFile(inputFile, 'utf8');
      const products = JSON.parse(fileContent);
      
      console.log(`Found ${products.length} products for ${shopName}`);
      
      // Create shop directory
      const shopDir = path.join(outputDir, shopName);
      await fs.ensureDir(shopDir);
      
      // Categories for sampling
      interface SampleCategory {
        type: string;
        isPromotion: boolean;
        promotionType: string;
        samples: any[];
      }
      
      const categories: SampleCategory[] = [
        { type: 'non_promotion', isPromotion: false, promotionType: '', samples: [] },
        { type: 'x_for_y', isPromotion: true, promotionType: 'X_FOR_Y', samples: [] },
        { type: 'x_plus_y_free', isPromotion: true, promotionType: 'X_PLUS_Y_FREE', samples: [] },
        { type: 'percentage_discount', isPromotion: true, promotionType: 'PERCENTAGE_DISCOUNT', samples: [] },
        { type: 'second_half_price', isPromotion: true, promotionType: 'SECOND_HALF_PRICE', samples: [] },
        { type: 'second_free', isPromotion: true, promotionType: 'SECOND_FREE', samples: [] },
        { type: 'price_reduction', isPromotion: true, promotionType: 'PRICE_REDUCTION', samples: [] },
        { type: 'unknown_promotion', isPromotion: true, promotionType: 'UNKNOWN', samples: [] }
      ];
      
      // Categorize products
      for (const product of products) {
        // Handle different shop structures
        const isPromotion = shopName === 'aldi' 
          ? Boolean(product.priceReduction || product.priceInfo)
          : Boolean(product.isBonus || product.promotion);
        
        const promotionMechanism = shopName === 'aldi'
          ? (product.priceReduction || product.priceInfo || '')
          : shopName === 'jumbo'
            ? (product.promotion?.tags?.[0]?.text || '')
            : shopName === 'plus'
              ? (product.PLP_Str?.PromotionLabel || '')
              : (product.bonusMechanism || '');
        
        if (!isPromotion) {
          categories[0].samples.push(product);
          continue;
        }
        
        const promotionType = getPromotionType(promotionMechanism);
        
        // Find matching category
        const matchingCategory = categories.find(c => 
          c.isPromotion && c.promotionType === promotionType
        );
        
        if (matchingCategory) {
          matchingCategory.samples.push(product);
        } else {
          categories.find(c => c.type === 'unknown_promotion')?.samples.push(product);
        }
      }
      
      // Sample products from each category and write to files
      for (const category of categories) {
        if (category.samples.length > 0) {
          // Sample up to 5 products from this category (or all if less than 5)
          const sampleCount = Math.min(5, category.samples.length);
          const sampledProducts: any[] = [];
          
          // Create a copy of samples array to avoid modifying original
          const availableSamples = [...category.samples];
          
          for (let i = 0; i < sampleCount; i++) {
            const randomIndex = Math.floor(Math.random() * availableSamples.length);
            sampledProducts.push(availableSamples[randomIndex]);
            availableSamples.splice(randomIndex, 1);
            
            if (availableSamples.length === 0) break;
          }
          
          // Write samples to file
          const outputFile = path.join(shopDir, `${category.type}.json`);
          await fs.writeJson(outputFile, sampledProducts, { spaces: 2 });
          
          console.log(`${shopName}: Wrote ${sampledProducts.length} samples for ${category.type} (from ${category.samples.length} available)`);
        } else {
          console.log(`${shopName}: No samples found for ${category.type}`);
        }
      }
      
      // Also create a combined file with one sample from each category
      const combinedSamples: any[] = [];
      
      for (const category of categories) {
        if (category.samples.length > 0) {
          const randomIndex = Math.floor(Math.random() * category.samples.length);
          combinedSamples.push(category.samples[randomIndex]);
        }
      }
      
      if (combinedSamples.length > 0) {
        const combinedFile = path.join(outputDir, `${shopName}_test_products.json`);
        await fs.writeJson(combinedFile, combinedSamples, { spaces: 2 });
        console.log(`Created combined test file with ${combinedSamples.length} samples for ${shopName}`);
      }
    }
    
    console.log('Detailed sampling completed!');
    console.log(`Test files saved to ${outputDir}`);
    
  } catch (error) {
    console.error('Error sampling test products:', error);
  }
}

// Run as standalone script
if (require.main === module) {
  // Choose which version to run
  // sampleTestProducts().catch(console.error);
  sampleTestProductsDetailed().catch(console.error);
}

export { sampleTestProducts, sampleTestProductsDetailed };