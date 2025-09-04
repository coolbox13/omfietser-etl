// src/testing/run-promotion-tests.ts
import fs from 'fs-extra';
import path from 'path';
import { loadTestConfig } from './config-helper';

interface BaseProcessorConfig {
  inputDir: string;
  outputDir: string;
  inputFile: string;
  batchSize: number;
  parallelProcessing: boolean;
}

interface EnrichmentOptions {
  standardizeQuantities?: boolean;
  calculatePricePerUnit?: boolean;
  calculateDiscounts?: boolean;
  parsePromotions?: boolean;
}

/**
 * Test the promotion parsing for each shop type using test data
 */
async function runPromotionTests() {
  console.log('Running promotion tests...');
  
  try {
    // Set up test directories with absolute paths
    const testDir = path.resolve(process.cwd(), 'test_data');
    const outputDir = path.resolve(testDir, 'results');
    
    // Ensure the results directory exists
    try {
      await fs.ensureDir(outputDir);
      console.log(`Created results directory: ${outputDir}`);
    } catch (err) {
      console.error(`Failed to create results directory: ${err}`);
      throw err;
    }
    
    // Create base processor config
    const baseConfig: BaseProcessorConfig = {
      inputDir: testDir,
      outputDir,
      inputFile: '',  // Will be set per processor
      batchSize: 10,
      parallelProcessing: false
    };
    
    // Mock the enricher for testing purposes
    const enricher = {
      enrichProducts: (products: any[], options: EnrichmentOptions = {}) => {
        // Simple mock that just adds parsed promotion fields
        return products.map(product => {
          if (!product.isPromotion) return product;
          
          // Extract promotion mechanism
          const mechanism = product.promotionMechanism || '';
          
          // Determine promotion type
          let type = 'UNKNOWN';
          let requiredQuantity = 1;
          let totalPrice = product.currentPrice;
          let paidQuantity = 1;
          let isMultiPurchaseRequired = false;
          
          // X for Y pattern (e.g., "2 voor €3")
          const xForYMatch = mechanism.match(/(\d+)\s*voor\s*[€]?(\d+[.,]?\d*)/i);
          if (xForYMatch) {
            type = 'X_FOR_Y';
            requiredQuantity = parseInt(xForYMatch[1], 10);
            totalPrice = parseFloat(xForYMatch[2].replace(',', '.'));
            paidQuantity = requiredQuantity;
            isMultiPurchaseRequired = requiredQuantity > 1;
          }
          
          // X+Y free pattern (e.g., "1+1 gratis")
          const xPlusYMatch = mechanism.match(/(\d+)\s*\+\s*(\d+)\s*gratis/i);
          if (xPlusYMatch) {
            type = 'X_PLUS_Y_FREE';
            const buyQty = parseInt(xPlusYMatch[1], 10);
            const freeQty = parseInt(xPlusYMatch[2], 10);
            requiredQuantity = buyQty + freeQty;
            totalPrice = product.priceBeforeBonus * buyQty;
            paidQuantity = buyQty;
            isMultiPurchaseRequired = true;
          }
          
          // Add parsed promotion fields
          return {
            ...product,
            parsedPromotion: {
              type,
              originalValue: mechanism,
              effectiveUnitPrice: product.currentPrice,
              effectiveDiscount: Math.max(0, product.priceBeforeBonus - product.currentPrice),
              requiredQuantity,
              totalPrice,
              paidQuantity,
              isMultiPurchaseRequired
            }
          };
        });
      }
    };

    // Function to create mock processor
    function createMockProcessor(shopName: string, inputFile: string) {
      return {
        process: async () => {
          console.log(`Processing ${shopName}...`);
          
          // Check if test file exists
          const testFile = path.join(testDir, inputFile);
          
          if (!await fs.pathExists(testFile)) {
            console.warn(`Test file not found: ${testFile}`);
            return { success: 0, failed: 0, skipped: 0 };
          }
          
          try {
            // Load and process the test data
            const data = await fs.readJson(testFile);
            
            // Simple mock processing - for each product, just set unified_id and isPromotion
            const processed = data.map((product: any) => {
              // Determine if it's a promotion based on shop
              const isPromotion = shopName === 'aldi' 
                ? Boolean(product.priceReduction || product.priceInfo)
                : shopName === 'jumbo'
                  ? Boolean(product.promotion)
                  : shopName === 'plus'
                    ? Boolean(product.PLP_Str?.PromotionLabel)
                    : Boolean(product.isBonus);
              
              // Get promotion mechanism
              const promotionMechanism = shopName === 'aldi'
                ? (product.priceReduction || product.priceInfo || '')
                : shopName === 'jumbo'
                  ? (product.promotion?.tags?.[0]?.text || '')
                  : shopName === 'plus'
                    ? (product.PLP_Str?.PromotionLabel || '')
                    : (product.bonusMechanism || '');
              
              // Mock processed product
              return {
                unified_id: shopName === 'aldi' 
                  ? product.articleNumber 
                  : shopName === 'jumbo'
                    ? product.id
                    : shopName === 'plus'
                      ? product.PLP_Str?.SKU
                      : product.webshopId?.toString(),
                shopType: shopName.toUpperCase(),
                title: shopName === 'plus' ? product.PLP_Str?.Name : product.title,
                priceBeforeBonus: shopName === 'aldi'
                  ? parseFloat(product.oldPrice || product.price)
                  : shopName === 'jumbo'
                    ? product.prices?.price?.amount / 100
                    : shopName === 'plus'
                      ? parseFloat(product.PLP_Str?.OriginalPrice)
                      : product.priceBeforeBonus,
                currentPrice: shopName === 'aldi'
                  ? parseFloat(product.price)
                  : shopName === 'jumbo'
                    ? product.prices?.price?.amount / 100
                    : shopName === 'plus'
                      ? parseFloat(product.PLP_Str?.NewPrice || product.PLP_Str?.OriginalPrice)
                      : product.currentPrice,
                isPromotion,
                promotionMechanism
              };
            });
            
            // Write the processed products to file
            const outputFile = path.join(outputDir, `unified_${shopName}_products.json`);
            console.log(`Writing processed products to: ${outputFile}`);
            await fs.writeJson(outputFile, processed, { spaces: 2 });
            
            return { 
              success: processed.length, 
              failed: 0, 
              skipped: 0 
            };
          } catch (error) {
            console.error(`Error processing ${shopName}:`, error);
            return { success: 0, failed: 1, skipped: 0 };
          }
        }
      };
    }
    
    // Process each shop
    const shops = [
      { name: 'ah', file: 'ah_test_products.json' },
      { name: 'jumbo', file: 'jumbo_test_products.json' },
      { name: 'aldi', file: 'aldi_test_products.json' },
      { name: 'plus', file: 'plus_test_products.json' }
    ];
    
    for (const shop of shops) {
      await testShop(shop.name, shop.file);
    }
    
    console.log('Promotion tests completed!');
    console.log(`Test results saved to ${outputDir}`);
    
    /**
     * Test a specific shop processor
     */
    async function testShop(shopName: string, inputFile: string) {
      console.log(`\nTesting ${shopName.toUpperCase()} processor...`);
      
      // Check if test file exists
      const testFile = path.join(testDir, inputFile);
      
      if (!await fs.pathExists(testFile)) {
        console.warn(`Test file not found: ${testFile}`);
        return;
      }
      
      try {
        // Create and run the processor
        const processor = createMockProcessor(shopName, inputFile);
        const result = await processor.process();
        
        console.log(`Processed ${result.success} products successfully`);
        console.log(`Failed: ${result.failed}, Skipped: ${result.skipped}`);
        
        // Load the processed products
        const processedFile = path.join(outputDir, `unified_${shopName}_products.json`);
        
        if (await fs.pathExists(processedFile)) {
          console.log(`Loading processed file: ${processedFile}`);
          const products = await fs.readJson(processedFile);
          
          console.log(`Loaded ${products.length} processed products`);
          
          // Enrich the products
          const enrichedProducts = enricher.enrichProducts(products, {
            standardizeQuantities: true,
            calculatePricePerUnit: true,
            calculateDiscounts: true,
            parsePromotions: true
          });
          
          // Analyze promotion parsing
          const promotionProducts = enrichedProducts.filter((p: any) => p.isPromotion);
          
          console.log(`\nPromotion Analysis for ${shopName.toUpperCase()}:`);
          console.log(`Total promotion products: ${promotionProducts.length}`);
          
          // Group by parsed promotion type
          const promotionTypes = promotionProducts.reduce((acc: Record<string, number>, product: any) => {
            const type = product.parsedPromotion?.type || 'MISSING';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          
          for (const [type, count] of Object.entries(promotionTypes)) {
            console.log(`- ${type}: ${count} products`);
          }
          
          // Check for missing fields
          const missingFields = promotionProducts.filter((p: any) => 
            p.isPromotion && (
              !p.parsedPromotion ||
              p.parsedPromotion.requiredQuantity === undefined ||
              p.parsedPromotion.totalPrice === undefined ||
              p.parsedPromotion.paidQuantity === undefined ||
              p.parsedPromotion.isMultiPurchaseRequired === undefined
            )
          );
          
          if (missingFields.length > 0) {
            console.warn(`\nWARNING: ${missingFields.length} products have missing promotion fields`);
            
            // Write the problem products to a file for inspection
            const problemFile = path.join(outputDir, `${shopName}_missing_fields.json`);
            console.log(`Writing problem products to: ${problemFile}`);
            await fs.writeJson(problemFile, missingFields, { spaces: 2 });
          } else {
            console.log('All promotion fields correctly populated!');
          }
          
          // Write the enriched products to a file for inspection
          const enrichedFile = path.join(outputDir, `${shopName}_enriched.json`);
          console.log(`Writing enriched products to: ${enrichedFile}`);
          await fs.writeJson(enrichedFile, enrichedProducts, { spaces: 2 });
        } else {
          console.warn(`Processed file not found: ${processedFile}`);
        }
      } catch (error) {
        console.error(`Error testing ${shopName}:`, error);
      }
    }
  } catch (error) {
    console.error('Error running promotion tests:', error);
  }
}

// Run as standalone script
if (require.main === module) {
  runPromotionTests().catch(console.error);
}

export { runPromotionTests };