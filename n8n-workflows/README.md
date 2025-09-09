# N8N Workflows for Omfietser ETL

This directory contains N8N workflows for orchestrating all supermarket scrapers in the Omfietser ETL ecosystem.

## 📋 Available Workflows

### `AH Scraper.json` (Production Ready ✅)
Complete AH (Albert Heijn) workflow that:
- Triggers weekly on Mondays at 6 AM  
- Starts scraping job via ah-scraper:8000 FastAPI service
- Monitors progress in real-time with 30-second polling
- Transforms results and inserts into PostgreSQL database
- Sends email notifications via webhook completion handler

### Other Scrapers (Archived)
- `Jumbo Scraper.json` (backed up)
- `Aldi Scraper.json` (backed up)  
- `Plus Scraper.json` (backed up)
- `Kruidvat Scraper.json` (backed up)

## 🔧 Setup Instructions

### 1. Import Workflow
1. Open N8N web interface (http://localhost:5679)
2. Go to **Settings** → **Import from JSON**
3. Upload `AH Scraper.json`
4. Click **Import**

### 2. Activate Credentials  
⚠️ **Important**: After importing, you must reactivate the PostgreSQL credentials:
1. Go to **Credentials** in N8N
2. Edit the PostgreSQL credential
3. Re-enter the password and save

### 3. Current Configuration
The workflow is pre-configured with production settings:

```json
{
  "scraper_api_url": "http://ah-scraper:8000",
  "webhook_url": "http://n8n:5678/webhook/scraper-complete",
  "max_products": 100,
  "priority": "high",
  "notify_on_complete": true
}
```

### 3. Test Workflow
1. **Activate** the workflow
2. Click **"Test workflow"** to run manually
3. Monitor execution in the **Executions** tab

## 🔄 Workflow Architecture

### Main Processing Flow
```
[Manual/Schedule Trigger]
    ↓
[Set AH Configuration] (ah-scraper:8000 endpoint)
    ↓
[Cleanup Previous Scraping] 
    ↓
[Start AH Scraper] ← POST http://ah-scraper:8000/scrape
    ↓
[Format Job Info] (job_id, status, message)
    ↓
[Wait 5 seconds] ← Progress Monitoring Loop
    ↓         ↑
[Check AH Progress] ← GET /progress
    ↓         ↑
[Route Based on Completion] → [Log Progress & Loop Back]
    ↓ (when idle/completed)
[Get Scraper Results] ← GET /jobs/{job_id}/results
    ↓
[Transform Products for DB] (JSONB format)
    ↓
[Insert Products to PostgreSQL] (raw.products table)
```

### Completion Notification Flow
```
[Webhook - Scraper Complete] (/webhook/scraper-complete)
    ↓
[Analyze Job Status] (parse completion payload)
    ↓
[Send Email Notification] (success/failure alerts)
```

## 📊 Monitoring

### Real-time Status
The workflow checks job status every 30 seconds and shows:
- Job ID and status
- Products scraped so far
- Categories processed
- Progress percentage

### Completion Results
When scraping completes, you get:
- Total products scraped
- Categories found
- Average prices
- Performance metrics

## 🔧 Customization

### Change Schedule
Edit the **"Daily 6AM Trigger"** node:
```
0 6 * * *    # Daily at 6 AM
0 */4 * * *  # Every 4 hours
0 9 * * 1    # Weekly on Monday at 9 AM
```

### Adjust Scraping Limits
Edit the **"Set Configuration"** node:
```json
{
  "max_products": 500,      # Fewer products for testing
  "categories_limit": 2     # Process only 2 categories
}
```

### Add Email Notifications
Add an **Email** node after **"Success Notification"**:
```json
{
  "to": "{{ $('Set Configuration').first().json.notification_email }}",
  "subject": "{{ $json.subject }}",
  "text": "{{ $json.message }}\n\nDetails: {{ $json.details }}"
}
```

### Add Slack Notifications
Add a **Slack** node:
```json
{
  "channel": "#scrapers",
  "text": "{{ $json.message }}"
}
```

## 🛠️ Troubleshooting

### Job Fails to Start
- Check FastAPI service is running: `docker compose logs scraper-api`
- Verify API URL in configuration: `http://scraper-api:8000`

### Job Stuck in "Running"
- Check job logs: `curl http://localhost:8000/jobs/{job_id}/logs`
- Cancel job if needed: `curl -X DELETE http://localhost:8000/jobs/{job_id}`

### No Results Returned
- Check job status: `curl http://localhost:8000/jobs/{job_id}`
- Verify completion: Look for `"status": "completed"`

### Workflow Execution Errors
1. Check **Executions** tab in N8N
2. Look at failed node details
3. Verify all service URLs are correct
4. Check Docker network connectivity

## 📈 Advanced Features

### Multiple Scrapers
Create separate workflows for different configurations:
- **High Priority**: Fewer products, higher frequency
- **Full Catalog**: All products, daily
- **Categories Only**: Specific categories

### Conditional Execution
Add **Switch** nodes to:
- Skip execution on weekends
- Only run if previous job completed
- Scale limits based on time of day

### Data Processing
Add nodes after **"Process Results"** to:
- Save to database
- Send to analytics platform
- Generate reports
- Update inventory systems

### Error Handling
Enhance error handling with:
- **Try/Catch** patterns
- **Retry** logic for failed jobs
- **Alert** notifications for failures
- **Fallback** workflows

## 🔄 Maintenance

### Regular Tasks
- Monitor execution logs
- Clean up old job files
- Update scraping limits as needed
- Review performance metrics

### Updates
When updating the scraper:
1. Update Docker images
2. Test workflow with new version
3. Update any changed API endpoints
4. Monitor first few executions

---

**Need help?** Check the main README.md for full documentation.
