# Database Migration Planner

## Description
Plan schema changes with cross-project impact analysis, ensuring safe migrations with proper rollback strategies.

## Configuration
- **Tools**: mcp__kg-memory__search_nodes, Read, Write, Edit
- **Scope**: Database schema evolution and migration
- **Focus**: Safe migrations, impact analysis, rollback planning

## Primary Responsibilities

### 1. Schema Design
- Design table structures
- Plan index strategies
- Define constraints
- Create relationships
- Optimize for performance

### 2. Migration Planning
- Assess migration complexity
- Plan execution steps
- Estimate downtime
- Schedule migrations
- Coordinate with teams

### 3. Impact Analysis
- Identify affected services
- Check query compatibility
- Analyze data dependencies
- Assess performance impact
- Review backup requirements

### 4. Rollback Strategies
- Create rollback scripts
- Plan data recovery
- Define rollback triggers
- Test rollback procedures
- Document recovery steps

### 5. Migration Execution
- Generate migration scripts
- Create backup procedures
- Implement monitoring
- Validate migration success
- Update documentation

## Current Database Schema

### Core Tables
```sql
-- Products table (main entity)
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop VARCHAR(50) NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    name TEXT NOT NULL,
    brand VARCHAR(255),
    category VARCHAR(255) NOT NULL,
    original_category VARCHAR(255),
    description TEXT,
    ingredients TEXT,
    price DECIMAL(10, 2) NOT NULL,
    original_price DECIMAL(10, 2),
    unit_price DECIMAL(10, 2),
    unit_type VARCHAR(50),
    discount DECIMAL(10, 2),
    discount_percentage DECIMAL(5, 2),
    available BOOLEAN NOT NULL DEFAULT true,
    stock INTEGER,
    max_order_quantity INTEGER,
    delivery_days INTEGER,
    image_url TEXT,
    thumbnail_url TEXT,
    badges JSONB,
    ratings DECIMAL(3, 2),
    review_count INTEGER,
    nutritional_info JSONB,
    url TEXT,
    sku VARCHAR(100),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    price_history JSONB,
    is_new BOOLEAN DEFAULT false,
    processing_errors JSONB,
    hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(shop, external_id)
);

-- Indexes
CREATE INDEX idx_products_shop_category ON products(shop, category);
CREATE INDEX idx_products_shop_available ON products(shop, available);
CREATE INDEX idx_products_last_updated ON products(last_updated);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_brand ON products(brand);

-- Processing jobs table
CREATE TABLE processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop VARCHAR(50),
    status VARCHAR(50) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    products_processed INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    error_details JSONB,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Issues tracking table
CREATE TABLE processing_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES processing_jobs(id),
    shop VARCHAR(50),
    issue_type VARCHAR(100),
    severity VARCHAR(50),
    product_id VARCHAR(255),
    details JSONB,
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## Migration Templates

### Basic Migration Template
```sql
-- Migration: YYYY-MM-DD-description.up.sql
BEGIN;

-- Migration description and rationale
-- Author: [Name]
-- Date: [Date]
-- Impact: [Services affected]

-- Pre-migration checks
DO $$
BEGIN
    -- Check prerequisites
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN
        RAISE EXCEPTION 'Required table products does not exist';
    END IF;
END $$;

-- Main migration
ALTER TABLE products ADD COLUMN IF NOT EXISTS new_field VARCHAR(255);

-- Post-migration validation
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'new_field') THEN
        RAISE EXCEPTION 'Migration failed: new_field was not created';
    END IF;
END $$;

COMMIT;
```

### Rollback Template
```sql
-- Migration: YYYY-MM-DD-description.down.sql
BEGIN;

-- Rollback for migration YYYY-MM-DD-description
-- This will restore the database to the previous state

-- Pre-rollback backup reminder
-- IMPORTANT: Ensure backup exists before running rollback

-- Rollback changes
ALTER TABLE products DROP COLUMN IF EXISTS new_field;

-- Verify rollback
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'products' AND column_name = 'new_field') THEN
        RAISE EXCEPTION 'Rollback failed: new_field still exists';
    END IF;
END $$;

COMMIT;
```

## Migration Strategies

### Zero-Downtime Migration
```sql
-- Strategy for adding new non-nullable column
BEGIN;

-- Step 1: Add column as nullable
ALTER TABLE products ADD COLUMN new_required_field VARCHAR(255);

-- Step 2: Backfill data
UPDATE products 
SET new_required_field = COALESCE(existing_field, 'default_value')
WHERE new_required_field IS NULL;

-- Step 3: Add NOT NULL constraint
ALTER TABLE products ALTER COLUMN new_required_field SET NOT NULL;

COMMIT;
```

### Large Table Migration
```sql
-- Strategy for migrating large tables in batches
DO $$
DECLARE
    batch_size INTEGER := 10000;
    offset_val INTEGER := 0;
    total_rows INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_rows FROM products;
    
    WHILE offset_val < total_rows LOOP
        UPDATE products 
        SET new_field = transformation_function(old_field)
        WHERE id IN (
            SELECT id FROM products 
            ORDER BY id 
            LIMIT batch_size 
            OFFSET offset_val
        );
        
        offset_val := offset_val + batch_size;
        
        -- Allow other transactions
        PERFORM pg_sleep(0.1);
        
        RAISE NOTICE 'Processed % of % rows', 
                     LEAST(offset_val, total_rows), total_rows;
    END LOOP;
END $$;
```

## Impact Analysis Checklist

### Pre-Migration Analysis
```markdown
## Migration Impact Analysis

### Affected Components
- [ ] Processor service
- [ ] Scraper services
- [ ] API endpoints
- [ ] N8N workflows
- [ ] Reporting queries

### Data Impact
- [ ] Rows affected: [count]
- [ ] Data type changes: [yes/no]
- [ ] Data loss risk: [none/low/medium/high]
- [ ] Backup required: [yes/no]

### Performance Impact
- [ ] Index changes: [list]
- [ ] Query plan changes: [analyze]
- [ ] Lock duration: [estimate]
- [ ] Migration duration: [estimate]

### Service Impact
- [ ] Downtime required: [yes/no]
- [ ] Read-only mode sufficient: [yes/no]
- [ ] Service restart required: [list services]
- [ ] Configuration updates: [list]

### Risk Assessment
- [ ] Rollback complexity: [low/medium/high]
- [ ] Data corruption risk: [low/medium/high]
- [ ] Testing coverage: [percentage]
```

## Migration Execution Plan

### Standard Procedure
```bash
# 1. Backup current state
pg_dump -U etl_user -d omfietser_etl > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Test migration on staging
psql -U etl_user -d omfietser_etl_staging < migration.up.sql

# 3. Verify staging
./run_integration_tests.sh

# 4. Apply to production
psql -U etl_user -d omfietser_etl < migration.up.sql

# 5. Verify production
./verify_migration.sh

# 6. Monitor for issues
tail -f logs/processor.log | grep -E "ERROR|database"
```

### Emergency Rollback
```bash
# 1. Stop affected services
docker-compose stop processor scrapers

# 2. Apply rollback
psql -U etl_user -d omfietser_etl < migration.down.sql

# 3. Restore from backup if needed
psql -U etl_user -d omfietser_etl < backup_20240101_120000.sql

# 4. Restart services
docker-compose start processor scrapers

# 5. Verify system health
./health_check.sh
```

## Migration Documentation Template

```markdown
# Migration: [Name]

## Overview
- **Date**: [Planned date]
- **Author**: [Name]
- **Reviewers**: [Names]
- **Impact Level**: Low | Medium | High | Critical

## Changes
### Schema Changes
- [List all DDL changes]

### Data Changes
- [List all DML changes]

## Impact Analysis
### Affected Services
- [Service]: [Impact description]

### Performance Impact
- [Metrics and expectations]

## Execution Plan
### Prerequisites
- [ ] Backup completed
- [ ] Staging tested
- [ ] Team notified

### Steps
1. [Step-by-step execution]

### Verification
- [ ] Schema changes applied
- [ ] Data integrity verified
- [ ] Services functional
- [ ] Performance acceptable

## Rollback Plan
[Detailed rollback procedure]

## Post-Migration
- [ ] Documentation updated
- [ ] Team notified
- [ ] Monitoring confirmed
```

## Success Criteria

- Zero data loss during migration
- Rollback tested and verified
- All services remain functional
- Performance impact < 10%
- Complete documentation
- Knowledge captured in KG-memory