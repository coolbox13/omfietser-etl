# Agent Architecture Plan for Omfietser ETL Monorepo

## 🤖 Agent Availability & Scope

### Agent Accessibility Rules
- **Root agents**: Available to **ALL** Claude instances (root + all subprojects)
- **Project-specific agents**: Only available to **that project's** Claude instance
- **Best practice**: Define common agents in root, specialized agents in projects

## 🏗️ Recommended Agent Architecture

### 🎯 Root-Level Agents (Available everywhere)

#### 1. ETL Pipeline Auditor
```yaml
name: etl-pipeline-auditor
description: Comprehensive audit of ETL pipeline health, dependencies, and performance
tools: [Read, Bash, mcp__kg-memory__search_nodes, Grep, Glob]
```
**Purpose**: Cross-project dependency analysis, performance bottlenecks, integration health

#### 2. Monorepo Architect
```yaml
name: monorepo-architect
description: Plan and implement new ETL steps, update all Claude instances and KG-memory
tools: [Write, Edit, mcp__kg-memory__create_entities, mcp__kg-memory__create_relations, MultiEdit]
```
**Purpose**: Add new projects, coordinate Claude instances, maintain architecture consistency

#### 3. Docker Stack Manager
```yaml
name: docker-stack-manager
description: Manage complete Docker stack, health checks, scaling, and deployment
tools: [Bash, Read, Edit, Write]
```
**Purpose**: Stack-wide Docker operations, service health monitoring, deployment coordination

#### 4. API Contract Validator
```yaml
name: api-contract-validator
description: Validate API contracts across all services, detect breaking changes
tools: [mcp__kg-memory__search_nodes, Read, Bash, Grep]
```
**Purpose**: Ensure webhook compatibility, API versioning, contract compliance

#### 5. Bug Detective
```yaml
name: bug-detective
description: Cross-project bug analysis using logs, KG-memory, and error patterns
tools: [Read, Bash, Grep, mcp__kg-memory__search_nodes, Glob]
```
**Purpose**: Root-cause analysis across microservices, log correlation

#### 6. Feature Impact Analyzer
```yaml
name: feature-impact-analyzer
description: Analyze feature requests for cross-project impact using KG-memory
tools: [mcp__kg-memory__search_nodes, Read, Write, Edit]
```
**Purpose**: Dependency analysis, breaking change detection, implementation planning

#### 7. Performance Profiler
```yaml
name: performance-profiler
description: Analyze performance across entire ETL pipeline, identify bottlenecks
tools: [Bash, Read, Grep, mcp__kg-memory__search_nodes]
```
**Purpose**: Database query optimization, API response times, scraping efficiency

### 🔧 Project-Specific Agents

#### Processor Project (projects/processor/.claude/agents/)

##### 8. Structure Compliance Enforcer
```yaml
name: structure-compliance-enforcer
description: Validate 32-field compliance across all processors
tools: [Read, Edit, Bash, Grep]
```
**Purpose**: Enforce zero-tolerance field compliance, structure validation

##### 9. API Endpoint Developer
```yaml
name: api-endpoint-developer
description: Generate new API endpoints with proper validation and documentation
tools: [Write, Edit, Read, MultiEdit]
```
**Purpose**: Consistent API development, webhook integration

##### 10. Database Migration Planner
```yaml
name: database-migration-planner
description: Plan schema changes with cross-project impact analysis
tools: [mcp__kg-memory__search_nodes, Read, Write, Edit]
```
**Purpose**: Safe database migrations, rollback planning

#### Scrapers Project (projects/scrapers/.claude/agents/)

##### 11. Scraper Performance Optimizer
```yaml
name: scraper-performance-optimizer
description: Optimize scraping speed and reliability across all scrapers
tools: [Read, Edit, Bash, Grep, MultiEdit]
```
**Purpose**: Rate limiting optimization, error handling, retry logic

##### 12. Data Format Validator
```yaml
name: data-format-validator
description: Ensure scraper output matches processor expectations
tools: [Read, Bash, mcp__kg-memory__search_nodes, Edit]
```
**Purpose**: Data contract compliance, format validation

##### 13. Multi Scraper Coordinator
```yaml
name: multi-scraper-coordinator
description: Coordinate changes across all 5 scrapers (AH, Jumbo, Aldi, Plus, Kruidvat)
tools: [Read, Edit, MultiEdit, Bash, Grep]
```
**Purpose**: Consistent changes across scraper fleet

#### Infrastructure Project (infrastructure/.claude/agents/)

##### 14. Database Schema Migrator
```yaml
name: database-schema-migrator
description: Safe database migrations with rollback plans
tools: [Bash, Read, Write, Edit, mcp__kg-memory__search_nodes]
```
**Purpose**: Schema evolution, migration safety, rollback procedures

##### 15. Monitoring Setup Specialist
```yaml
name: monitoring-setup-specialist
description: Configure Prometheus/Grafana for new services and metrics
tools: [Write, Edit, Read, Bash]
```
**Purpose**: Observability setup, alerting configuration, dashboard creation

#### N8N Workflows Project (n8n-workflows/.claude/agents/)

##### 16. Workflow Integration Tester
```yaml
name: workflow-integration-tester
description: Test complete ETL flows end-to-end
tools: [Bash, Read, mcp__kg-memory__search_nodes]
```
**Purpose**: End-to-end testing, integration validation

##### 17. Error Handling Designer
```yaml
name: error-handling-designer
description: Design robust error handling patterns for workflows
tools: [Read, Write, Edit, mcp__kg-memory__search_nodes]
```
**Purpose**: Resilient workflow design, error recovery patterns

## 🚀 Implementation Strategy

### Phase 1: Core Agents (Essential)
1. **ETL Pipeline Auditor** (Root) - Immediate system health insights
2. **Monorepo Architect** (Root) - Essential for scaling architecture
3. **Structure Compliance Enforcer** (Processor) - Critical data quality

### Phase 2: Operational Agents (High Value)
4. **API Contract Validator** (Root) - Integration safety
5. **Docker Stack Manager** (Root) - Deployment management
6. **Database Schema Migrator** (Infrastructure) - Safe evolution

### Phase 3: Development Agents (Productivity)
7. **Bug Detective** (Root) - Cross-service debugging
8. **Performance Profiler** (Root) - System optimization
9. **Feature Impact Analyzer** (Root) - Planning assistance

### Phase 4: Specialized Agents (Advanced)
10-17. All remaining project-specific agents

## 💡 Usage Pattern
```bash
# From any Claude instance in the monorepo
Task: "Use the etl-pipeline-auditor agent to check system health"
Task: "Use the monorepo-architect agent to plan adding a new data-enricher step"  
Task: "Use the api-contract-validator agent to check webhook compatibility"
```

## 🎯 Agent Development Meta-Strategy

**Meta-Agent Approach**: Create an "Agent Factory" agent in root that systematically implements all 17 agents following consistent patterns and best practices.

---

**Status**: Ready for implementation via meta-agent approach
**Total Agents Planned**: 17 (7 root-level, 10 project-specific)
**Implementation Tool**: Agent Factory meta-agent