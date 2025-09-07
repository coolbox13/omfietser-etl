#!/bin/bash
# N8N Workflow Sync Script
# Keeps local JSON files in sync with live N8N workflows

set -e

# Configuration
N8N_URL="http://localhost:5679"
WORKFLOWS_DIR="."
EXPORTS_DIR="./exports"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create directories
mkdir -p "$EXPORTS_DIR" "$BACKUP_DIR"

# Function to get N8N credentials from environment
get_n8n_credentials() {
    # Look for .env in current directory first, then parent directory
    local env_file=""
    if [ -f ".env" ]; then
        env_file=".env"
    elif [ -f "../.env" ]; then
        env_file="../.env"
    else
        echo -e "${YELLOW}⚠️  No .env file found, using defaults${NC}"
    fi
    
    if [ -n "$env_file" ]; then
        N8N_USER=$(grep "N8N_USER=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '"' || echo "admin")
        N8N_PASSWORD=$(grep "N8N_PASSWORD=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '"' || echo "changeme")
        N8N_API_KEY=$(grep "N8N_API_KEY=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '"' || echo "")
    else
        N8N_USER="admin"
        N8N_PASSWORD="changeme"
        N8N_API_KEY=""
    fi
}

# Function to test N8N connectivity
test_n8n_connection() {
    echo -e "${BLUE}🔍 Testing N8N connection...${NC}"
    
    # Try API key first, then fall back to basic auth
    local auth_header=""
    if [ -n "$N8N_API_KEY" ]; then
        auth_header="-H \"X-N8N-API-KEY: $N8N_API_KEY\""
    else
        auth_header="-u \"$N8N_USER:$N8N_PASSWORD\""
    fi
    
    if ! eval "curl -s --fail $auth_header \"$N8N_URL/api/v1/workflows\"" >/dev/null; then
        echo -e "${RED}❌ Cannot connect to N8N at $N8N_URL${NC}"
        echo -e "${YELLOW}💡 Make sure N8N is running and credentials are correct${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✅ N8N connection successful${NC}"
    return 0
}

# Function to get workflow list from N8N API
get_workflow_list() {
    local auth_header=""
    if [ -n "$N8N_API_KEY" ]; then
        curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_URL/api/v1/workflows" | \
        jq -r '.data[] | "\(.id)|\(.name)|\(.updatedAt)"' 2>/dev/null
    else
        curl -s -u "$N8N_USER:$N8N_PASSWORD" "$N8N_URL/api/v1/workflows" | \
        jq -r '.data[] | "\(.id)|\(.name)|\(.updatedAt)"' 2>/dev/null
    fi
}

# Function to export single workflow by ID
export_workflow_by_id() {
    local workflow_id="$1"
    local workflow_name="$2"
    
    echo -e "${BLUE}📦 Exporting: $workflow_name${NC}"
    
    # Get workflow data
    local workflow_data
    if [ -n "$N8N_API_KEY" ]; then
        workflow_data=$(curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_URL/api/v1/workflows/$workflow_id")
    else
        workflow_data=$(curl -s -u "$N8N_USER:$N8N_PASSWORD" "$N8N_URL/api/v1/workflows/$workflow_id")
    fi
    
    if [ $? -eq 0 ] && echo "$workflow_data" | jq . >/dev/null 2>&1; then
        # Clean filename for saving
        local clean_name
        clean_name=$(echo "$workflow_name" | sed 's/[^a-zA-Z0-9 ()-]//g' | sed 's/  */ /g')
        local filename="${clean_name}.json"
        
        # Save to current directory
        echo "$workflow_data" | jq '.data' > "$filename"
        echo -e "${GREEN}✅ Exported: $filename${NC}"
        
        # Also save timestamped copy to exports
        echo "$workflow_data" | jq '.data' > "$EXPORTS_DIR/${clean_name}_${TIMESTAMP}.json"
        
        return 0
    else
        echo -e "${RED}❌ Failed to export: $workflow_name${NC}"
        return 1
    fi
}

# Function to compare local vs remote workflows
compare_workflows() {
    echo -e "${BLUE}🔍 Comparing local vs remote workflows...${NC}"
    echo ""
    
    # Get remote workflows
    local remote_workflows
    remote_workflows=$(get_workflow_list)
    
    if [ -z "$remote_workflows" ]; then
        echo -e "${RED}❌ No workflows found on N8N server${NC}"
        return 1
    fi
    
    # Check each remote workflow
    while IFS='|' read -r id name updated_at; do
        local clean_name
        clean_name=$(echo "$name" | sed 's/[^a-zA-Z0-9 ()-]//g' | sed 's/  */ /g')
        local local_file="${clean_name}.json"
        
        echo -e "${BLUE}Workflow: $name${NC}"
        
        if [ -f "$local_file" ]; then
            # Compare modification times (approximate)
            local local_modified
            local_modified=$(stat -f "%m" "$local_file" 2>/dev/null || stat -c "%Y" "$local_file" 2>/dev/null)
            local remote_timestamp
            remote_timestamp=$(date -d "$updated_at" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "${updated_at%.*}" +%s 2>/dev/null || echo "0")
            
            if [ "$remote_timestamp" -gt "$local_modified" ] 2>/dev/null; then
                echo -e "  ${YELLOW}⚠️  Remote is newer than local file${NC}"
                echo -e "  ${YELLOW}💡 Run 'sync pull' to update local file${NC}"
            else
                echo -e "  ${GREEN}✅ Local file appears up to date${NC}"
            fi
        else
            echo -e "  ${RED}❌ No local file found${NC}"
            echo -e "  ${YELLOW}💡 Run 'sync pull' to create local file${NC}"
        fi
        
        echo ""
    done <<< "$remote_workflows"
}

# Function to pull all workflows from N8N
pull_all_workflows() {
    echo -e "${BLUE}📥 Pulling all workflows from N8N...${NC}"
    echo ""
    
    local count=0
    local remote_workflows
    remote_workflows=$(get_workflow_list)
    
    if [ -z "$remote_workflows" ]; then
        echo -e "${RED}❌ No workflows found on N8N server${NC}"
        return 1
    fi
    
    # Backup existing local files first
    echo -e "${BLUE}📋 Creating backup of existing local files...${NC}"
    for json_file in *.json; do
        if [ -f "$json_file" ]; then
            cp "$json_file" "$BACKUP_DIR/${json_file%.json}_backup_${TIMESTAMP}.json"
        fi
    done
    
    # Pull each workflow
    while IFS='|' read -r id name updated_at; do
        if export_workflow_by_id "$id" "$name"; then
            ((count++))
        fi
    done <<< "$remote_workflows"
    
    echo ""
    echo -e "${GREEN}🎉 Successfully pulled $count workflows${NC}"
    echo -e "${BLUE}💾 Backups saved to: $BACKUP_DIR/${NC}"
}

# Function to push local workflow to N8N (import)
push_workflow() {
    local workflow_file="$1"
    
    if [ ! -f "$workflow_file" ]; then
        echo -e "${RED}❌ File not found: $workflow_file${NC}"
        return 1
    fi
    
    echo -e "${BLUE}📤 Pushing $workflow_file to N8N...${NC}"
    
    # Validate JSON first
    if ! jq . "$workflow_file" >/dev/null 2>&1; then
        echo -e "${RED}❌ Invalid JSON in file: $workflow_file${NC}"
        return 1
    fi
    
    # Import via N8N CLI
    if docker compose exec n8n n8n import:workflow --input="/home/node/workflows/$workflow_file" 2>/dev/null; then
        echo -e "${GREEN}✅ Successfully pushed: $workflow_file${NC}"
        return 0
    else
        echo -e "${RED}❌ Failed to push: $workflow_file${NC}"
        return 1
    fi
}

# Function to show status
show_status() {
    echo -e "${BLUE}📊 N8N Workflow Sync Status${NC}"
    echo "================================"
    echo ""
    
    # N8N connection
    if test_n8n_connection >/dev/null 2>&1; then
        echo -e "${GREEN}✅ N8N Connection: OK${NC}"
    else
        echo -e "${RED}❌ N8N Connection: FAILED${NC}"
    fi
    
    # Count local workflows
    local local_count
    local_count=$(find . -maxdepth 1 -name "*.json" -not -name "package*.json" | wc -l)
    echo -e "${BLUE}📁 Local Workflows: $local_count${NC}"
    
    # Count remote workflows
    local remote_count
    remote_count=$(get_workflow_list | wc -l)
    echo -e "${BLUE}☁️  Remote Workflows: $remote_count${NC}"
    
    echo ""
    compare_workflows
}

# Main script logic
get_n8n_credentials

case "${1:-status}" in
    "pull")
        if test_n8n_connection; then
            pull_all_workflows
        fi
        ;;
    "push")
        if [ -n "$2" ]; then
            push_workflow "$2"
        else
            echo -e "${RED}❌ Please specify a workflow file to push${NC}"
            echo "Usage: $0 push <workflow.json>"
            exit 1
        fi
        ;;
    "compare"|"diff")
        if test_n8n_connection; then
            compare_workflows
        fi
        ;;
    "status"|"")
        show_status
        ;;
    "list")
        if test_n8n_connection; then
            echo -e "${BLUE}☁️  Remote Workflows:${NC}"
            get_workflow_list | while IFS='|' read -r id name updated_at; do
                echo "  - $name (ID: $id, Updated: $updated_at)"
            done
        fi
        ;;
    *)
        echo -e "${BLUE}N8N Workflow Sync Tool${NC}"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo -e "${BLUE}Commands:${NC}"
        echo "  status   - Show sync status and compare local vs remote (default)"
        echo "  pull     - Download all workflows from N8N to local files"
        echo "  push     - Upload local workflow file to N8N"
        echo "  compare  - Compare local files with remote workflows"
        echo "  list     - List all remote workflows"
        echo ""
        echo -e "${BLUE}Examples:${NC}"
        echo "  $0 status              # Show current sync status"
        echo "  $0 pull                # Download all workflows"
        echo "  $0 push 'AH Scraper.json'  # Upload specific workflow"
        echo "  $0 compare             # Compare local vs remote"
        exit 1
        ;;
esac