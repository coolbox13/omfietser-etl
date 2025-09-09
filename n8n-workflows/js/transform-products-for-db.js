// Split scraped products into individual rows for database insertion
const input = $input.all()[0].json;

// Extract data from the AH scraper structure
const data = input.debug_data || input;
const job_id = data.job_id || input.job_id || 'unknown';
const products = data.products || [];

// Simple hash function (alternative to crypto.createHash for N8N compatibility)
function simpleHash(str) {
  let hash = 0;
  if (str.length === 0) return hash.toString();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// Create one record per product
const productRecords = products.map((product, index) => {
  // DEBUG: Log the first product to see what we're actually hashing
  if (index === 0) {
    console.log('DEBUG - First product keys:', Object.keys(product));
    console.log('DEBUG - First product JSON sample:', JSON.stringify(product).substring(0, 200) + '...');
  }
  
  // Generate content hash for change detection
  // Exclude auctionId as it's dynamically generated per scraping session
  const productForHashing = { ...product };
  delete productForHashing.auctionId;
  
  // Normalize JSON by sorting keys to ensure consistent hashing
  const productJsonString = JSON.stringify(productForHashing, Object.keys(productForHashing).sort());
  const contentHash = simpleHash(productJsonString);
  
  // DEBUG: Log hash info for first few products
  if (index < 3) {
    console.log(`DEBUG - Product ${index + 1} (webshopId: ${product.webshopId}): hash=${contentHash}, jsonLength=${productJsonString.length}`);
  }

  return {
    json: {
      shop_type: 'ah',
      job_id: job_id,
      raw_data: product, // Store individual product JSON
      content_hash: contentHash,
      scraped_at: new Date().toISOString()
    }
  };
});

console.log(`Prepared ${productRecords.length} product records for job: ${job_id}`);

// Return array of product records for bulk insertion
return productRecords;