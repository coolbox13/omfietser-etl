// src/examples/enrichment-example.ts
/**
 * Example demonstrating the use of the enhanced product enrichment services
 */
import fs from 'fs-extra';
import path from 'path';
import { getProductEnricher } from '../core/services/enrichment/product-enricher';
import { getProductQualityService } from '../core/services/quality/product-quality-service';
import { UnifiedProduct } from '../types';

async function runEnrichmentExample() {
  console.log('Running Product Enrichment Example');
  console.log('=================================');

  try {
    // Step 1: Load a sample of products from each supermarket
    const outputDir = path.join(process.cwd(), 'processed_data');
    const products: UnifiedProduct[] = [];
    
    // Try to load products from each shop
    const shopTypes = ['ah', 'jumbo', 'aldi', 'plus'];
    
    for (const shop of shopTypes) {
      const shopFile = path.join(outputDir, `unified_${shop}_products.json`);
      
      if (await fs.pathExists(shopFile)) {
        console.log(`Loading sample products from ${shop}...`);
        const shopProducts = await fs.readJson(shopFile) as UnifiedProduct[];
        
        // Take a sample of products (5 regular, 5 promotion)
        const regularSample = shopProducts
          .filter(p => !p.is_promotion)
          .slice(0, 5);
          
        const promotionSample = shopProducts
          .filter(p => p.is_promotion)
          .slice(0, 5);
          
        products.push(...regularSample, ...promotionSample);
        
        console.log(`Added ${regularSample.length} regular and ${promotionSample.length} promotion products from ${shop}`);
      }
    }
    
    if (products.length === 0) {
      console.log('No products found. Please run the processor first.');
      return;
    }
    
    console.log(`\nTotal sample size: ${products.length} products`);
    
    // Step 2: Initialize services
    const enricher = getProductEnricher();
    const qualityService = getProductQualityService();
    
    // Step 3: Perform enrichment
    console.log('\nPerforming enrichment...');
    
    const enrichedProducts = enricher.enrichProducts(products, {
      standardizeQuantities: true,
      calculatePricePerUnit: true,
      calculateDiscounts: true,
      parsePromotions: true,
      calculateQualityScore: true
    });
    
    // Step 4: Calculate quality metrics
    console.log('\nCalculating quality metrics...');
    
    const qualityMetrics = qualityService.calculateQualityMetrics(products);
    
    console.log(`\nQuality Metrics:`);
    console.log(`- Overall Score: ${qualityMetrics.overallScore.toFixed(1)}/100`);
    console.log(`- Completeness: ${qualityMetrics.completeness.toFixed(1)}%`);
    console.log(`- Category Accuracy: ${qualityMetrics.categoryAccuracy.toFixed(1)}%`);
    console.log(`- Price Consistency: ${qualityMetrics.priceConsistency.toFixed(1)}%`);
    console.log(`- Promotion Accuracy: ${qualityMetrics.promotionAccuracy.toFixed(1)}%`);
    console.log(`- Unit Consistency: ${qualityMetrics.unitConsistency.toFixed(1)}%`);
    
    // Step 5: Display results for a few sample products
    console.log('\nSample Enriched Products:');
    
    // Get one regular and one promotion product for each shop
    const sampleShops = Object.keys(
      enrichedProducts.reduce((acc, p) => {
        acc[p.shop_type] = true;
        return acc;
      }, {} as Record<string, boolean>)
    );
    
    for (const shop of sampleShops) {
      // Get 5 regular and 5 promo products for this shop
      const shopRegular = enrichedProducts
        .filter(p => p.shop_type === shop && !p.is_promotion)
        .slice(0, 5);
        
      const shopPromo = enrichedProducts
        .filter(p => p.shop_type === shop && p.is_promotion)
        .slice(0, 5);
        
      if (shopRegular.length > 0) {
        console.log(`\n----- Regular Products (${shop}) -----`);
        shopRegular.forEach((regularProduct, i) => {
          console.log(`  [${i+1}] ${regularProduct.title}`);
          console.log(`      Price: €${regularProduct.price_before_bonus}`);
          console.log(`      Quantity: ${regularProduct.quantity_amount || 'N/A'} ${regularProduct.quantity_unit || 'N/A'}`);
          console.log(`      Normalized: ${regularProduct.normalized_quantity?.amount.toFixed(2)} ${regularProduct.normalized_quantity?.unit}`);
          console.log(`      Price/Unit: €${regularProduct.price_per_standard_unit?.toFixed(2)} per ${regularProduct.normalized_quantity?.unit}`);
          
          if (regularProduct.data_quality_score !== undefined) {
            console.log(`Quality Score: ${regularProduct.data_quality_score}/100`);
          }
        });
      }
      
      if (shopPromo.length > 0) {
        console.log(`\n----- Promotion Products (${shop}) -----`);
        shopPromo.forEach((promoProduct, i) => {
          console.log(`  [${i+1}] ${promoProduct.title}`);
          console.log(`      Original Price: €${promoProduct.price_before_bonus}`);
          console.log(`      Current Price: €${promoProduct.current_price}`);
          console.log(`      Promotion: ${promoProduct.promotion_mechanism}`);
          console.log(`      Quantity: ${promoProduct.quantity_amount || 'N/A'} ${promoProduct.quantity_unit || 'N/A'}`);
          console.log(`      Normalized: ${promoProduct.normalized_quantity?.amount.toFixed(2)} ${promoProduct.normalized_quantity?.unit}`);
          
          if (promoProduct.parsed_promotion) {
            console.log(`Parsed Promotion Type: ${promoProduct.parsed_promotion.type}`);
            
            if (promoProduct.parsed_promotion.effectiveUnitPrice) {
              console.log(`Effective Unit Price: €${promoProduct.parsed_promotion.effectiveUnitPrice.toFixed(2)}`);
            }
          }
          
          if (promoProduct.discount_percentage) {
            console.log(`Discount: ${promoProduct.discount_percentage.toFixed(1)}% (€${promoProduct.discount_absolute?.toFixed(2)})`);
          }
          
          if (promoProduct.price_per_standard_unit) {
            console.log(`Original Price per Standard Unit: €${promoProduct.price_per_standard_unit.toFixed(2)}/${promoProduct.normalized_quantity?.unit}`);
          }
          
          if (promoProduct.current_price_per_standard_unit) {
            console.log(`Current Price per Standard Unit: €${promoProduct.current_price_per_standard_unit.toFixed(2)}/${promoProduct.normalized_quantity?.unit}`);
          }
          
          if (promoProduct.data_quality_score !== undefined) {
            console.log(`Quality Score: ${promoProduct.data_quality_score}/100`);
          }
        });
      }
    }
    
    // Step 6: Write examples to file for further inspection
    const exampleOutputDir = path.join(outputDir, 'examples');
    await fs.ensureDir(exampleOutputDir);
    
    await fs.writeJson(
      path.join(exampleOutputDir, 'enriched-products-example.json'),
      enrichedProducts,
      { spaces: 2 }
    );
    
    const reportText = qualityService.generateQualityReport(products);
    await fs.writeFile(
      path.join(exampleOutputDir, 'quality-report-example.md'),
      reportText
    );
    
    console.log(`\nExample outputs written to ${exampleOutputDir}`);
    console.log(`- enriched-products-example.json: Contains all enriched sample products`);
    console.log(`- quality-report-example.md: Contains the full quality report`);
    
  } catch (error) {
    console.error('Error running enrichment example:', error);
  }
}

// Run the example if executed directly
if (require.main === module) {
  runEnrichmentExample().catch(console.error);
}

export { runEnrichmentExample };