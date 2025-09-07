# N8N Workflow Management

## 📋 Overview

This directory manages N8N workflows and their persistence for the Omfietser ETL system. Your workflows are stored in **your local PostgreSQL database**, not on N8N's servers.

## 🗄️ Data Storage Locations

### Where Your Data Lives
- **Workflows**: PostgreSQL database (persistent across container restarts)
- **Credentials**: Encrypted in PostgreSQL database
- **Execution History**: PostgreSQL database
- **Settings**: `/home/node/.n8n/` inside container (backed by Docker volume)
- **Exports**: `./exports/` directory (mapped from container)

### Persistence Strategy
✅ **Database**: Workflows persist automatically
✅ **Docker Volume**: N8N settings and cache persist
✅ **File Exports**: Manual exports available in `./exports/`
✅ **Backups**: Automated backup scripts available

## 🔧 Workflow Export & Backup

### Quick Backup (Recommended)
```bash
# Export all workflows to JSON file
./backup-workflows.sh

# List available backups
./backup-workflows.sh list

# Create full backup (database + settings)
./backup-workflows.sh full
```

### Manual Export from N8N UI
1. Go to **Settings** → **Export**
2. Select **All workflows**
3. Download JSON file
4. Save to `./exports/` directory

### API Export (Advanced)
```bash
# Using N8N CLI inside container
docker compose exec n8n n8n export:workflow --all --output="/home/node/exports/workflows_$(date +%Y%m%d).json"
```

## 🔄 Workflow Import/Restore

### Import New Workflows
1. **N8N UI**: Settings → Import → Upload JSON
2. **CLI**: `docker compose exec n8n n8n import:workflow --input="/path/to/file.json"`
3. **Script**: `./backup-workflows.sh restore exports/workflows_20240101.json`

### Migration from Old N8N Instance
Since you already imported from your old instance, you're all set! Your workflows are now in the new PostgreSQL database.

## 📂 Directory Structure

```
n8n-workflows/
├── BACKUP_README.md         # This file
├── backup-workflows.sh      # Backup automation script
├── export-to-git.js        # N8N workflow export script
├── exports/                # Workflow export files
│   └── workflows_*.json    # Timestamped exports
├── backups/                # Database and full backups
│   ├── n8n_db_backup_*.sql # Database-only backups
│   └── full_backup_*/      # Complete backups
└── [Your existing workflows.json files]
```

## 🚨 Quick Test - Export Your Current Workflows

Try this now to make sure everything works:

```bash
# Test the backup system
cd /Users/hermanhello/Documents/a_omfietser/omfietser-etl
./n8n-workflows/backup-workflows.sh

# Check if it worked
ls -la n8n-workflows/exports/
```

## 📱 Access Your N8N

- **N8N Interface**: http://localhost:5679
- **Username**: hello@coolbox.com (your existing login)
- **Database**: All workflows are in PostgreSQL at localhost:5433

## 🔄 Summary: How N8N Stores Data

1. **Workflows**: PostgreSQL database (survives container restarts)
2. **User accounts**: PostgreSQL database 
3. **Settings**: Docker volume `omfietser_etl_n8n_data`
4. **Exports**: Now mapped to `./exports/` folder for easy access

Your workflows are **persistent and safe**! They're stored in your local PostgreSQL database, not on N8N's servers. The backup scripts help you create additional file-based backups for extra safety.

🎉 **You're all set!** Your migrated workflows from the old instance are now running in the new containerized stack.