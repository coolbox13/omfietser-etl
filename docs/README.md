# Multi-Store Scraper Infrastructure - FastAPI + N8N Integration

Production-ready multi-store product scraper infrastructure with FastAPI services and N8N workflow orchestration for Albert Heijn, Jumbo, Plus, Aldi, and Kruidvat.

## 🏗️ Architecture

```
┌─────────────────┐    HTTP     ┌─────────────────┐    Subprocess    ┌─────────────────┐
│   N8N Workflow │ ◄─────────► │  FastAPI Service │ ◄─────────────► │ Original Scraper │
│                 │             │                 │                 │ (Unchanged!)    │
│ • Scheduling    │             │ • Job Management│                 │ • Progress      │
│ • Notifications │             │ • Status API    │                 │ • Resume Logic  │
│ • Data Processing│             │ • Results API   │                 │ • Error Handling│
└─────────────────┘             └─────────────────┘                 └─────────────────┘
                                           │
                                           ▼ Bulk Insert
                                ┌─────────────────┐
                                │ PostgreSQL DB   │
                                │                 │
                                │ raw.products    │ ← One product per row
                                │ staging.products│ ← Processed data  
                                │ • UUID keys     │
                                │ • JSONB storage │
                                │ • Job tracking  │
                                └─────────────────┘
```

## 🏪 Supported Stores

| Store     | API Port | External Port | Max Products | Performance Notes |
|-----------|----------|---------------|--------------|-------------------|
| Albert Heijn | 8000 | 8001 | 100 (testing) | Fast completion (~2s) |
| Jumbo     | 8000     | 8002          | 200          | Reliable GraphQL API |
| Plus      | 8000     | 8003          | 200          | Standard performance |
| Aldi      | 8000     | 8004          | 500          | High performance target |
| Kruidvat  | 8000     | 8005          | 300          | Akamai protection (slower) |

## 📁 Project Structure

```
n8n_scrapers/
├── docker-compose.yml          # Main orchestration
├── .env.example               # Environment template
├── README.md                  # This file
├── ah_scraper_api/           # Albert Heijn FastAPI service
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── scraper_api.py        # FastAPI service
│   ├── ah_scraper.py         # Original scraper (modified)
│   ├── progress_monitor.py   # Progress monitoring
│   └── config_utils.py       # Configuration utilities
├── jumbo_scraper_api/        # Jumbo FastAPI service
├── plus_scraper_api/         # Plus FastAPI service
├── aldi_scraper_api/         # Aldi FastAPI service
├── kruidvat_scraper_api/     # Kruidvat FastAPI service
├── n8n-workflows/            # N8N workflow exports
│   ├── AH Scraper Workflow.json
│   ├── Jumbo Scraper Workflow.json
│   ├── Plus Scraper Workflow (Working).json
│   ├── Aldi Scraper Workflow (Working).json
│   ├── Kruidvat Scraper Workflow (Working).json
│   └── README.md
├── shared-data/              # Shared between containers
│   ├── jobs/                 # Job configuration files
│   ├── results/              # Scraping results
│   └── logs/                 # Service logs
└── scripts/                  # Utility scripts
    ├── start.sh              # Start services
    ├── stop.sh               # Stop services
    └── test-api.sh           # Test API endpoints
```

## 🚀 Quick Start

### 1. Setup Environment
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 2. Start Services
```bash
./scripts/start.sh
```

### 3. Verify Services
- **N8N Interface**: http://localhost:5678
- **PostgreSQL Database**: localhost:5432 (scraper_db)
- **AH Scraper API**: http://localhost:8001/docs
- **Jumbo Scraper API**: http://localhost:8002/docs
- **Plus Scraper API**: http://localhost:8003/docs
- **Aldi Scraper API**: http://localhost:8004/docs
- **Kruidvat Scraper API**: http://localhost:8005/docs

### 4. Import N8N Workflows
1. Open N8N at http://localhost:5678
2. Go to Settings → Import from JSON
3. Import workflows from `n8n-workflows/` directory
4. Activate desired workflows

## 📡 API Endpoints

All scraper APIs follow the same pattern:

### Start Scraping
```bash
# AH Scraper
curl -X POST "http://localhost:8001/scrape" \
  -H "Content-Type: application/json" \
  -d '{
    "max_products": 100,
    "categories_limit": 3,
    "webhook_url": "http://n8n:5678/webhook/scraper-complete"
  }'

# Jumbo Scraper
curl -X POST "http://localhost:8002/scrape" \
  -H "Content-Type: application/json" \
  -d '{
    "max_products": 200,
    "webhook_url": "http://n8n:5678/webhook/scraper-complete"
  }'
```

### Common Endpoints (replace port with target scraper)
- `GET /health` - Service health check
- `POST /scrape` - Start scraping job
- `GET /jobs` - List all jobs
- `GET /jobs/{job_id}` - Get job status
- `GET /jobs/{job_id}/results` - Get job results
- `GET /jobs/{job_id}/logs` - Get job logs
- `GET /progress` - Clean progress summary for N8N
- `DELETE /jobs/{job_id}` - Cancel/delete job

## 🔧 Configuration

### Environment Variables (.env)
- `N8N_PORT`: N8N web interface port (default: 5678)
- `POSTGRES_PORT`: PostgreSQL database port (default: 5432)
- `POSTGRES_DB`: PostgreSQL database name (default: scraper_db)
- `POSTGRES_USER`: PostgreSQL username (default: scraper_user)
- `POSTGRES_PASSWORD`: PostgreSQL password (default: scraper_password)
- `AH_API_PORT`: AH API external port (default: 8001)
- `JUMBO_API_PORT`: Jumbo API external port (default: 8002)
- `PLUS_API_PORT`: Plus API external port (default: 8003)
- `ALDI_API_PORT`: Aldi API external port (default: 8004)
- `KRUIDVAT_API_PORT`: Kruidvat API external port (default: 8005)
- `MAX_CONCURRENT_JOBS`: Maximum parallel scrapers per service (default: 3)
- `WEBHOOK_BASE_URL`: Base URL for webhook notifications

### Scraper Configuration Parameters
- `max_products`: Maximum products to scrape per job
- `categories_limit`: Maximum categories to process (where applicable)
- `webhook_url`: Completion notification URL
- `priority`: Job priority (high/normal/low)
- `notify_on_complete`: Enable/disable completion notifications

## 🔄 N8N Workflows

Each store has a dedicated N8N workflow with the following features:

### Workflow Components
1. **Configuration Node** - Sets scraper parameters
2. **Cleanup Node** - Removes previous job files
3. **Start Scraper** - Initiates scraping via API
4. **Progress Monitor** - Monitors job using `/progress` endpoint
5. **Completion Router** - Routes based on API status
6. **Email Notification** - Sends completion notifications

### Timing Configuration
- **AH**: 3-second wait (fast completion)
- **Jumbo**: 5-second wait (reliable performance)
- **Plus**: 5-second wait (standard performance)
- **Aldi**: 5-second wait (high performance)
- **Kruidvat**: 10-second wait (slower due to Akamai protection)

### API-Based Completion Detection
All workflows use API-based completion detection instead of file-based checks:
- Monitors `/progress` endpoint
- Checks for `status == "idle"` to detect completion
- More reliable than file-based checks in containerized environments

## 📊 Monitoring

### Service Health Checks
```bash
curl http://localhost:8001/health  # AH
curl http://localhost:8002/health  # Jumbo
curl http://localhost:8003/health  # Plus
curl http://localhost:8004/health  # Aldi
curl http://localhost:8005/health  # Kruidvat
curl http://localhost:5678/healthz # N8N

# PostgreSQL health check
docker compose exec postgres pg_isready -U scraper_user -d scraper_db
```

### Job Management
```bash
# List jobs (replace 8001 with target scraper port)
curl http://localhost:8001/jobs

# Get job status
curl http://localhost:8001/jobs/{job_id}

# Get clean progress (used by N8N)
curl http://localhost:8001/progress

# Cancel job
curl -X DELETE http://localhost:8001/jobs/{job_id}
```

## 🐳 Docker Management

### Start All Services
```bash
docker compose up -d
```

### View Logs
```bash
docker compose logs -f ah-scraper-api     # AH logs
docker compose logs -f jumbo-scraper-api  # Jumbo logs
docker compose logs -f plus-scraper-api   # Plus logs
docker compose logs -f aldi-scraper-api   # Aldi logs
docker compose logs -f kruidvat-scraper-api # Kruidvat logs
docker compose logs -f n8n                # N8N logs
docker compose logs -f postgres           # PostgreSQL logs
```

### Restart Specific Service
```bash
docker compose restart ah-scraper-api
docker compose restart jumbo-scraper-api
# etc.
```

### Update Services
```bash
docker compose pull
docker compose up -d --force-recreate
```

## 🗄️ PostgreSQL Database

### Database Schema Architecture
```sql
raw schema:
└── products              # One product per row storage
    ├── id (UUID)        # Primary key
    ├── shop_type        # 'ah', 'jumbo', 'aldi', 'plus', 'kruidvat'
    ├── job_id           # Links products from same scraping run
    ├── raw_data (JSONB) # Complete product JSON data
    └── scraped_at       # Timestamp

staging schema:
└── products             # Processed/normalized data
    ├── id (SERIAL)     # Primary key  
    ├── raw_product_id  # References raw.products(id)
    ├── shop_type       # Store identifier
    ├── external_id     # Store-specific product ID
    ├── name/price      # Extracted fields
    └── content_hash    # Change detection
```

### Connection Details
- **Host**: `localhost` (from host) or `postgres` (from containers)
- **Port**: 5432 (configurable via `POSTGRES_PORT`)
- **Database**: `scraper_db`
- **Username**: `scraper_user`
- **Password**: `scraper_password`

### Connection String
```bash
# From host machine
postgresql://scraper_user:scraper_password@localhost:5432/scraper_db

# From containers (N8N, APIs)
postgresql://scraper_user:scraper_password@postgres:5432/scraper_db
```

### Database Management
```bash
# Connect to database
docker compose exec postgres psql -U scraper_user -d scraper_db

# View raw scraped products
docker compose exec postgres psql -U scraper_user -d scraper_db -c "SELECT shop_type, job_id, COUNT(*) FROM raw.products GROUP BY shop_type, job_id;"

# Check recent scraping jobs
docker compose exec postgres psql -U scraper_user -d scraper_db -c "SELECT job_id, scraped_at, COUNT(*) as product_count FROM raw.products WHERE scraped_at > NOW() - INTERVAL '24 hours' GROUP BY job_id, scraped_at ORDER BY scraped_at DESC;"

# Backup database
docker compose exec postgres pg_dump -U scraper_user scraper_db > backup.sql

# Restore database
docker compose exec -T postgres psql -U scraper_user -d scraper_db < backup.sql
```

### Data Pipeline Flow
1. **Scraping** → Raw data stored in `raw.products` (one product per row with content hashing)
2. **Processing** → Normalized data extracted to `staging.products`
3. **Production** → Clean data promoted to production tables

### Content Hash System
- **Purpose**: Detect product changes between scraping runs for efficient processing
- **Implementation**: Full JSON content hashing with sorted keys for consistency
- **Storage**: `content_hash` column in `raw.products` table with dedicated index
- **Hash Function**: Custom N8N-compatible hash (no crypto dependencies)
- **Key Sorting**: `JSON.stringify(product, Object.keys(product).sort())` ensures consistent hashes
- **Session Variable Exclusion**: Fields like `auctionId` excluded as they change per scraping session
- **Multi-Store Consideration**: Each store API may have session-dependent fields requiring exclusion

### Available Extensions
- **uuid-ossp**: UUID generation functions for primary keys
- **Full-text search**: Built-in PostgreSQL text search capabilities

### Data Persistence
- Database data is stored in Docker volume `scraper_postgres_data`
- Initialization scripts in `shared-data/postgres-init/` run automatically
- Supports 23k+ products per scraping job with UUID-based indexing

## 🔍 Troubleshooting

### Common Issues

**Service Not Starting:**
```bash
docker compose logs [service-name]
# Check for dependency issues
```

**API Not Responding:**
```bash
curl http://localhost:800[1-5]/health
# Check if ports are available: lsof -i :8001
```

**Job Fails Immediately:**
```bash
curl http://localhost:800[1-5]/jobs/{job_id}/logs
# Check scraper logs for errors
```

**N8N Can't Reach APIs:**
- Ensure all services are in same Docker network
- Use internal service names in N8N workflows:
  - `http://ah-scraper-api:8000`
  - `http://jumbo-scraper-api:8000`
  - `http://plus-scraper-api:8000`
  - `http://aldi-scraper-api:8000`
  - `http://kruidvat-scraper-api:8000`

**Email Notifications Not Working:**
- Check N8N SMTP configuration
- Verify fast jobs complete before notification timing
- Use API-based completion detection instead of file checks

**Inconsistent Email Content:**
- Route completion vs webhook completion may show different data
- Use `analyze-job-status-fixed.js` pattern for consistent notifications
- Implement data source detection and API calls for missing completion data

### Debug Mode
```bash
# Run with debug logging
docker compose -f docker-compose.yml up -d
docker compose logs -f
```

## 📈 Performance Optimization

### Store-Specific Optimizations
- **AH**: Fast API, small batches for testing
- **Jumbo**: GraphQL API, reliable and consistent
- **Plus**: Standard REST API performance
- **Aldi**: Optimized for high-volume scraping
- **Kruidvat**: Rate-limited due to Akamai protection

### Scaling
```bash
# Scale specific services
docker compose up -d --scale ah-scraper-api=2
docker compose up -d --scale jumbo-scraper-api=3
```

### Resource Limits
Each service has configured resource limits in `docker-compose.yml`:
- Memory: 1GB limit, 512MB reservation
- CPU: 1.0 limit, 0.5 reservation

## 🔒 Security

### Internal Network
- All scraper APIs expose port 8000 internally
- Only necessary ports are exposed externally (8001-8005)
- Services communicate via Docker network: `scraper_network`

### API Authentication (Optional)
Set in `.env`:
```bash
API_KEY=your-secret-key
```

## 📝 Development

### Local Development
```bash
cd [scraper]_scraper_api
pip install -r requirements.txt
uvicorn scraper_api:app --reload --port 8000
```

### Testing Individual APIs
```bash
./scripts/test-api.sh  # Tests all APIs
```

### Adding New Store
1. Copy existing scraper API directory structure
2. Modify scraper logic and API branding
3. Add service to `docker-compose.yml`
4. Create N8N workflow following existing pattern
5. Update this README

## 📄 License

MIT License - See LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Test with `./scripts/test-api.sh`
5. Submit pull request

---

**Built with ❤️ for efficient multi-store web scraping**