// src/scripts/visualize-data.ts
import fs from 'fs-extra';
import path from 'path';
import { UnifiedProduct } from '../types';
import { getLogger } from '../infrastructure/logging';
import { createConfig } from '../config';

/**
 * Generate visualization data files for the product data
 */
async function generateVisualizationData() {
  try {
    // Load configuration
    const config = await createConfig();
    const logger = getLogger();

    logger.info('Generating visualization data');

    // Create output directory for visualization data in intermediate directory
    const visualizationDir = path.join(config.directories.intermediate, 'visualization');
    await fs.ensureDir(visualizationDir);

    // Load products from all shops
    const shops = ['ah', 'jumbo', 'aldi', 'plus'];
    const allProducts: UnifiedProduct[] = [];

    for (const shop of shops) {
      const shopFile = path.join(config.directories.output, `unified_${shop}_products.json`);

      if (await fs.pathExists(shopFile)) {
        logger.info(`Loading products for ${shop}`);
        const products = await fs.readJson(shopFile) as UnifiedProduct[];
        logger.info(`Loaded ${products.length} products for ${shop}`);

        allProducts.push(...products);
      } else {
        logger.warn(`File not found: ${shopFile}`);
      }
    }

    logger.info(`Total products loaded: ${allProducts.length}`);

    // Generate category distribution data
    const categoryData = generateCategoryDistribution(allProducts);
    await fs.writeJson(
      path.join(visualizationDir, 'category-distribution.json'),
      categoryData,
      { spaces: 2 }
    );

    // Generate price comparison data
    const priceData = generatePriceComparison(allProducts);
    await fs.writeJson(
      path.join(visualizationDir, 'price-comparison.json'),
      priceData,
      { spaces: 2 }
    );

    // Generate promotion analysis data
    const promotionData = generatePromotionAnalysis(allProducts);
    await fs.writeJson(
      path.join(visualizationDir, 'promotion-analysis.json'),
      promotionData,
      { spaces: 2 }
    );

    // Generate combined summary data
    const summaryData = {
      total: allProducts.length,
      byShop: countByShop(allProducts),
      categoryData,
      priceData,
      promotionData
    };

    await fs.writeJson(
      path.join(visualizationDir, 'summary.json'),
      summaryData,
      { spaces: 2 }
    );

    // Generate simple HTML report
    const htmlReport = generateHtmlReport(summaryData);
    await fs.writeFile(
      path.join(visualizationDir, 'report.html'),
      htmlReport
    );

    logger.info(`Visualization data generated in ${visualizationDir}`);
    logger.info(`Open ${path.join(visualizationDir, 'report.html')} in a browser to view the report`);

    return visualizationDir;
  } catch (error) {
    console.error('Error generating visualization data:', error);
    throw error;
  }
}

/**
 * Generate category distribution data
 */
function generateCategoryDistribution(products: UnifiedProduct[]) {
  // Count products by category
  const categoryCounts = products.reduce((counts, product) => {
    const category = product.main_category || 'Uncategorized';
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);

  // Convert to array and sort by count
  return Object.entries(categoryCounts)
    .map(([category, count]) => ({
      category,
      count,
      percentage: parseFloat(((count / products.length) * 100).toFixed(1))
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Generate price comparison data
 */
function generatePriceComparison(products: UnifiedProduct[]) {
  // Group by shop
  const shopGroups = products.reduce((groups, product) => {
    const shop = product.shop_type;
    if (!groups[shop]) {
      groups[shop] = [];
    }
    groups[shop].push(product);
    return groups;
  }, {} as Record<string, UnifiedProduct[]>);

  // Calculate price metrics for each shop
  return Object.entries(shopGroups).map(([shop, shopProducts]) => {
    // Filter out invalid prices
    const validPrices = shopProducts
      .map(p => p.price_before_bonus)
      .filter(price => !isNaN(price) && price > 0 && price < 100); // Filter outliers

    // Calculate statistics
    const avgPrice = validPrices.length > 0
      ? validPrices.reduce((sum, price) => sum + price, 0) / validPrices.length
      : 0;

    // Get price ranges
    const priceRanges = {
      under2: validPrices.filter(p => p < 2).length,
      range2to5: validPrices.filter(p => p >= 2 && p < 5).length,
      range5to10: validPrices.filter(p => p >= 5 && p < 10).length,
      over10: validPrices.filter(p => p >= 10).length
    };

    return {
      shop,
      count: shopProducts.length,
      avgPrice: parseFloat(avgPrice.toFixed(2)),
      medianPrice: calculateMedian(validPrices),
      ...priceRanges
    };
  });
}

/**
 * Generate promotion analysis data
 */
function generatePromotionAnalysis(products: UnifiedProduct[]) {
  // Group by shop
  const shopGroups = products.reduce((groups, product) => {
    const shop = product.shop_type;
    if (!groups[shop]) {
      groups[shop] = [];
    }
    groups[shop].push(product);
    return groups;
  }, {} as Record<string, UnifiedProduct[]>);

  return Object.entries(shopGroups).map(([shop, shopProducts]) => {
    const promotionProducts = shopProducts.filter(p => p.is_promotion);
    const percentageWithPromotions = (promotionProducts.length / shopProducts.length) * 100;

    // Group by promotion type
    const promotionTypes = promotionProducts.reduce((types, product) => {
      const type = product.promotion_type || 'Unknown';
      types[type] = (types[type] || 0) + 1;
      return types;
    }, {} as Record<string, number>);

    return {
      shop,
      totalProducts: shopProducts.length,
      promotionCount: promotionProducts.length,
      promotionPercentage: parseFloat(percentageWithPromotions.toFixed(1)),
      promotionTypes
    };
  });
}

/**
 * Count products by shop
 */
function countByShop(products: UnifiedProduct[]) {
  return products.reduce((counts, product) => {
    const shop = product.shop_type;
    counts[shop] = (counts[shop] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
}

/**
 * Calculate median of an array of numbers
 */
function calculateMedian(values: number[]): number {
  if (!values.length) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return parseFloat(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2));
  }

  return parseFloat(sorted[middle].toFixed(2));
}

/**
 * Generate a simple HTML report from the visualization data
 */
function generateHtmlReport(data: any): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Supermarket Product Analysis Report</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1, h2, h3 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #f2f2f2; }
    tr:hover { background-color: #f5f5f5; }
    .card { border: 1px solid #ddd; border-radius: 4px; padding: 15px; margin-bottom: 20px; }
    .card-header { border-bottom: 1px solid #ddd; padding-bottom: 10px; margin-bottom: 10px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <h1>Supermarket Product Analysis Report</h1>

  <div class="card">
    <div class="card-header">
      <h2>Overview</h2>
    </div>
    <p>Total products analyzed: ${data.total.toLocaleString()}</p>
    <div class="grid">
      <div>
        <h3>Products by Supermarket</h3>
        <table>
          <tr>
            <th>Supermarket</th>
            <th>Products</th>
            <th>Percentage</th>
          </tr>
          ${Object.entries(data.byShop).map(([shop, count]) => `
            <tr>
              <td>${shop}</td>
              <td>${(count as number).toLocaleString()}</td>
              <td>${(((count as number) / data.total) * 100).toFixed(1)}%</td>
            </tr>
          `).join('')}
        </table>
      </div>
      <div>
        <h3>Price Comparison</h3>
        <table>
          <tr>
            <th>Supermarket</th>
            <th>Avg. Price</th>
            <th>Median Price</th>
          </tr>
          ${data.priceData.map((item: any) => `
            <tr>
              <td>${item.shop}</td>
              <td>€${item.avgPrice}</td>
              <td>€${item.medianPrice}</td>
            </tr>
          `).join('')}
        </table>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <h2>Category Analysis</h2>
    </div>
    <table>
      <tr>
        <th>Category</th>
        <th>Count</th>
        <th>Percentage</th>
      </tr>
      ${data.categoryData.slice(0, 15).map((item: any) => `
        <tr>
          <td>${item.category}</td>
          <td>${item.count.toLocaleString()}</td>
          <td>${item.percentage}%</td>
        </tr>
      `).join('')}
    </table>
    ${data.categoryData.length > 15 ? `<p><em>Showing top 15 of ${data.categoryData.length} categories</em></p>` : ''}
  </div>

  <div class="card">
    <div class="card-header">
      <h2>Promotion Analysis</h2>
    </div>
    <table>
      <tr>
        <th>Supermarket</th>
        <th>Products with Promotions</th>
        <th>Percentage</th>
        <th>Top Promotion Types</th>
      </tr>
      ${data.promotionData.map((item: any) => `
        <tr>
          <td>${item.shop}</td>
          <td>${item.promotionCount.toLocaleString()}</td>
          <td>${item.promotionPercentage}%</td>
          <td>${Object.entries(item.promotionTypes)
            .sort(([, a]: any, [, b]: any) => b - a)
            .slice(0, 2)
            .map(([type, count]: any) => `${type}: ${count}`)
            .join(', ')}
          </td>
        </tr>
      `).join('')}
    </table>
  </div>

  <div class="card">
    <div class="card-header">
      <h2>Key Insights</h2>
    </div>
    <ul>
      <li>The most common category is "${data.categoryData[0]?.category}" with ${data.categoryData[0]?.count.toLocaleString()} products (${data.categoryData[0]?.percentage}%).</li>
      <li>${data.priceData.sort((a: any, b: any) => a.avgPrice - b.avgPrice)[0]?.shop} has the lowest average price (€${data.priceData.sort((a: any, b: any) => a.avgPrice - b.avgPrice)[0]?.avgPrice}).</li>
      <li>${data.promotionData.sort((a: any, b: any) => b.promotionPercentage - a.promotionPercentage)[0]?.shop} has the highest percentage of products on promotion (${data.promotionData.sort((a: any, b: any) => b.promotionPercentage - a.promotionPercentage)[0]?.promotionPercentage}%).</li>
    </ul>
  </div>
</body>
</html>`;
}

// Run the function when script is executed directly
if (require.main === module) {
  generateVisualizationData()
    .then((outputDir) => {
      console.log(`Data visualization files generated in ${outputDir}`);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}

export { generateVisualizationData };