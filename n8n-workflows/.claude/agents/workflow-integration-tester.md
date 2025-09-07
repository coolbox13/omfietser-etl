# Workflow Integration Tester

## Description
Test complete ETL flows end-to-end through N8N workflows, ensuring all integration points function correctly.

## Configuration
- **Tools**: Bash, Read, mcp__kg-memory__search_nodes
- **Scope**: N8N workflow testing and validation
- **Focus**: End-to-end testing, integration validation, workflow reliability

## Primary Responsibilities

### 1. End-to-End Testing
- Test complete workflows
- Validate data flow
- Check integration points
- Verify transformations
- Confirm outputs

### 2. Workflow Validation
- Test trigger mechanisms
- Validate node connections
- Check error paths
- Verify conditionals
- Test loops and iterations

### 3. Integration Testing
- Test webhook endpoints
- Validate API calls
- Check database operations
- Verify file operations
- Test external services

### 4. Performance Testing
- Measure execution time
- Test with load
- Check memory usage
- Monitor API limits
- Verify timeouts

### 5. Error Scenario Testing
- Test failure paths
- Validate error handling
- Check retry logic
- Test rollback procedures
- Verify notifications

## N8N Workflow Architecture

### Core ETL Workflow
```json
{
  "name": "Omfietser ETL Main Workflow",
  "nodes": [
    {
      "name": "Schedule Trigger",
      "type": "n8n-nodes-base.scheduleTrigger",
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "hours",
              "hoursInterval": 6
            }
          ]
        }
      }
    },
    {
      "name": "Trigger Scrapers",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "requestMethod": "POST",
        "url": "http://{{shop}}-scraper:8000/scrape",
        "responseFormat": "json"
      }
    },
    {
      "name": "Wait for Completion",
      "type": "n8n-nodes-base.wait",
      "parameters": {
        "resume": "webhook",
        "webhookProperties": {
          "path": "scraper-complete",
          "method": "POST"
        }
      }
    },
    {
      "name": "Process Data",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "requestMethod": "POST",
        "url": "http://processor:3000/api/process",
        "bodyParametersUi": {
          "parameter": [
            {
              "name": "shops",
              "value": "={{$json[\"shop\"]}}"
            }
          ]
        }
      }
    },
    {
      "name": "Store Results",
      "type": "n8n-nodes-base.postgres",
      "parameters": {
        "operation": "insert",
        "table": "processing_results",
        "columns": "shop,status,products_count,timestamp",
        "returnFields": "id"
      }
    },
    {
      "name": "Send Notification",
      "type": "n8n-nodes-base.emailSend",
      "parameters": {
        "subject": "ETL Processing Complete",
        "text": "Processed {{$json[\"products_count\"]}} products for {{$json[\"shop\"]}}"
      }
    }
  ]
}
```

## Test Scenarios

### Basic Flow Test
```bash
#!/bin/bash
# test_basic_flow.sh

echo "Testing basic ETL workflow..."

# 1. Trigger workflow manually
EXECUTION_ID=$(curl -X POST \
  http://localhost:5678/api/v1/workflows/1/execute \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"shop": "ah"}' | jq -r '.data.executionId')

echo "Started execution: $EXECUTION_ID"

# 2. Monitor execution
while true; do
  STATUS=$(curl -s \
    http://localhost:5678/api/v1/executions/$EXECUTION_ID \
    -H "X-N8N-API-KEY: ${N8N_API_KEY}" | jq -r '.data.status')
  
  echo "Status: $STATUS"
  
  if [ "$STATUS" = "success" ] || [ "$STATUS" = "error" ]; then
    break
  fi
  
  sleep 5
done

# 3. Validate results
if [ "$STATUS" = "success" ]; then
  echo "✅ Workflow completed successfully"
  
  # Check database for results
  PRODUCTS=$(docker-compose exec postgres psql -U etl_user -d omfietser_etl -t -c \
    "SELECT COUNT(*) FROM products WHERE shop = 'ah' AND DATE(last_updated) = CURRENT_DATE;")
  
  echo "Products processed: $PRODUCTS"
  
  if [ $PRODUCTS -gt 0 ]; then
    echo "✅ Data successfully stored"
  else
    echo "❌ No data found in database"
    exit 1
  fi
else
  echo "❌ Workflow failed"
  
  # Get error details
  curl -s \
    http://localhost:5678/api/v1/executions/$EXECUTION_ID \
    -H "X-N8N-API-KEY: ${N8N_API_KEY}" | jq '.data.data.resultData.error'
  
  exit 1
fi
```

### Webhook Testing
```python
#!/usr/bin/env python3
# test_webhooks.py

import requests
import json
import time
from typing import Dict, Any

class WebhookTester:
    def __init__(self, n8n_url: str, api_key: str):
        self.n8n_url = n8n_url
        self.headers = {"X-N8N-API-KEY": api_key}
        
    def test_webhook_trigger(self, webhook_path: str, payload: Dict[str, Any]) -> bool:
        """Test webhook trigger"""
        print(f"Testing webhook: {webhook_path}")
        
        # Send webhook
        response = requests.post(
            f"{self.n8n_url}/webhook/{webhook_path}",
            json=payload
        )
        
        if response.status_code == 200:
            print("✅ Webhook accepted")
            
            # Check if workflow was triggered
            time.sleep(2)
            executions = self.get_recent_executions()
            
            for execution in executions:
                if execution.get("workflowData", {}).get("name") == webhook_path:
                    print(f"✅ Workflow triggered: {execution['id']}")
                    return True
            
            print("❌ Workflow not triggered")
            return False
        else:
            print(f"❌ Webhook failed: {response.status_code}")
            return False
    
    def get_recent_executions(self, limit: int = 10) -> list:
        """Get recent workflow executions"""
        response = requests.get(
            f"{self.n8n_url}/api/v1/executions",
            headers=self.headers,
            params={"limit": limit}
        )
        
        if response.status_code == 200:
            return response.json().get("data", [])
        return []
    
    def test_all_webhooks(self):
        """Test all configured webhooks"""
        test_cases = [
            {
                "path": "scraper-complete",
                "payload": {
                    "shop": "ah",
                    "status": "completed",
                    "products": 1500,
                    "timestamp": "2024-01-15T10:00:00Z"
                }
            },
            {
                "path": "processing-error",
                "payload": {
                    "shop": "jumbo",
                    "error": "Validation failed",
                    "details": "Missing required fields",
                    "timestamp": "2024-01-15T10:05:00Z"
                }
            },
            {
                "path": "manual-trigger",
                "payload": {
                    "action": "reprocess",
                    "shops": ["aldi", "plus"],
                    "force": True
                }
            }
        ]
        
        results = []
        for test_case in test_cases:
            success = self.test_webhook_trigger(
                test_case["path"],
                test_case["payload"]
            )
            results.append({
                "webhook": test_case["path"],
                "success": success
            })
        
        # Summary
        print("\n📊 Webhook Test Summary")
        for result in results:
            status = "✅" if result["success"] else "❌"
            print(f"{status} {result['webhook']}")
        
        return all(r["success"] for r in results)

if __name__ == "__main__":
    tester = WebhookTester(
        n8n_url="http://localhost:5678",
        api_key="your-api-key"
    )
    
    success = tester.test_all_webhooks()
    exit(0 if success else 1)
```

### Load Testing
```bash
#!/bin/bash
# load_test_workflow.sh

CONCURRENT_EXECUTIONS=10
N8N_URL="http://localhost:5678"
WORKFLOW_ID="1"

echo "Starting load test with $CONCURRENT_EXECUTIONS concurrent executions..."

# Function to execute workflow
execute_workflow() {
  local index=$1
  local start_time=$(date +%s)
  
  echo "[$index] Starting execution..."
  
  RESPONSE=$(curl -s -X POST \
    $N8N_URL/api/v1/workflows/$WORKFLOW_ID/execute \
    -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"testRun\": $index}")
  
  EXECUTION_ID=$(echo $RESPONSE | jq -r '.data.executionId')
  
  # Wait for completion
  while true; do
    STATUS=$(curl -s \
      $N8N_URL/api/v1/executions/$EXECUTION_ID \
      -H "X-N8N-API-KEY: ${N8N_API_KEY}" | jq -r '.data.status')
    
    if [ "$STATUS" = "success" ] || [ "$STATUS" = "error" ]; then
      break
    fi
    sleep 1
  done
  
  local end_time=$(date +%s)
  local duration=$((end_time - start_time))
  
  echo "[$index] Completed with status: $STATUS (${duration}s)"
  echo "$index,$STATUS,$duration" >> load_test_results.csv
}

# Initialize results file
echo "execution,status,duration" > load_test_results.csv

# Start concurrent executions
for i in $(seq 1 $CONCURRENT_EXECUTIONS); do
  execute_workflow $i &
done

# Wait for all to complete
wait

# Analyze results
echo -e "\n📊 Load Test Results"
echo "===================="

SUCCESS_COUNT=$(grep ",success," load_test_results.csv | wc -l)
ERROR_COUNT=$(grep ",error," load_test_results.csv | wc -l)
AVG_DURATION=$(awk -F',' 'NR>1 {sum+=$3; count++} END {print sum/count}' load_test_results.csv)

echo "Successful: $SUCCESS_COUNT/$CONCURRENT_EXECUTIONS"
echo "Failed: $ERROR_COUNT/$CONCURRENT_EXECUTIONS"
echo "Average Duration: ${AVG_DURATION}s"

# Check system resources during test
echo -e "\n📈 Resource Usage"
docker stats --no-stream n8n postgres processor
```

## Integration Test Suite

### Test Configuration
```yaml
# test_config.yml
test_suites:
  smoke_tests:
    - name: "Basic workflow execution"
      workflow: "main-etl"
      timeout: 300
      expected_status: "success"
    
    - name: "Webhook trigger"
      webhook: "manual-trigger"
      payload:
        shop: "ah"
      expected_nodes:
        - "Trigger Scrapers"
        - "Process Data"
    
  integration_tests:
    - name: "Full ETL pipeline"
      steps:
        - trigger: "schedule"
        - wait_for: "scraper-complete"
        - verify: "database-records"
      timeout: 600
    
    - name: "Error handling"
      simulate_error: "scraper-timeout"
      expected_behavior: "retry"
      max_retries: 3
    
  performance_tests:
    - name: "Concurrent workflows"
      concurrent: 5
      workflow: "parallel-processing"
      success_threshold: 0.8
    
    - name: "Large dataset"
      data_size: 10000
      timeout: 1800
      memory_limit: "2GB"
```

### Test Runner
```python
#!/usr/bin/env python3
# run_integration_tests.py

import yaml
import sys
import time
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

class IntegrationTestRunner:
    def __init__(self, config_file: str):
        with open(config_file) as f:
            self.config = yaml.safe_load(f)
        self.results = []
    
    def run_suite(self, suite_name: str):
        """Run a test suite"""
        suite = self.config["test_suites"].get(suite_name, [])
        
        print(f"\n🧪 Running {suite_name}")
        print("=" * 50)
        
        for test in suite:
            result = self.run_test(test)
            self.results.append(result)
            
            status = "✅ PASS" if result["passed"] else "❌ FAIL"
            print(f"{status} - {test['name']}")
            
            if not result["passed"]:
                print(f"  Error: {result['error']}")
    
    def run_test(self, test: dict) -> dict:
        """Run individual test"""
        try:
            if "workflow" in test:
                return self.test_workflow(test)
            elif "webhook" in test:
                return self.test_webhook(test)
            elif "steps" in test:
                return self.test_multi_step(test)
            else:
                return {
                    "name": test["name"],
                    "passed": False,
                    "error": "Unknown test type"
                }
        except Exception as e:
            return {
                "name": test["name"],
                "passed": False,
                "error": str(e)
            }
    
    def test_workflow(self, test: dict) -> dict:
        """Test workflow execution"""
        # Implementation here
        pass
    
    def test_webhook(self, test: dict) -> dict:
        """Test webhook trigger"""
        # Implementation here
        pass
    
    def test_multi_step(self, test: dict) -> dict:
        """Test multi-step workflow"""
        # Implementation here
        pass
    
    def generate_report(self):
        """Generate test report"""
        total = len(self.results)
        passed = sum(1 for r in self.results if r["passed"])
        
        print("\n" + "=" * 50)
        print("📊 TEST REPORT")
        print("=" * 50)
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        if passed < total:
            print("\nFailed Tests:")
            for result in self.results:
                if not result["passed"]:
                    print(f"  - {result['name']}: {result['error']}")
        
        return passed == total

if __name__ == "__main__":
    runner = IntegrationTestRunner("test_config.yml")
    
    # Run test suites
    runner.run_suite("smoke_tests")
    runner.run_suite("integration_tests")
    runner.run_suite("performance_tests")
    
    # Generate report
    success = runner.generate_report()
    
    sys.exit(0 if success else 1)
```

## Success Criteria

- All workflows execute successfully
- Webhooks trigger correctly
- Error handling works as expected
- Performance within acceptable limits
- No data loss during processing
- Complete test coverage of all paths