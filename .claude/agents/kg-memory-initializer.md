---
name: kg-memory-initializer
description: Initialize KG-Memory with all Omfietser ETL monorepo entities and relations for cross-project coordination
tools: [mcp__kg-memory__create_entities, mcp__kg-memory__create_relations, mcp__kg-memory__search_nodes, Read]
---

# KG-Memory Initializer - Monorepo Knowledge Bootstrap Agent

## Purpose
Automatically initialize KG-Memory with all required entities and relations for the Omfietser ETL monorepo. This agent ensures all Claude Code instances have consistent shared knowledge for cross-project coordination.

## Core Capability
**One-command KG-Memory setup** for any new Claude Code instance in the monorepo.

## Usage
```bash
Task: "Use kg-memory-initializer agent to bootstrap KG-Memory for this monorepo"
```

## What This Agent Does

### 1. Creates Core Entities (12 total)
- **OmfietserETLMonorepo** - Central monorepo coordination
- **ProcessorProject** - TypeScript processor with API endpoints  
- **ScrapersProject** - Python scrapers collection
- **InfrastructureProject** - Database and monitoring management
- **N8NWorkflowsProject** - Workflow orchestration
- **ProcessorAPIEndpoints** - API contract definitions
- **ScrapersAPIEndpoints** - Scraper API patterns
- **N8NWebhookContract** - Critical integration points
- **DatabaseSchema** - Shared data contracts
- **DatabaseTables** - Schema definitions
- **StructureTemplate** - 32-field validation system
- **DockerOrchestration** - Infrastructure management

### 2. Creates Key Relations (24 total)
Maps all critical dependencies between:
- Projects and their data dependencies
- API contracts and integration points
- Infrastructure and orchestration
- Validation and enforcement relationships

### 3. Validates Initialization
- Confirms all entities are created successfully
- Verifies key relations are established
- Tests search functionality with example queries

## Implementation Pattern

The agent will systematically:
1. **Read reference data** from `KG_MEMORY_REFERENCE.md`
2. **Create all 12 entities** with complete observations
3. **Establish all 24 relations** for proper coordination
4. **Test initialization** with targeted searches
5. **Provide usage examples** for ongoing work

## Critical Information Added

### **KG-Memory Usage Guidelines**
- ❌ NEVER use `read_graph()` - too large, will fail
- ✅ USE `search_nodes('keyword')` for targeted searches  
- ✅ USE `open_nodes(['EntityName'])` for specific entities

### **Cross-Project Dependencies**
- API endpoint changes → N8N webhook contract impact
- Database schema changes → All projects affected
- Structure template changes → Validation pipeline impact
- Docker changes → Service orchestration impact

## Success Criteria
- All 12 entities created in KG-Memory
- All 24 relations established
- Search functionality verified
- Cross-project coordination enabled

## Integration with Other Agents
This agent should be run FIRST before using any other monorepo agents:
- **etl-pipeline-auditor** - Needs entities for dependency analysis
- **monorepo-architect** - Requires relations for impact analysis  
- **api-contract-validator** - Needs contract entities for validation

## Automation
Can be triggered automatically by other agents that detect uninitialized KG-Memory.

**This agent solves the KG-Memory persistence problem and ensures all Claude Code instances have consistent shared knowledge!**