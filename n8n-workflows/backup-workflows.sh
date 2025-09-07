#!/bin/bash
# N8N Workflow Backup Script
# This script exports all workflows from the running N8N instance

set -e

# Configuration
N8N_URL="http://localhost:5679"
BACKUP_DIR="./backups"
EXPORTS_DIR="./exports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup directories
mkdir -p "$BACKUP_DIR" "$EXPORTS_DIR"

echo "🔄 Starting N8N workflow backup..."

# Function to export workflows using N8N CLI inside container
export_workflows() {
    echo "📦 Exporting workflows from N8N..."
    
    # First, check if N8N is running
    if ! docker compose ps n8n | grep -q "Up"; then
        echo "❌ N8N container is not running"
        return 1
    fi
    
    # Try CLI export first
    if docker compose exec n8n n8n export:workflow --all --output="/home/node/exports/workflows_${TIMESTAMP}.json" 2>/dev/null; then
        echo "✅ Workflows exported to: exports/workflows_${TIMESTAMP}.json"
        return 0
    else
        echo "⚠️  CLI export failed, trying API-based export..."
        try_api_export || return 1
    fi
}

# Function to try API-based export
try_api_export() {
    echo "📦 Attempting API-based workflow export..."
    
    # Use N8N API to export workflows (requires auth)
    local api_response
    api_response=$(curl -s -u "${N8N_USER:-admin}:${N8N_PASSWORD:-changeme}" \
        "${N8N_URL}/api/v1/workflows" 2>/dev/null)
    
    if [ $? -eq 0 ] && [ -n "$api_response" ]; then
        echo "$api_response" > "exports/workflows_api_${TIMESTAMP}.json"
        echo "✅ API export successful: exports/workflows_api_${TIMESTAMP}.json"
        return 0
    else
        echo "⚠️  API export failed, falling back to database backup..."
        return 1
    fi
}

# Function to backup database directly (alternative method)
backup_database() {
    echo "📦 Creating database backup..."
    
    # Backup the N8N tables from PostgreSQL
    docker compose exec postgres pg_dump -U etl_user -d omfietser_etl \
        --table="*n8n*" \
        --no-owner \
        --no-privileges \
        > "$BACKUP_DIR/n8n_db_backup_${TIMESTAMP}.sql"
    
    echo "✅ Database backup created: $BACKUP_DIR/n8n_db_backup_${TIMESTAMP}.sql"
}

# Function to create full backup
create_full_backup() {
    echo "📦 Creating full N8N backup..."
    
    # Create backup directory for this timestamp
    FULL_BACKUP_DIR="$BACKUP_DIR/full_backup_${TIMESTAMP}"
    mkdir -p "$FULL_BACKUP_DIR"
    
    # Copy N8N data volume
    echo "📂 Backing up N8N data volume..."
    docker run --rm \
        -v omfietser_etl_n8n_data:/source:ro \
        -v "$(pwd)/$FULL_BACKUP_DIR":/backup \
        alpine:latest \
        tar czf /backup/n8n_data.tar.gz -C /source .
    
    # Database backup
    docker compose exec postgres pg_dump -U etl_user -d omfietser_etl \
        > "$FULL_BACKUP_DIR/postgres_full.sql"
    
    echo "✅ Full backup created in: $FULL_BACKUP_DIR"
}

# Function to list backups
list_backups() {
    echo "📋 Available backups:"
    echo ""
    echo "Workflow exports:"
    ls -la exports/workflows_*.json 2>/dev/null || echo "  No workflow exports found"
    echo ""
    echo "Database backups:"
    ls -la backups/*_db_backup_*.sql 2>/dev/null || echo "  No database backups found"
    echo ""
    echo "Full backups:"
    ls -la backups/full_backup_*/ 2>/dev/null || echo "  No full backups found"
}

# Function to restore workflows
restore_workflows() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ]; then
        echo "❌ Please provide a backup file to restore"
        echo "Usage: $0 restore <backup_file>"
        return 1
    fi
    
    if [ ! -f "$backup_file" ]; then
        echo "❌ Backup file not found: $backup_file"
        return 1
    fi
    
    echo "🔄 Restoring workflows from: $backup_file"
    
    # Copy backup file to container and import
    docker cp "$backup_file" omfietser_etl_n8n:/tmp/restore.json
    docker compose exec n8n n8n import:workflow --input="/tmp/restore.json"
    
    echo "✅ Workflows restored successfully"
}

# Main script logic
case "${1:-backup}" in
    "backup"|"")
        export_workflows || backup_database
        ;;
    "full")
        create_full_backup
        ;;
    "list")
        list_backups
        ;;
    "restore")
        restore_workflows "$2"
        ;;
    *)
        echo "Usage: $0 [backup|full|list|restore <file>]"
        echo ""
        echo "Commands:"
        echo "  backup  - Export workflows (default)"
        echo "  full    - Create full backup including data volume"
        echo "  list    - List available backups"
        echo "  restore - Restore workflows from backup file"
        exit 1
        ;;
esac

echo "🎉 Backup operation completed!"