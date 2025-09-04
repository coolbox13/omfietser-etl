#!/usr/bin/env node
// src/scripts/validate-data.ts

import fs from 'fs-extra';
import path from 'path';
import { program } from 'commander';
import { UnifiedProduct } from '../types';
import { ProductValidator } from '../utils/validation/product-validator';
import { initializeLogger, getLogger, LogLevel } from '../infrastructure/logging';
import { createConfig } from '../config';

// Initialize the validator
const validator = new ProductValidator();

async function main() {
  // Set up command-line arguments
  program
    .name('validate-data')
    .description('Validate unified product data')
    .option('-s, --shop <shop>', 'Specify shop to validate (ah, jumbo, aldi, plus)')
    .option('-o, --output <file>', 'Output file for validation report')
    .option('-v, --verbose', 'Show detailed validation results')
    .option('-e, --errors-only', 'Only show products with errors')
    .parse(process.argv);

  const options = program.opts();
  
  try {
    // Load configuration
    const config = await createConfig();
    
    // Initialize logger
    initializeLogger({
      logDir: config.directories.logs,
      level: LogLevel.INFO,
      consoleOutput: true,
      fileOutput: true,
      applicationName: 'data-validator'
    });
    
    const logger = getLogger();
    logger.info('Starting data validation', { context: { options } });
    
    // Determine which shops to validate
    const shopsToValidate = options.shop 
      ? [options.shop.toLowerCase()] 
      : ['ah', 'jumbo', 'aldi', 'plus'];
    
    // Load and validate products
    const allResults = [];
    let allProducts: UnifiedProduct[] = [];
    
    for (const shop of shopsToValidate) {
      const shopFile = path.join(config.directories.output, `unified_${shop}_products.json`);
      
      try {
        if (await fs.pathExists(shopFile)) {
          logger.info(`Loading products for ${shop}`);
          const products = await fs.readJson(shopFile) as UnifiedProduct[];
          logger.info(`Loaded ${products.length} products for ${shop}`);
          
          allProducts = [...allProducts, ...products];
          
          logger.info(`Validating ${products.length} products for ${shop}`);
          const results = validator.validateProducts(products);
          allResults.push(...results);
          
          // Log quick summary
          const withErrors = results.filter(r => r.errors.length > 0).length;
          const withWarnings = results.filter(r => r.warnings.length > 0).length;
          const withInfos = results.filter(r => r.infos.length > 0).length;
          
          logger.info(`Validation results for ${shop}`, {
            context: {
              total: products.length,
              withErrors,
              withWarnings,
              withInfos,
              errorRate: `${(withErrors / products.length * 100).toFixed(2)}%`
            }
          });
        } else {
          logger.warn(`File not found: ${shopFile}`);
        }
      } catch (error) {
        logger.error(`Error processing ${shop}`, {
          context: { error }
        });
      }
    }
    
    // Generate summary
    if (allResults.length > 0) {
      const summary = validator.generateSummary(allResults);
      
      logger.info('Overall validation summary', {
        context: {
          totalValidated: summary.totalValidated,
          passed: summary.passed,
          withErrors: summary.withErrors,
          withWarnings: summary.withWarnings,
          withInfos: summary.withInfos,
          passRate: `${(summary.passed / summary.totalValidated * 100).toFixed(2)}%`
        }
      });
      
      // Generate detailed report
      const report = await validator.generateReport(allResults);
      
      // Write report to file if specified
      if (options.output) {
        const outputFile = options.output;
        await fs.outputFile(outputFile, report);
        logger.info(`Validation report written to ${outputFile}`);
      }
      
      // Output detailed results if in verbose mode
      if (options.verbose) {
        // Show detailed results
        if (options.errorsOnly) {
          const productsWithErrors = allResults.filter(r => r.errors.length > 0);
          
          console.log(`\nProducts with Errors (${productsWithErrors.length}):`);
          
          for (const result of productsWithErrors.slice(0, 10)) { // Limit to first 10 for brevity
            console.log(`- ${result.shopType} | ${result.productId}: ${result.errors.map(e => e.rule).join(', ')}`);
          }
          
          if (productsWithErrors.length > 10) {
            console.log(`... and ${productsWithErrors.length - 10} more`);
          }
        } else {
          // Show issue counts by type
          console.log('\nIssues by Type:');
          
          Object.entries(summary.issuesByType)
            .sort((a, b) => b[1] - a[1])
            .forEach(([rule, count]) => {
              console.log(`- ${rule}: ${count} (${(count / summary.totalValidated * 100).toFixed(2)}%)`);
            });
        }
      }
      
      // Analyze product price data
      if (allProducts.length > 0) {
        console.log('\n--- Category Analysis ---');
        const categoryGroups = groupBy(allProducts, 'main_category');
        const categoryCounts = Object.entries(categoryGroups).map(([category, products]) => ({
          category: category === 'null' ? 'Uncategorized' : category,
          count: products.length
        }));
        
        console.log('\n--- Price Analysis ---');
        const shopGroups = groupBy(allProducts, 'shop_type');
        
        for (const [shop, products] of Object.entries(shopGroups)) {
          console.log(`\nShop: ${shop}`);
          const prices = products.map(p => p.price_before_bonus).filter(p => !isNaN(p) && p > 0);
          if (prices.length > 0) {
            const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
            const medianPrice = calculateMedian(prices);
            const maxPrice = Math.max(...prices);
            const minPrice = Math.min(...prices);
            
            console.log(`  Price Range: €${minPrice.toFixed(2)} - €${maxPrice.toFixed(2)}`);
            console.log(`  Avg: €${avgPrice.toFixed(2)}, Median: €${medianPrice.toFixed(2)}`);
          } else {
            console.log(`  No valid prices found.`);
          }
          
          // --- Promotion Analysis ---
          const withPromotions = products.filter(p => p.is_promotion);
          console.log(`\n  Promotions in ${shop}: ${withPromotions.length} / ${products.length}`);
          
          if (withPromotions.length > 0) {
            // Filter promotions with valid price difference
            const validPromotions = withPromotions.filter(p =>
              p.price_before_bonus > 0 &&
              p.current_price > 0 &&
              p.current_price < p.price_before_bonus
            );

            if (validPromotions.length > 0) {
              const discounts = validPromotions.map(p => 
                ((p.price_before_bonus - p.current_price) / p.price_before_bonus) * 100
              );
              const avgDiscount = discounts.reduce((sum, d) => sum + d, 0) / discounts.length;
              
              console.log(`  Avg discount: ${avgDiscount.toFixed(2)}%`);
            }
          }
        }
      }
    } else {
      logger.warn('No products were validated');
    }
    
    return 0;
  } catch (error) {
    console.error('Error during validation:', error);
    return 1;
  }
}

// Helper function to group products by a property
function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((result, item) => {
    const groupKey = String(item[key]);
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
    return result;
  }, {} as Record<string, T[]>);
}

// Calculate median of an array of numbers
function calculateMedian(values: number[]): number {
  if (!values.length) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  
  return sorted[middle];
}

// Run the main function
main()
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });