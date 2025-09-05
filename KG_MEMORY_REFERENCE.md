# KG-Memory Reference for Omfietser ETL Monorepo

## 🧠 **CRITICAL: KG-Memory Initialization Required**

**All Claude Code instances must initialize KG-Memory with these entities before starting work.**

### **Usage Instructions for All Claude Instances:**
1. **NEVER use `read_graph()`** - It's too large and will fail
2. **Initialize with entities below** when starting a new session
3. **Use `search_nodes('keyword')` or `open_nodes(['EntityName'])`** for queries
4. **Add new entities** when creating new components/features

---

## 📊 **Core KG-Memory Entities**

### **Monorepo Structure Entities**

#### OmfietserETLMonorepo
- **Type**: monorepo_root
- **Key Observations**: 
  - Central monorepo containing processor and scrapers for N8N ETL ecosystem
  - Located at /Users/hermanhello/Documents/a_omfietser/omfietser-etl
  - Uses hierarchical Claude Code instances for focused development
  - Master Docker Compose orchestration for full stack deployment
  - Clean cut migration from separate processor and scraper repositories
  - **CRITICAL**: KG-Memory is too large to retrieve entirely - always use search_nodes() or open_nodes() for specific queries
  - Never attempt to read the full knowledge graph as it will exceed token limits
  - Use targeted searches like 'search_nodes(webhook)' or 'search_nodes(database schema)' instead

#### ProcessorProject
- **Type**: typescript_project
- **Key Observations**:
  - Containerized supermarket product processor with 32-field structure compliance
  - Located at projects/processor/ with dedicated Claude Code instance
  - Express.js API on port 4000 with N8N webhook integration
  - Database adapter for PostgreSQL with batch processing capabilities
  - Structure template system enforcing zero-tolerance field compliance
  - Jest test suite with comprehensive unit tests

#### ScrapersProject
- **Type**: python_project
- **Key Observations**:
  - Collection of N8N-ready supermarket scrapers using FastAPI
  - Located at projects/scrapers/ with dedicated Claude Code instance
  - Five scrapers: AH, Jumbo, Aldi, Plus, Kruidvat on ports 8001-8005
  - Python-based with Docker containerization for each scraper
  - Shared data patterns and PostgreSQL integration
  - Progress monitoring and error handling for scraping operations

#### InfrastructureProject
- **Type**: infrastructure_project
- **Key Observations**:
  - Dedicated Claude Code instance for infrastructure management
  - Located at infrastructure/ with focus on shared components
  - PostgreSQL database initialization and configuration
  - Monitoring stack setup with Prometheus and Grafana
  - Shared data patterns and database migration scripts
  - Network configuration and service discovery

#### N8NWorkflowsProject
- **Type**: workflow_project
- **Key Observations**:
  - Dedicated Claude Code instance for N8N workflow management
  - Located at n8n-workflows/ containing workflow definitions
  - Manages scraper orchestration workflows for all supermarkets
  - Webhook integration patterns and error handling flows
  - Workflow templates and reusable components
  - N8N credential management and configuration

### **Technical Contract Entities**

#### ProcessorAPIEndpoints
- **Type**: api_contract
- **Key Observations**:
  - POST /api/webhook/n8n - N8N webhook endpoint for processing triggers
  - GET /api/jobs/{jobId} - Job status monitoring
  - POST /api/jobs - Create new processing jobs
  - GET /api/products - Retrieve processed products
  - GET /health - Health check endpoint
  - All endpoints use port 4000 in containerized environment
  - Webhook endpoint accepts {action: 'process', shop_type: 'ah'} payload format

#### ScrapersAPIEndpoints
- **Type**: api_contract
- **Key Observations**:
  - Each scraper exposes FastAPI endpoints on different ports
  - AH scraper: port 8001, Jumbo: 8002, Plus: 8003, Aldi: 8004, Kruidvat: 8005
  - Common endpoint pattern: POST /scrape/{job_id} for triggering scrapes
  - Health check endpoints for container orchestration
  - Progress monitoring endpoints for N8N workflow status
  - Results stored directly to PostgreSQL database

#### N8NWebhookContract
- **Type**: integration_contract
- **Key Observations**:
  - Processor webhook: POST /api/webhook/n8n with {action, shop_type, batch_id, metadata}
  - Response format: {success: boolean, data: {job_id, action}, message: string}
  - Triggers automatic job creation and processing start
  - Used by N8N workflows after scraping completion
  - Critical integration point requiring coordination for changes
  - Maintains backward compatibility with existing N8N flows

#### DatabaseSchema
- **Type**: data_contract
- **Key Observations**:
  - Shared PostgreSQL database for raw and processed product data
  - Structure validation enforcing 32-field unified product schema
  - Schema versioning support for future evolution
  - Staging table pattern for debugging failed transformations
  - Raw products, processed products, and job management tables
  - Cross-project dependency requiring coordination for schema changes

#### DatabaseTables
- **Type**: database_schema
- **Key Observations**:
  - raw_products: Input data from scrapers with shop_type, job_id, raw_data
  - processed_products: Output data with 32-field unified structure
  - processing_jobs: Job management with status, progress tracking
  - processing_errors: Error logging with severity classification
  - staging_products: Intermediate processing step with external_id extraction
  - Schema versioning support for evolution without breaking changes

#### StructureTemplate
- **Type**: data_validation
- **Key Observations**:
  - 32-field unified product structure enforced across all processors
  - Zero tolerance policy for missing fields - all must be present or null
  - Schema validation with detailed violation reporting
  - Composite key structure: (shop_type, external_id, schema_version)
  - Structure changes require coordination between processor and scrapers
  - Template located in projects/processor/src/core/structure/

#### DockerOrchestration
- **Type**: infrastructure
- **Key Observations**:
  - Unified docker-compose.yml orchestrating entire ETL stack
  - PostgreSQL database shared across all services
  - N8N workflow engine with PostgreSQL backend
  - Health checks and service dependencies configured
  - Environment-based configuration with .env support
  - Optional monitoring stack with Prometheus and Grafana

---

## 🔗 **Key Entity Relations**

### **Primary Dependencies**
- **ProcessorProject** depends_on **DatabaseSchema**
- **ScrapersProject** writes_to **DatabaseSchema**  
- **ProcessorProject** processes_data_from **ScrapersProject**
- **N8NWebhookContract** triggers_processing_in **ProcessorProject**
- **StructureTemplate** enforced_by **ProcessorProject**

### **API Integration Relations**
- **ProcessorAPIEndpoints** implements **N8NWebhookContract**
- **ScrapersAPIEndpoints** writes_to **DatabaseTables**
- **ProcessorAPIEndpoints** validates_against **StructureTemplate**

### **Infrastructure Relations**
- **DockerOrchestration** orchestrates **DatabaseSchema**
- **InfrastructureProject** initializes **DatabaseSchema**
- **InfrastructureProject** configures **DockerOrchestration**

---

## 🚀 **KG-Memory Initialization Script**

**Each Claude Code instance should run this initialization:**

```javascript
// 1. Create core monorepo entities
create_entities([
  {name: "OmfietserETLMonorepo", entityType: "monorepo_root", observations: [...]},
  {name: "ProcessorProject", entityType: "typescript_project", observations: [...]},
  {name: "ScrapersProject", entityType: "python_project", observations: [...]},
  // ... etc for all entities above
]);

// 2. Create key relations
create_relations([
  {from: "ProcessorProject", to: "DatabaseSchema", relationType: "depends_on"},
  {from: "ScrapersProject", to: "DatabaseSchema", relationType: "writes_to"},
  // ... etc for all relations above
]);
```

---

## 📋 **Usage Examples**

```javascript
// Find API dependencies
search_nodes('api webhook')

// Check database schema impact
search_nodes('database schema')

// Understand Docker setup
open_nodes(['DockerOrchestration'])

// Check processor capabilities  
open_nodes(['ProcessorProject'])
```

---

**⚠️ CRITICAL**: Initialize KG-Memory with these entities in every new Claude Code session for proper cross-project coordination!