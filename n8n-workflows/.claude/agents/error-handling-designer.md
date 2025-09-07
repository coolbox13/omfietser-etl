# Error Handling Designer

## Description
Design robust error handling patterns for N8N workflows, ensuring resilience and proper recovery mechanisms.

## Configuration
- **Tools**: Read, Write, Edit, mcp__kg-memory__search_nodes
- **Scope**: N8N workflow error handling and resilience
- **Focus**: Error recovery, retry strategies, fallback mechanisms

## Primary Responsibilities

### 1. Error Pattern Design
- Design error handling flows
- Create retry strategies
- Implement fallback paths
- Define error classifications
- Build recovery mechanisms

### 2. Retry Logic Implementation
- Configure retry attempts
- Set backoff strategies
- Define retry conditions
- Implement circuit breakers
- Create retry queues

### 3. Fallback Mechanisms
- Design alternative paths
- Create degraded modes
- Implement caching strategies
- Build manual interventions
- Define escalation procedures

### 4. Error Monitoring
- Track error rates
- Monitor retry attempts
- Log error details
- Create error dashboards
- Set up alerting

### 5. Recovery Procedures
- Design recovery flows
- Implement data reconciliation
- Create rollback mechanisms
- Build compensation logic
- Define cleanup procedures

## Error Handling Patterns

### Basic Error Handler
```json
{
  "name": "Error Handler Pattern",
  "nodes": [
    {
      "name": "Try Block",
      "type": "n8n-nodes-base.errorTrigger",
      "parameters": {},
      "position": [250, 300]
    },
    {
      "name": "Main Process",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "={{$json.api_url}}",
        "options": {
          "timeout": 30000
        }
      },
      "continueOnFail": true
    },
    {
      "name": "Error Classifier",
      "type": "n8n-nodes-base.switch",
      "parameters": {
        "dataPropertyName": "error.name",
        "values": [
          {
            "value": "NetworkError",
            "output": "retry"
          },
          {
            "value": "ValidationError",
            "output": "skip"
          },
          {
            "value": "RateLimitError",
            "output": "wait"
          }
        ]
      }
    },
    {
      "name": "Retry Handler",
      "type": "n8n-nodes-base.function",
      "parameters": {
        "functionCode": "const maxRetries = 3;\nconst retryCount = $item(0).json.retryCount || 0;\n\nif (retryCount < maxRetries) {\n  return {\n    json: {\n      ...items[0].json,\n      retryCount: retryCount + 1,\n      retryAfter: Math.pow(2, retryCount) * 1000\n    }\n  };\n} else {\n  throw new Error('Max retries exceeded');\n}"
      }
    },
    {
      "name": "Wait Before Retry",
      "type": "n8n-nodes-base.wait",
      "parameters": {
        "amount": "={{$json.retryAfter}}",
        "unit": "ms"
      }
    },
    {
      "name": "Log Error",
      "type": "n8n-nodes-base.postgres",
      "parameters": {
        "operation": "insert",
        "table": "error_logs",
        "columns": "workflow_name,node_name,error_type,error_message,timestamp,retry_count"
      }
    },
    {
      "name": "Send Alert",
      "type": "n8n-nodes-base.emailSend",
      "parameters": {
        "subject": "Workflow Error: {{$node.Error Trigger.json.workflow.name}}",
        "text": "Error in node: {{$node.Error Trigger.json.node.name}}\n\nError: {{$node.Error Trigger.json.error.message}}"
      }
    }
  ]
}
```

### Circuit Breaker Pattern
```javascript
// Circuit Breaker Implementation
const circuitBreakerNode = {
  name: "Circuit Breaker",
  type: "n8n-nodes-base.function",
  parameters: {
    functionCode: `
// Circuit breaker configuration
const FAILURE_THRESHOLD = 5;
const RECOVERY_TIMEOUT = 60000; // 1 minute
const HALF_OPEN_REQUESTS = 3;

// Get circuit state from static data
const getCircuitState = () => {
  const staticData = $getWorkflowStaticData('global');
  return staticData.circuitState || {
    state: 'CLOSED',
    failureCount: 0,
    lastFailureTime: null,
    successCount: 0
  };
};

// Update circuit state
const updateCircuitState = (state) => {
  const staticData = $getWorkflowStaticData('global');
  staticData.circuitState = state;
  return state;
};

// Main circuit breaker logic
const circuitState = getCircuitState();
const now = Date.now();

switch (circuitState.state) {
  case 'OPEN':
    // Check if recovery timeout has passed
    if (now - circuitState.lastFailureTime > RECOVERY_TIMEOUT) {
      // Move to half-open state
      circuitState.state = 'HALF_OPEN';
      circuitState.successCount = 0;
      updateCircuitState(circuitState);
      
      return {
        json: {
          ...items[0].json,
          circuitState: 'HALF_OPEN',
          allowRequest: true
        }
      };
    } else {
      // Circuit still open, reject request
      throw new Error('Circuit breaker is OPEN - service unavailable');
    }
    
  case 'HALF_OPEN':
    // Allow limited requests to test recovery
    if (circuitState.successCount < HALF_OPEN_REQUESTS) {
      return {
        json: {
          ...items[0].json,
          circuitState: 'HALF_OPEN',
          allowRequest: true
        }
      };
    } else {
      // Enough successful requests, close circuit
      circuitState.state = 'CLOSED';
      circuitState.failureCount = 0;
      updateCircuitState(circuitState);
      
      return {
        json: {
          ...items[0].json,
          circuitState: 'CLOSED',
          allowRequest: true
        }
      };
    }
    
  case 'CLOSED':
  default:
    // Normal operation
    return {
      json: {
        ...items[0].json,
        circuitState: 'CLOSED',
        allowRequest: true
      }
    };
}
`
  }
};
```

### Saga Pattern for Compensation
```json
{
  "name": "Saga Pattern with Compensation",
  "nodes": [
    {
      "name": "Start Transaction",
      "type": "n8n-nodes-base.function",
      "parameters": {
        "functionCode": "// Initialize saga transaction\nreturn {\n  json: {\n    transactionId: crypto.randomUUID(),\n    steps: [],\n    compensations: [],\n    status: 'IN_PROGRESS'\n  }\n};"
      }
    },
    {
      "name": "Step 1: Reserve Inventory",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://inventory-service/reserve",
        "method": "POST",
        "bodyParametersUi": {
          "parameter": [
            {
              "name": "transactionId",
              "value": "={{$json.transactionId}}"
            }
          ]
        }
      },
      "continueOnFail": true
    },
    {
      "name": "Record Step 1",
      "type": "n8n-nodes-base.function",
      "parameters": {
        "functionCode": "if ($node['Step 1: Reserve Inventory'].error) {\n  items[0].json.status = 'FAILED';\n  items[0].json.failedStep = 'inventory';\n} else {\n  items[0].json.steps.push('inventory_reserved');\n  items[0].json.compensations.push({\n    step: 'inventory',\n    action: 'release',\n    data: $node['Step 1: Reserve Inventory'].json\n  });\n}\nreturn items;"
      }
    },
    {
      "name": "Step 2: Process Payment",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://payment-service/charge",
        "method": "POST"
      },
      "continueOnFail": true
    },
    {
      "name": "Record Step 2",
      "type": "n8n-nodes-base.function",
      "parameters": {
        "functionCode": "if ($node['Step 2: Process Payment'].error) {\n  items[0].json.status = 'FAILED';\n  items[0].json.failedStep = 'payment';\n} else {\n  items[0].json.steps.push('payment_processed');\n  items[0].json.compensations.push({\n    step: 'payment',\n    action: 'refund',\n    data: $node['Step 2: Process Payment'].json\n  });\n}\nreturn items;"
      }
    },
    {
      "name": "Check Transaction Status",
      "type": "n8n-nodes-base.if",
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{$json.status}}",
              "value2": "FAILED"
            }
          ]
        }
      }
    },
    {
      "name": "Compensate Transaction",
      "type": "n8n-nodes-base.function",
      "parameters": {
        "functionCode": "// Execute compensations in reverse order\nconst compensations = items[0].json.compensations.reverse();\nconst compensationResults = [];\n\nfor (const compensation of compensations) {\n  compensationResults.push({\n    step: compensation.step,\n    action: compensation.action,\n    status: 'pending'\n  });\n}\n\nreturn {\n  json: {\n    transactionId: items[0].json.transactionId,\n    compensations: compensationResults,\n    originalError: items[0].json.failedStep\n  }\n};"
      }
    },
    {
      "name": "Execute Compensations",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "={{$json.compensation.url}}",
        "method": "POST",
        "bodyParametersUi": {
          "parameter": [
            {
              "name": "action",
              "value": "={{$json.compensation.action}}"
            }
          ]
        }
      }
    }
  ]
}
```

### Dead Letter Queue Pattern
```json
{
  "name": "Dead Letter Queue Handler",
  "nodes": [
    {
      "name": "Process Message",
      "type": "n8n-nodes-base.function",
      "parameters": {
        "functionCode": "try {\n  // Process message\n  const result = processMessage(items[0].json);\n  return { json: { success: true, result } };\n} catch (error) {\n  // Increment retry count\n  const retryCount = (items[0].json.retryCount || 0) + 1;\n  const maxRetries = 3;\n  \n  if (retryCount <= maxRetries) {\n    // Send back to main queue with delay\n    return {\n      json: {\n        ...items[0].json,\n        retryCount,\n        nextRetryAt: new Date(Date.now() + Math.pow(2, retryCount) * 60000),\n        lastError: error.message\n      },\n      destination: 'retry_queue'\n    };\n  } else {\n    // Send to dead letter queue\n    return {\n      json: {\n        ...items[0].json,\n        movedToDLQ: new Date(),\n        finalError: error.message,\n        retryCount\n      },\n      destination: 'dead_letter_queue'\n    };\n  }\n}"
      }
    },
    {
      "name": "Route Message",
      "type": "n8n-nodes-base.switch",
      "parameters": {
        "dataPropertyName": "destination",
        "values": [
          {
            "value": "retry_queue",
            "output": "Retry Queue"
          },
          {
            "value": "dead_letter_queue",
            "output": "Dead Letter Queue"
          }
        ]
      }
    },
    {
      "name": "Store in Retry Queue",
      "type": "n8n-nodes-base.redis",
      "parameters": {
        "operation": "push",
        "list": "etl:retry:queue",
        "value": "={{JSON.stringify($json)}}"
      }
    },
    {
      "name": "Store in DLQ",
      "type": "n8n-nodes-base.postgres",
      "parameters": {
        "operation": "insert",
        "table": "dead_letter_queue",
        "columns": "message_id,workflow_name,error_message,retry_count,payload,created_at"
      }
    },
    {
      "name": "Alert on DLQ",
      "type": "n8n-nodes-base.slack",
      "parameters": {
        "channel": "#etl-alerts",
        "text": "Message moved to DLQ after {{$json.retryCount}} retries\nError: {{$json.finalError}}\nMessage ID: {{$json.message_id}}"
      }
    }
  ]
}
```

## Error Recovery Workflows

### Manual Intervention Workflow
```json
{
  "name": "Manual Intervention Required",
  "nodes": [
    {
      "name": "Detect Manual Intervention Need",
      "type": "n8n-nodes-base.if",
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{$json.error_type}}",
              "operation": "equals",
              "value2": "REQUIRES_MANUAL_INTERVENTION"
            }
          ]
        }
      }
    },
    {
      "name": "Create Intervention Task",
      "type": "n8n-nodes-base.postgres",
      "parameters": {
        "operation": "insert",
        "table": "intervention_tasks",
        "columns": "workflow_id,error_details,priority,status,created_at",
        "returnFields": "task_id"
      }
    },
    {
      "name": "Send Notification",
      "type": "n8n-nodes-base.emailSend",
      "parameters": {
        "subject": "🚨 Manual Intervention Required",
        "text": "Task ID: {{$json.task_id}}\nWorkflow: {{$json.workflow_name}}\nError: {{$json.error_details}}\n\nPlease review at: {{$env.APP_URL}}/interventions/{{$json.task_id}}"
      }
    },
    {
      "name": "Wait for Resolution",
      "type": "n8n-nodes-base.wait",
      "parameters": {
        "resume": "webhook",
        "webhookProperties": {
          "path": "intervention-resolved/{{$json.task_id}}",
          "method": "POST"
        }
      }
    },
    {
      "name": "Resume Processing",
      "type": "n8n-nodes-base.function",
      "parameters": {
        "functionCode": "// Resume with manual resolution data\nconst resolution = $json.resolution;\n\nswitch (resolution.action) {\n  case 'retry':\n    return { json: { ...items[0].json, retry: true } };\n  case 'skip':\n    return { json: { ...items[0].json, skip: true } };\n  case 'modify':\n    return { json: { ...items[0].json, ...resolution.modifications } };\n  default:\n    throw new Error('Unknown resolution action');\n}"
      }
    }
  ]
}
```

## Error Monitoring Dashboard

### Metrics Collection
```javascript
// Error metrics collector node
const errorMetricsNode = {
  name: "Collect Error Metrics",
  type: "n8n-nodes-base.function",
  parameters: {
    functionCode: `
// Initialize metrics
const metrics = {
  timestamp: new Date(),
  workflow: $workflow.name,
  node: $node.name,
  error_type: $json.error?.name || 'Unknown',
  error_message: $json.error?.message || '',
  retry_count: $json.retryCount || 0,
  duration_ms: Date.now() - new Date($json.startTime).getTime()
};

// Classify error
const classifyError = (error) => {
  if (error.message?.includes('timeout')) return 'timeout';
  if (error.message?.includes('rate limit')) return 'rate_limit';
  if (error.message?.includes('validation')) return 'validation';
  if (error.message?.includes('network')) return 'network';
  return 'other';
};

metrics.error_category = classifyError($json.error);

// Calculate severity
const calculateSeverity = () => {
  if (metrics.retry_count >= 3) return 'critical';
  if (metrics.error_category === 'validation') return 'low';
  if (metrics.error_category === 'rate_limit') return 'medium';
  return 'high';
};

metrics.severity = calculateSeverity();

// Store metrics
return {
  json: metrics
};
`
  }
};
```

### Error Analysis Report
```markdown
# Error Handling Analysis Report

## Summary
- **Period**: Last 7 days
- **Total Errors**: 342
- **Error Rate**: 2.3%
- **Recovery Rate**: 87%

## Error Categories
| Category | Count | % of Total | Avg Recovery Time |
|----------|-------|-----------|-------------------|
| Network | 145 | 42% | 3.2 min |
| Validation | 89 | 26% | N/A |
| Rate Limit | 67 | 20% | 5.5 min |
| Timeout | 31 | 9% | 2.1 min |
| Other | 10 | 3% | 12.3 min |

## Retry Analysis
- **Successful Retries**: 234/267 (88%)
- **Average Retry Count**: 1.7
- **Max Retries Hit**: 33 cases

## Dead Letter Queue
- **Messages in DLQ**: 41
- **Oldest Message**: 3 days
- **Manual Resolutions**: 28
- **Pending**: 13

## Recommendations
1. Increase timeout for shop API calls
2. Implement adaptive rate limiting
3. Add validation pre-checks
4. Create automated DLQ processor

## Circuit Breaker Status
- **AH Scraper**: CLOSED (healthy)
- **Jumbo Scraper**: HALF_OPEN (recovering)
- **Processor**: CLOSED (healthy)
```

## Success Criteria

- Zero data loss from errors
- 95% automatic error recovery
- DLQ messages < 1% of total
- Mean time to recovery < 5 minutes
- All errors logged and traceable
- Clear escalation paths defined