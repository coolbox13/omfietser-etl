// src/testing/simple-sample-products.ts
import fs from 'fs-extra';
import path from 'path';

/**
 * Simple implementation to extract test samples from product data files
 * without dependencies on other project modules
 */
async function sampleProducts() {
  try {
    console.log('Starting simple product sampling...');

    // Define paths
    const inputDir = path.join(process.cwd(), 'data_in');
    const outputDir = path.join(process.cwd(), 'test_data');
    await fs.ensureDir(outputDir);

    // Shop configuration
    const shops = {
      ah: { file: 'ah_products.json' },
      jumbo: { file: 'jumbo_products.json' },
      aldi: { file: 'aldi_products.json' },
      plus: { file: 'plus_products.json' }
    };

    // Process each shop
    for (const [shopName, shop] of Object.entries(shops)) {
      console.log(`Processing ${shopName}...`);

      const inputFile = path.join(inputDir, shop.file);

      if (!await fs.pathExists(inputFile)) {
        console.warn(`Input file not found: ${inputFile}`);
        continue;
      }

      try {
        // Read file
        const data = await fs.readJson(inputFile);

        if (!Array.isArray(data)) {
          console.warn(`Data in ${inputFile} is not an array`);
          continue;
        }

        console.log(`Found ${data.length} products for ${shopName}`);

        // Create shop directory
        const shopDir = path.join(outputDir, shopName);
        await fs.ensureDir(shopDir);

        // Sample categories
        const samples: Record<string, any[]> = {
          regular: [],    // Non-promotion products
          discount: [],   // Percentage discount
          multipack: [],  // X for Y or X+Y free
          other: []       // Other promotions
        };

        // Process all products
        for (const product of data) {
          // Determine if product is a promotion
          const isPromotion = getPromotionFlag(product, shopName);

          if (!isPromotion) {
            // Regular product
            if (samples.regular.length < 5) {
              samples.regular.push(product);
            }
            continue;
          }

          // Get promotion text
          const promotionText = getPromotionText(product, shopName).toLowerCase();

          // Categorize by promotion pattern
          if (promotionText.includes('%') || promotionText.includes('korting')) {
            if (samples.discount.length < 5) {
              samples.discount.push(product);
            }
          } else if (promotionText.match(/\d+\s*voor/) || promotionText.match(/\d+\s*\+\s*\d+/)) {
            if (samples.multipack.length < 5) {
              samples.multipack.push(product);
            }
          } else {
            if (samples.other.length < 5) {
              samples.other.push(product);
            }
          }
        }

        // Save samples by category
        for (const [category, categoryProducts] of Object.entries(samples)) {
          if (categoryProducts.length > 0) {
            const outputFile = path.join(shopDir, `${category}.json`);
            await fs.writeJson(outputFile, categoryProducts, { spaces: 2 });
            console.log(`Saved ${categoryProducts.length} ${category} products for ${shopName}`);
          }
        }

        // Create combined sample
        const combined = [];

        // Add one from each category if available
        for (const categoryProducts of Object.values(samples)) {
          if (categoryProducts.length > 0) {
            combined.push(categoryProducts[0]);
          }
        }

        if (combined.length > 0) {
          const combinedFile = path.join(outputDir, `${shopName}_test_products.json`);
          await fs.writeJson(combinedFile, combined, { spaces: 2 });
          console.log(`Created combined sample with ${combined.length} products for ${shopName}`);
        }

      } catch (error) {
        console.error(`Error processing ${shopName}:`, error);
      }
    }

    console.log('Simple sampling complete!');
    console.log(`Test data saved to ${outputDir}`);

  } catch (error) {
    console.error('Error sampling products:', error);
  }
}

/**
 * Determine if a product is a promotion based on shop-specific fields
 */
function getPromotionFlag(product: any, shopName: string): boolean {
  switch(shopName) {
    case 'ah':
      return Boolean(product.isBonus);
    case 'jumbo':
      return Boolean(product.promotion);
    case 'aldi':
      return Boolean(product.priceReduction || product.priceInfo);
    case 'plus':
      return Boolean(product.PLP_Str?.PromotionLabel);
    default:
      return false;
  }
}

/**
 * Extract promotion text from a product based on shop-specific fields
 */
function getPromotionText(product: any, shopName: string): string {
  switch(shopName) {
    case 'ah':
      return product.bonusMechanism || '';
    case 'jumbo':
      return product.promotion?.tags?.[0]?.text || '';
    case 'aldi':
      return product.priceReduction || product.priceInfo || '';
    case 'plus':
      return product.PLP_Str?.PromotionLabel || '';
    default:
      return '';
  }
}

// Run as standalone script
if (require.main === module) {
  sampleProducts().catch(console.error);
}

export { sampleProducts };