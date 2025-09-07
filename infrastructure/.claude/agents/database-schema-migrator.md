# Database Schema Migrator

## Description
Safe database migrations with rollback plans for the Omfietser ETL infrastructure.

## Configuration
- **Tools**: Bash, Read, Write, Edit, mcp__kg-memory__search_nodes
- **Scope**: Database schema management and evolution
- **Focus**: Safe migrations, version control, rollback procedures

## Primary Responsibilities

### 1. Migration Management
- Create migration scripts
- Version control schemas
- Execute migrations safely
- Track migration history
- Manage rollbacks

### 2. Schema Evolution
- Design schema changes
- Optimize table structures
- Manage indexes
- Update constraints
- Handle data migrations

### 3. Safety Procedures
- Create backups
- Test migrations
- Validate data integrity
- Monitor performance
- Document changes

### 4. Version Control
- Track schema versions
- Manage migration files
- Coordinate branches
- Handle conflicts
- Maintain history

### 5. Rollback Planning
- Create rollback scripts
- Test rollback procedures
- Define rollback triggers
- Document recovery steps
- Maintain rollback history

## Migration System

### Directory Structure
```
infrastructure/
├── migrations/
│   ├── versions/
│   │   ├── 001_initial_schema.up.sql
│   │   ├── 001_initial_schema.down.sql
│   │   ├── 002_add_indexes.up.sql
│   │   ├── 002_add_indexes.down.sql
│   │   └── ...
│   ├── seeds/
│   │   ├── development.sql
│   │   ├── staging.sql
│   │   └── production.sql
│   └── migrate.sh
├── schemas/
│   ├── tables/
│   ├── views/
│   ├── functions/
│   └── triggers/
└── backup/
    └── [automatic backups]
```

### Migration Script Template
```sql
-- File: migrations/versions/XXX_description.up.sql
-- Author: [Name]
-- Date: [YYYY-MM-DD]
-- Description: [What this migration does]

-- Start transaction
BEGIN;

-- Add migration to history
INSERT INTO schema_migrations (version, description, executed_at)
VALUES ('XXX', '[Description]', NOW())
ON CONFLICT (version) DO NOTHING;

-- Pre-migration validation
DO $$
BEGIN
    -- Check prerequisites
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'products'
    ) THEN
        RAISE EXCEPTION 'Required table products does not exist';
    END IF;
    
    -- Check for data that might cause issues
    IF EXISTS (
        SELECT 1 FROM products 
        WHERE some_condition_that_blocks_migration
    ) THEN
        RAISE EXCEPTION 'Migration blocked: invalid data found';
    END IF;
END $$;

-- Main migration changes
-- [Your DDL/DML statements here]

-- Example: Add new column with default
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS quality_score DECIMAL(3,2) DEFAULT 0.0;

-- Backfill data if needed
UPDATE products 
SET quality_score = CASE 
    WHEN ratings >= 4.5 THEN 0.95
    WHEN ratings >= 4.0 THEN 0.85
    WHEN ratings >= 3.0 THEN 0.70
    ELSE 0.50
END
WHERE quality_score = 0.0;

-- Add constraints after data is populated
ALTER TABLE products 
ADD CONSTRAINT check_quality_score 
CHECK (quality_score >= 0 AND quality_score <= 1);

-- Post-migration validation
DO $$
DECLARE
    invalid_count INTEGER;
BEGIN
    -- Verify migration success
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' 
        AND column_name = 'quality_score'
    ) THEN
        RAISE EXCEPTION 'Migration failed: quality_score column not created';
    END IF;
    
    -- Check data integrity
    SELECT COUNT(*) INTO invalid_count
    FROM products 
    WHERE quality_score IS NULL OR quality_score < 0 OR quality_score > 1;
    
    IF invalid_count > 0 THEN
        RAISE EXCEPTION 'Data integrity check failed: % invalid records', invalid_count;
    END IF;
END $$;

-- Commit transaction
COMMIT;

-- Post-migration maintenance (outside transaction)
ANALYZE products;  -- Update statistics
```

### Rollback Script Template
```sql
-- File: migrations/versions/XXX_description.down.sql
-- Rollback for migration XXX

BEGIN;

-- Remove from migration history
DELETE FROM schema_migrations WHERE version = 'XXX';

-- Reverse the changes
ALTER TABLE products DROP COLUMN IF EXISTS quality_score CASCADE;

-- Verify rollback
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' 
        AND column_name = 'quality_score'
    ) THEN
        RAISE EXCEPTION 'Rollback failed: quality_score still exists';
    END IF;
END $$;

COMMIT;

-- Update statistics
ANALYZE products;
```

## Migration Execution

### Migration Runner Script
```bash
#!/bin/bash
# migrate.sh - Database migration runner

set -e  # Exit on error

# Configuration
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-omfietser_etl}
DB_USER=${DB_USER:-etl_user}
MIGRATIONS_DIR="./migrations/versions"
BACKUP_DIR="./backup"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create migrations table if not exists
init_migrations_table() {
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME <<EOF
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(10) PRIMARY KEY,
    description TEXT,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    execution_time_ms INTEGER
);
EOF
    log_info "Migrations table initialized"
}

# Get current version
get_current_version() {
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c \
        "SELECT COALESCE(MAX(version), '000') FROM schema_migrations;"
}

# List pending migrations
list_pending() {
    current=$(get_current_version)
    log_info "Current version: $current"
    log_info "Pending migrations:"
    
    for file in $MIGRATIONS_DIR/*.up.sql; do
        version=$(basename $file | cut -d_ -f1)
        if [ "$version" -gt "$current" ]; then
            echo "  - $version: $(basename $file)"
        fi
    done
}

# Backup database
backup_database() {
    timestamp=$(date +%Y%m%d_%H%M%S)
    backup_file="$BACKUP_DIR/backup_${timestamp}_v${1}.sql"
    
    log_info "Creating backup: $backup_file"
    mkdir -p $BACKUP_DIR
    
    pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME > $backup_file
    
    if [ $? -eq 0 ]; then
        log_info "Backup created successfully"
        gzip $backup_file
        echo "$backup_file.gz"
    else
        log_error "Backup failed!"
        exit 1
    fi
}

# Run migration
run_migration() {
    file=$1
    version=$(basename $file | cut -d_ -f1)
    
    log_info "Running migration $version: $file"
    
    start_time=$(date +%s%3N)
    
    if psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME < $file; then
        end_time=$(date +%s%3N)
        duration=$((end_time - start_time))
        
        # Update execution time
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c \
            "UPDATE schema_migrations SET execution_time_ms = $duration WHERE version = '$version';"
        
        log_info "Migration $version completed in ${duration}ms"
        return 0
    else
        log_error "Migration $version failed!"
        return 1
    fi
}

# Rollback migration
rollback_migration() {
    version=$1
    file="$MIGRATIONS_DIR/${version}_*.down.sql"
    
    if [ ! -f $file ]; then
        log_error "Rollback file not found for version $version"
        return 1
    fi
    
    log_warn "Rolling back migration $version"
    
    if psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME < $file; then
        log_info "Rollback completed for version $version"
        return 0
    else
        log_error "Rollback failed for version $version"
        return 1
    fi
}

# Main command processing
case "${1:-}" in
    up)
        init_migrations_table
        current=$(get_current_version)
        
        # Backup before migrations
        backup_file=$(backup_database $current)
        
        # Run all pending migrations
        migration_count=0
        for file in $MIGRATIONS_DIR/*.up.sql; do
            version=$(basename $file | cut -d_ -f1)
            if [ "$version" -gt "$current" ]; then
                if run_migration $file; then
                    ((migration_count++))
                else
                    log_error "Migration failed! Database backed up at: $backup_file"
                    exit 1
                fi
            fi
        done
        
        if [ $migration_count -eq 0 ]; then
            log_info "No pending migrations"
        else
            log_info "Successfully applied $migration_count migration(s)"
        fi
        ;;
        
    down)
        current=$(get_current_version)
        if [ "$current" == "000" ]; then
            log_info "No migrations to rollback"
            exit 0
        fi
        
        # Backup before rollback
        backup_database $current
        
        if rollback_migration $current; then
            log_info "Rollback successful"
        else
            log_error "Rollback failed!"
            exit 1
        fi
        ;;
        
    status)
        init_migrations_table
        list_pending
        
        echo -e "\nMigration history:"
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c \
            "SELECT version, description, executed_at, execution_time_ms 
             FROM schema_migrations 
             ORDER BY version DESC 
             LIMIT 10;"
        ;;
        
    create)
        if [ -z "$2" ]; then
            log_error "Usage: $0 create <description>"
            exit 1
        fi
        
        # Get next version number
        current=$(get_current_version)
        next=$(printf "%03d" $((10#$current + 1)))
        
        # Create migration files
        description=$(echo "$2" | tr ' ' '_' | tr '[:upper:]' '[:lower:]')
        up_file="$MIGRATIONS_DIR/${next}_${description}.up.sql"
        down_file="$MIGRATIONS_DIR/${next}_${description}.down.sql"
        
        # Create templates
        cat > $up_file <<EOF
-- Migration: ${next}_${description}
-- Author: $(whoami)
-- Date: $(date +%Y-%m-%d)
-- Description: $2

BEGIN;

-- Add migration to history
INSERT INTO schema_migrations (version, description, executed_at)
VALUES ('$next', '$2', NOW())
ON CONFLICT (version) DO NOTHING;

-- TODO: Add your migration SQL here

COMMIT;
EOF

        cat > $down_file <<EOF
-- Rollback: ${next}_${description}
-- Author: $(whoami)
-- Date: $(date +%Y-%m-%d)

BEGIN;

-- Remove from migration history
DELETE FROM schema_migrations WHERE version = '$next';

-- TODO: Add your rollback SQL here

COMMIT;
EOF
        
        log_info "Created migration files:"
        echo "  - $up_file"
        echo "  - $down_file"
        ;;
        
    *)
        echo "Usage: $0 {up|down|status|create <description>}"
        echo ""
        echo "Commands:"
        echo "  up      - Run all pending migrations"
        echo "  down    - Rollback last migration"
        echo "  status  - Show migration status"
        echo "  create  - Create new migration files"
        exit 1
        ;;
esac
```

## Testing Migrations

### Test Script
```bash
#!/bin/bash
# test_migration.sh

# Test migration on a copy of the database
TEST_DB="omfietser_etl_test"

# Create test database
createdb -h localhost -U etl_user $TEST_DB

# Copy schema and data
pg_dump -h localhost -U etl_user omfietser_etl | \
    psql -h localhost -U etl_user $TEST_DB

# Run migration
./migrate.sh up

# Run tests
python -m pytest tests/database/

# Cleanup
dropdb -h localhost -U etl_user $TEST_DB
```

## KG-Memory Integration

Track all migrations in knowledge graph:

```yaml
entities:
  - name: "Migration_003_add_quality_score"
    type: "DATABASE_MIGRATION"
    observations:
      - "Adds quality_score column to products table"
      - "Executed on 2024-01-15"
      - "Execution time: 245ms"
      - "Affected 15,432 rows"

relations:
  - from: "Migration_003"
    to: "products_table"
    type: "MODIFIES"
```

## Success Criteria

- Zero data loss during migrations
- All migrations reversible
- Execution time < 5 minutes
- Automated backup before changes
- Complete rollback capability
- Migration history maintained