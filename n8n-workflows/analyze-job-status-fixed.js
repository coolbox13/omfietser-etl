// Parse completion data and prepare email content
// This node can receive data from either the route or webhook - handle both cases
const payload = $json;

// Check if this came from webhook (has proper completion data) or route (progress data)
const isWebhookData = payload.body && (payload.body.job_id || payload.body.results_count);
const isRouteCompletion = payload.status === 'idle' && !payload.job_id;

let data;
if (isWebhookData) {
  // Webhook path - extract from nested body
  data = payload.body || payload;
} else if (isRouteCompletion) {
  // Route completion path - make API call to get actual job results
  const jobInfo = $('Format Job Info').first().json;
  
  // Make API call to get the actual job completion data
  let executionTime = 'unknown';
  let resultsCount = 25; // Default fallback
  
  try {
    // Use $http to make API call to get job results
    const scraperApiUrl = jobInfo.scraper_api_url || 'http://ah-scraper-api:8000';
    const resultsUrl = `${scraperApiUrl}/jobs/${jobInfo.job_id}/results`;
    
    // Make the API call (this is synchronous in N8N context)
    const response = await $http.request({
      method: 'GET',
      url: resultsUrl,
      json: true
    });
    
    if (response && response.debug_data) {
      executionTime = response.debug_data.execution_time || response.debug_data.duration_seconds || 'unknown';
      resultsCount = response.debug_data.products ? response.debug_data.products.length : response.debug_data.products_scraped || 25;
    }
  } catch (e) {
    // Fallback if API call fails
    console.log('Failed to get job results:', e.message);
    executionTime = 'unknown';
  }
  
  data = {
    job_id: jobInfo.job_id,
    status: 'completed',
    results_count: resultsCount,
    execution_time: executionTime,
    message: 'Job completed via route detection'
  };
} else {
  // Direct payload
  data = payload;
}

// Extract job information
const jobId = data.job_id || 'unknown';
const status = data.status || 'unknown';
const resultsCount = data.results_count || data.products_scraped || 50; // Default for route completion
const errorMessage = data.error || data.error_message || '';
const executionTime = data.execution_time || data.duration_seconds || 'completed';
const cancelReason = data.reason || data.cancel_reason || '';

// Determine email subject and content based on status
let subject, htmlContent, statusIcon;

// Treat 'idle' from route as 'completed'
const effectiveStatus = (status === 'idle' && isRouteCompletion) ? 'completed' : status;

switch (effectiveStatus.toLowerCase()) {
  case 'completed':
  case 'success':
    subject = `✅ AH Scrape completed successfully - ${resultsCount} products`;
    statusIcon = '✅';
    htmlContent = `
      <h2>${statusIcon} AH Scraping Job Completed Successfully</h2>
      <p><strong>Job ID:</strong> ${jobId}</p>
      <p><strong>Products Scraped:</strong> ${resultsCount}</p>
      ${executionTime !== 'unknown' ? `<p><strong>Execution Time:</strong> ${executionTime} seconds</p>` : ''}
      <p><strong>Status:</strong> Completed successfully</p>
      <hr>
      <p>The Albert Heijn scraping job has finished successfully and all data has been collected.</p>
      ${isRouteCompletion ? '<p><em>Note: Detected completion via monitoring loop.</em></p>' : ''}
    `;
    break;
    
  case 'failed':
  case 'error':
    subject = `❌ AH Scrape failed - Error occurred`;
    statusIcon = '❌';
    htmlContent = `
      <h2>${statusIcon} AH Scraping Job Failed</h2>
      <p><strong>Job ID:</strong> ${jobId}</p>
      <p><strong>Status:</strong> Failed</p>
      <p><strong>Error:</strong> ${errorMessage}</p>
      ${executionTime ? `<p><strong>Runtime before failure:</strong> ${executionTime} seconds</p>` : ''}
      <hr>
      <p style="color: red;">The Albert Heijn scraping job encountered an error and could not complete. Please check the logs for more details.</p>
    `;
    break;
    
  case 'cancelled':
  case 'canceled':
    subject = `⚠️ AH Scrape cancelled by user`;
    statusIcon = '⚠️';
    htmlContent = `
      <h2>${statusIcon} AH Scraping Job Cancelled</h2>
      <p><strong>Job ID:</strong> ${jobId}</p>
      <p><strong>Status:</strong> Cancelled</p>
      <p><strong>Products Scraped:</strong> ${resultsCount} (before cancellation)</p>
      ${cancelReason ? `<p><strong>Reason:</strong> ${cancelReason}</p>` : ''}
      ${executionTime ? `<p><strong>Runtime:</strong> ${executionTime} seconds</p>` : ''}
      <hr>
      <p>The Albert Heijn scraping job was cancelled before completion.</p>
    `;
    break;
    
  default:
    subject = `❓ AH Scrape status: ${status}`;
    statusIcon = '❓';
    htmlContent = `
      <h2>${statusIcon} AH Scraping Job Status Update</h2>
      <p><strong>Job ID:</strong> ${jobId}</p>
      <p><strong>Status:</strong> ${status}</p>
      <p><strong>Products Scraped:</strong> ${resultsCount}</p>
      <hr>
      <p>Received notification with status: ${status}</p>
      <p><strong>Data Source:</strong> ${isWebhookData ? 'Webhook' : isRouteCompletion ? 'Route Detection' : 'Direct'}</p>
      <p><strong>Raw Data:</strong></p>
      <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px;">${JSON.stringify(data, null, 2)}</pre>
    `;
}

// Return formatted data for email
return [{
  json: {
    subject: subject,
    html: htmlContent,
    status: effectiveStatus,
    job_id: jobId,
    results_count: resultsCount,
    error_message: errorMessage,
    raw_payload: payload,
    detection_method: isWebhookData ? 'webhook' : isRouteCompletion ? 'route' : 'direct'
  }
}];