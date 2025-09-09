// Format processor response for notification
const processorResponse = $json;
const previousData = $input.first().json;

// Extract processor job information
const processorJobId = processorResponse.data?.job_id || 'unknown';
const processorAction = processorResponse.data?.action || 'unknown';
const success = processorResponse.success || false;
const message = processorResponse.message || 'No message';

// Extract scraper information from previous step
const scraperJobId = previousData.metadata?.scraper_job_id || 'unknown';
const productCount = previousData.metadata?.raw_products_count || 0;
const shopType = previousData.shop_type || 'ah';

let statusIcon, statusMessage;
if (success) {
  statusIcon = '🔄';
  statusMessage = `Processing started successfully`;
} else {
  statusIcon = '❌';
  statusMessage = `Processing failed to start`;
}

const notificationData = {
  subject: `${statusIcon} AH Processing ${success ? 'Started' : 'Failed'} - ${productCount} products`,
  html: `
    <h2>${statusIcon} AH Product Processing ${success ? 'Started' : 'Failed'}</h2>
    <p><strong>Scraper Job ID:</strong> ${scraperJobId}</p>
    <p><strong>Processor Job ID:</strong> ${processorJobId}</p>
    <p><strong>Products to Process:</strong> ${productCount}</p>
    <p><strong>Shop Type:</strong> ${shopType}</p>
    <p><strong>Status:</strong> ${statusMessage}</p>
    <p><strong>Message:</strong> ${message}</p>
    <hr>
    <p>The scraped AH products have been inserted into the database and ${success ? 'processing has begun' : 'processing failed to start'}.</p>
    ${success ? '<p>You will receive another notification when processing completes.</p>' : '<p style="color: red;">Check the processor logs for error details.</p>'}
  `,
  processor_job_id: processorJobId,
  scraper_job_id: scraperJobId,
  status: success ? 'processing_started' : 'processing_failed',
  product_count: productCount
};

return [{ json: notificationData }];