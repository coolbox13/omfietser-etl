# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This directory contains N8N workflows for orchestrating the Omfietser ETL system's supermarket scrapers. The workflows provide automated scheduling, monitoring, and data processing for multiple supermarket chains (AH, Jumbo, Aldi, Plus, Kruidvat).

## Workflow Structure

Each supermarket has a dedicated workflow JSON file that follows a consistent pattern:

### Core Workflow Components
- **Configuration Node**: Sets scraper-specific parameters (API URL, product limits, webhooks)
- **Scheduling Trigger**: Automated execution timing (typically daily at 6 AM)
- **Job Management**: Start scraping jobs via FastAPI endpoints
- **Status Monitoring**: Real-time progress tracking with 30-second polling intervals
- **Result Processing**: Data transformation and storage preparation
- **Notification System**: Email alerts and status updates

### Workflow Files
- `AH Scraper.json` - Albert Heijn workflow (main production workflow)
- `AH Scraper (6).json` - Alternative AH configuration
- `Jumbo Scraper.json` - Jumbo supermarket workflow
- `Aldi Scraper.json` - Aldi supermarket workflow  
- `Plus Scraper.json` - Plus supermarket workflow
- `Kruidvat Scraper.json` - Kruidvat pharmacy workflow
- `AH Emergency Stop.json` - Emergency stop workflow for AH scraper

## JavaScript Utilities

### Core Processing Scripts
- `analyze-job-status-fixed.js` - Handles job completion analysis and email formatting. Supports multiple data sources (webhook, route detection, direct payload) and generates HTML email content based on job status.
- `transform-products-for-db.js` - Transforms scraped product data for database insertion. Implements content hashing for change detection and creates individual records per product.

## N8N Development Workflow

### Importing Workflows
1. Access N8N web interface at `http://localhost:5678`
2. Navigate to **Settings** → **Import from JSON**
3. Upload the desired workflow JSON file
4. Configure node parameters as needed

### Configuration Parameters
Each scraper workflow uses these key parameters:
```json
{
  "scraper_api_url": "http://[shop]-scraper-api:8000",
  "max_products": 50-1000,
  "categories_limit": null,
  "webhook_url": "http://n8n:5678/webhook/scraper-complete",
  "priority": "high",
  "notify_on_complete": true
}
```

### Testing Workflows
- **Manual Execution**: Use "Test workflow" button in N8N interface
- **Monitor Progress**: Check **Executions** tab for real-time status
- **Debug Issues**: Examine individual node outputs and error details

## Data Flow Architecture

1. **Trigger**: Scheduled or manual workflow activation
2. **Configuration**: Set scraper parameters and API endpoints
3. **Job Initiation**: POST request to scraper API `/scrape` endpoint
4. **Status Monitoring**: Continuous polling of `/jobs/{id}` endpoint
5. **Result Retrieval**: GET request to `/jobs/{id}/results` when complete
6. **Data Processing**: Product transformation and hash generation
7. **Notification**: Email alerts with job completion status

## Service Integration

### API Endpoints
- **Start Job**: `POST /scrape` - Initiates scraping process
- **Job Status**: `GET /jobs/{job_id}` - Returns current job progress
- **Job Results**: `GET /jobs/{job_id}/results` - Returns completed data
- **Cancel Job**: `DELETE /jobs/{job_id}` - Cancels running job

### Docker Network Communication
Workflows communicate with scraper services via Docker network:
- N8N container: `http://n8n:5678`
- Scraper APIs: `http://[shop]-scraper-api:8000`

## Monitoring and Troubleshooting

### Common Debugging Steps
1. **Check Service Status**: `docker compose logs [service-name]`
2. **Verify API Connectivity**: Test scraper API endpoints directly
3. **Review Execution Logs**: Use N8N Executions tab for detailed node analysis
4. **Monitor Job Progress**: Check `/jobs/{job_id}` endpoint responses

### Error Handling Patterns
- **Webhook vs Route Detection**: Dual-path completion handling
- **API Call Fallbacks**: Graceful degradation when services are unavailable  
- **Status Normalization**: Consistent handling of 'idle' vs 'completed' states
- **Content Hashing**: Product change detection using normalized JSON

## Customization Guidelines

### Schedule Modification
Update cron expressions in trigger nodes:
- Daily: `0 6 * * *` (6 AM daily)
- Every 4 hours: `0 */4 * * *`
- Weekly: `0 9 * * 1` (Monday 9 AM)

### Product Limits
Adjust `max_products` parameter based on requirements:
- Testing: 50-100 products
- Development: 500-1000 products
- Production: Remove limit (null)

### Notification Channels
Add email/Slack nodes after completion processing for custom alerts and reporting integration.

## HTTP Request Node Configuration

### Working Parameter Passing Pattern ✅

**CRITICAL**: Use `bodyParameters` with expressions, NOT `jsonBody` for reliable parameter passing.

#### Correct Configuration (Working):
```json
{
  "method": "POST",
  "url": "http://processor:4000/api/v1/webhook/n8n",
  "sendHeaders": true,
  "headerParameters": {
    "parameters": [
      {"name": "Content-Type", "value": "application/json"}
    ]
  },
  "sendBody": true,
  "bodyParameters": {
    "parameters": [
      {"name": "action", "value": "={{ $json.action }}"},
      {"name": "shop_type", "value": "={{ $json.shop_type }}"},
      {"name": "batch_id", "value": "={{ $json.batch_id }}"},
      {"name": "metadata", "value": "={{ $json.metadata }}"}
    ]
  }
}
```

#### Workflow Pattern:
1. **Set Node**: Create individual fields as separate assignments
2. **HTTP Request Node**: Reference each field using `={{ $json.field_name }}`

#### Failed Approaches ❌:
- `sendJson: true` with `jsonBody: "={{ $json.object }}"`
- `requestFormat: "json"` with direct `jsonBody` object
- `jsonParameters` with individual parameter mapping

### Processor Integration

#### Processor API Endpoints:
- **Webhook**: `POST /api/v1/webhook/n8n` - Start processing job
- **Jobs**: `POST /api/v1/jobs` - Create processing job
- **Health**: `GET /health` - Service status

#### Required Parameters:
```json
{
  "action": "process",
  "shop_type": "ah|jumbo|aldi|plus|kruidvat", 
  "batch_id": "unique-job-identifier",
  "metadata": {
    "triggered_by": "n8n_workflow",
    "test": true|false
  }
}
```