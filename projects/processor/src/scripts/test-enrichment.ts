// src/scripts/test-enrichment.ts
import fs from 'fs-extra';
import path from 'path';
import { UnifiedProduct } from '../types';
import { createConfig } from '../config';
import { getProductEnricher, EnrichedProduct } from '../core/services/enrichment/product-enricher';

/**
 * Script to test the enrichment process on sample products
 */
async function testEnrichment() {
  console.log('Testing Product Enrichment');
  console.log('=========================');

  try {
    // Load configuration
    const config = await createConfig();

    // Load sample products from final output directory
    const outputDir = config.directories.output;
    let sampleProducts: UnifiedProduct[] = [];
    let promoProducts: UnifiedProduct[] = [];

    // Try to find products from each shop
    const shops = ['ah', 'jumbo', 'aldi', 'plus'];

    for (const shop of shops) {
      const shopFile = path.join(outputDir, `unified_${shop}_products.json`);
      if (await fs.pathExists(shopFile)) {
        console.log(`Loading products from ${shop}...`);
        const products = await fs.readJson(shopFile) as UnifiedProduct[];

        // Find some regular products
        const regular = products
          .filter(p => !p.is_promotion)
          .slice(0, 3);

        if (regular.length > 0) {
          sampleProducts.push(...regular);
          console.log(`- Found ${regular.length} regular products`);
        }

        // Find some promotional products with different mechanisms
        const promotions = products
          .filter(p => p.is_promotion && p.promotion_mechanism)
          .reduce((acc, p) => {
            // Try to get diverse promotion types
            const mechanism = p.promotion_mechanism!.toLowerCase();
            if (
              !acc.some(item =>
                item.promotion_mechanism!.toLowerCase() === mechanism
              )
            ) {
              acc.push(p);
            }
            return acc;
          }, [] as UnifiedProduct[])
          .slice(0, 5);

        if (promotions.length > 0) {
          promoProducts.push(...promotions);
          console.log(`- Found ${promotions.length} promotional products`);
        }

        // Break if we have enough samples
        if (sampleProducts.length >= 6 && promoProducts.length >= 10) {
          break;
        }
      }
    }

    // Initialize the enricher
    const enricher = getProductEnricher();

    if (sampleProducts.length === 0 && promoProducts.length === 0) {
      console.log('No sample products found. Please run the processor first.');
      return;
    }

    // Test regular products
    if (sampleProducts.length > 0) {
      console.log('\nTesting Regular Products:');
      console.log('------------------------');

      for (const product of sampleProducts) {
        console.log(`\nProduct: ${product.title} (${product.shop_type})`);
        console.log(`- Quantity: ${product.quantity_amount} ${product.quantity_unit}`);
        console.log(`- Price: €${product.price_before_bonus}`);

        // Enrich the product
        const enriched = enricher.enrichProduct(product);
        console.log(`  Enriched Data:`);
        console.log(`    Normalized: ${enriched.normalized_quantity?.amount.toFixed(2)} ${enriched.normalized_quantity?.unit}`);
        console.log(`    Price/Unit: €${enriched.price_per_standard_unit?.toFixed(2)} per ${enriched.normalized_quantity?.unit}`);
        if (enriched.data_quality_score !== undefined) {
          console.log(`    Quality Score: ${enriched.data_quality_score}/100`);
        }
      }
    }

    // Test promotional products
    if (promoProducts.length > 0) {
      console.log('\nTesting Promotional Products:');
      console.log('-----------------------------');

      for (const product of promoProducts) {
        console.log(`\nProduct: ${product.title} (${product.shop_type})`);
        console.log(`- Quantity: ${product.quantity_amount} ${product.quantity_unit}`);
        console.log(`- Original Price: €${product.price_before_bonus}`);
        console.log(`- Current Price: €${product.current_price}`);
        console.log(`- Promotion: ${product.promotion_mechanism}`);

        // Enrich the product
        const enriched = enricher.enrichProduct(product);
        console.log(`  Enriched Data:`);
        console.log(`    Normalized: ${enriched.normalized_quantity?.amount.toFixed(2)} ${enriched.normalized_quantity?.unit}`);
        console.log(`    Orig Price/Unit: €${enriched.price_per_standard_unit?.toFixed(2)}`);
        console.log(`    Curr Price/Unit: €${enriched.current_price_per_standard_unit?.toFixed(2)}`);
        if (enriched.discount_percentage !== undefined) {
          console.log(`    Discount: ${enriched.discount_percentage.toFixed(1)}% (€${enriched.discount_absolute?.toFixed(2)})`);
        }
        if (enriched.parsed_promotion) {
          console.log(`    Parsed Promo: ${JSON.stringify(enriched.parsed_promotion)}`);
        }
        if (enriched.data_quality_score !== undefined) {
          console.log(`    Quality Score: ${enriched.data_quality_score}/100`);
        }
      }
    }

    // Write test products to file for inspection
    const testOutputDir = path.join(outputDir, 'test');
    await fs.ensureDir(testOutputDir);

    // Enrich all test products
    const enrichedRegular = sampleProducts.map(p => enricher.enrichProduct(p));
    const enrichedPromo = promoProducts.map(p => enricher.enrichProduct(p));

    await fs.writeJson(
      path.join(testOutputDir, 'test-enriched-products.json'),
      [...enrichedRegular, ...enrichedPromo],
      { spaces: 2 }
    );

    console.log(`\nTest products written to ${path.join(testOutputDir, 'test-enriched-products.json')}`);
  } catch (error) {
    console.error('Error during testing:', error);
  }
}

// Run the test
testEnrichment().catch(console.error);