// Prepare processor trigger data from PostgreSQL insertion results
const input = $input.all()[0];
const insertResults = input.json;

// Extract job information from the first inserted record
const firstRecord = Array.isArray(insertResults) ? insertResults[0] : insertResults;
const job_id = firstRecord?.job_id || 'unknown';
const shop_type = firstRecord?.shop_type || 'ah';
const recordCount = Array.isArray(insertResults) ? insertResults.length : 1;

// Create processor webhook payload
const processorPayload = {
  action: 'process',
  shop_type: shop_type,
  batch_id: job_id,
  metadata: {
    triggered_by: 'n8n_scraper_completion',
    scraper_job_id: job_id,
    raw_products_count: recordCount,
    scraped_at: firstRecord?.scraped_at,
    processing_request_time: new Date().toISOString()
  }
};

console.log(`Triggering processor for ${shop_type} with ${recordCount} products from job: ${job_id}`);

return [{
  json: processorPayload
}];