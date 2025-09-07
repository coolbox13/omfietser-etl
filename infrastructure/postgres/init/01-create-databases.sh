#!/bin/bash
set -e

# Create additional databases
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create N8N database if it doesn't exist
    SELECT 'CREATE DATABASE n8n_db'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'n8n_db')\gexec

    -- Grant permissions
    GRANT ALL PRIVILEGES ON DATABASE n8n_db TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON DATABASE $POSTGRES_DB TO $POSTGRES_USER;
EOSQL

echo "Additional databases created successfully"