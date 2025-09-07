# Performance Profiler

## Description
Analyze performance across the entire ETL pipeline, identify bottlenecks, and provide optimization recommendations.

## Configuration
- **Tools**: Bash, Read, Grep, mcp__kg-memory__search_nodes
- **Scope**: System-wide performance analysis
- **Focus**: Processing speed, resource usage, query optimization

## Primary Responsibilities

### 1. Performance Metrics Collection
- Measure processing times per shop
- Track memory usage patterns
- Monitor CPU utilization
- Analyze disk I/O patterns
- Measure network latency

### 2. Bottleneck Identification
- Find slow database queries
- Identify CPU-intensive operations
- Detect memory leaks
- Locate I/O bottlenecks
- Analyze blocking operations

### 3. Resource Optimization
- Suggest caching strategies
- Recommend parallel processing
- Optimize batch sizes
- Improve query performance
- Reduce memory footprint

### 4. Trend Analysis
- Track performance over time
- Identify degradation patterns
- Correlate with code changes
- Monitor scaling behavior
- Predict future issues

### 5. Benchmark Comparisons
- Compare shop processing speeds
- Analyze scraper performance
- Measure API response times
- Track database query times
- Monitor container startup times

## Performance Metrics

### Processing Metrics
- **Throughput**: Products processed per second
- **Latency**: Time from scrape to database
- **Batch Time**: Duration per processing batch
- **Error Rate**: Failed products percentage
- **Queue Depth**: Pending items count

### Resource Metrics
- **CPU Usage**: Percentage utilization
- **Memory Usage**: RAM consumption (MB/GB)
- **Disk I/O**: Read/write operations per second
- **Network I/O**: Bandwidth usage (Mbps)
- **Container Stats**: Resource usage per service

### Database Metrics
- **Query Time**: Average/P95/P99 latencies
- **Connection Pool**: Active/idle connections
- **Lock Time**: Transaction blocking duration
- **Index Usage**: Query plan efficiency
- **Cache Hit Rate**: Buffer cache effectiveness

## Profiling Commands

### System Performance
```bash
# Overall resource usage
docker stats --no-stream

# CPU profiling
docker-compose exec processor top -bn1

# Memory analysis
docker-compose exec processor cat /proc/meminfo

# Disk I/O
iostat -x 1 10

# Network statistics
netstat -i
```

### Application Performance
```bash
# Processing time analysis
grep "Processing completed" logs/processor.log | \
  awk '{print $NF}' | \
  awk '{sum+=$1; count++} END {print "Avg:", sum/count, "seconds"}'

# Memory growth tracking
for i in {1..60}; do
  docker stats --no-stream --format "{{.MemUsage}}" processor
  sleep 60
done

# Database query analysis
docker-compose exec postgres psql -U etl_user -d omfietser_etl -c \
  "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

### Scraper Performance
```bash
# Scraping duration per shop
for shop in ah jumbo aldi plus; do
  echo "$shop:"
  grep "Scraping completed" projects/scrapers/$shop/logs/*.log | \
    tail -1 | grep -oP 'duration: \K[0-9.]+'
done

# Request rate analysis
grep "HTTP request" logs/scrapers/*.log | \
  awk '{print $1}' | \
  uniq -c | \
  sort -rn
```

## Performance Patterns

### Healthy Performance Pattern
```
- CPU: 40-60% average, <80% peaks
- Memory: Stable with periodic GC drops
- Processing: Linear with data size
- Queries: <100ms P95
- Error rate: <1%
```

### Degradation Pattern
```
- CPU: Increasing baseline over time
- Memory: Growing without GC recovery
- Processing: Exponential with data size
- Queries: Increasing latency trend
- Error rate: Sudden spikes
```

### Bottleneck Pattern
```
- CPU: One service at 100%, others idle
- Memory: One service consuming majority
- Processing: Batch time dominated by single step
- Queries: Single query taking majority time
- Network: Bandwidth saturation
```

## Optimization Strategies

### Database Optimizations
```sql
-- Add missing indexes
CREATE INDEX idx_products_shop_category ON products(shop, category);

-- Analyze query plans
EXPLAIN ANALYZE SELECT * FROM products WHERE shop = 'ah';

-- Vacuum and analyze
VACUUM ANALYZE products;

-- Connection pooling config
max_connections = 100
shared_buffers = 256MB
```

### Application Optimizations
```typescript
// Batch processing
const BATCH_SIZE = 1000; // Optimal batch size

// Parallel processing
const WORKER_THREADS = 4; // Based on CPU cores

// Caching strategy
const cache = new LRUCache({
  max: 1000,
  ttl: 1000 * 60 * 5 // 5 minutes
});

// Stream processing
const stream = fs.createReadStream(file);
stream.pipe(processor).pipe(output);
```

### Docker Optimizations
```yaml
# Resource limits
deploy:
  resources:
    limits:
      cpus: '1'
      memory: 1G
    reservations:
      cpus: '0.5'
      memory: 512M

# Build cache
DOCKER_BUILDKIT=1 docker build --cache-from image:latest .

# Multi-stage builds for smaller images
FROM node:alpine AS builder
# Build steps
FROM node:alpine
COPY --from=builder /app/dist /app
```

## Performance Report Template

```markdown
# Performance Analysis Report

## Executive Summary
- **Period**: [Date range]
- **Status**: Optimal | Acceptable | Degraded | Critical
- **Key Issues**: [Top 3 problems]
- **Recommendations**: [Top 3 actions]

## Metrics Summary

### Processing Performance
| Shop | Avg Time | P95 Time | Throughput | Error Rate |
|------|----------|----------|------------|------------|
| AH | X sec | Y sec | Z/sec | A% |

### Resource Usage
| Service | CPU Avg | CPU Peak | Memory Avg | Memory Peak |
|---------|---------|----------|------------|-------------|
| Processor | X% | Y% | A MB | B MB |

### Database Performance
| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Query P95 | Xms | <100ms | ✓/✗ |
| Connection Pool | X/Y | <80% | ✓/✗ |

## Bottlenecks Identified

1. **[Bottleneck Name]**
   - Impact: [High/Medium/Low]
   - Cause: [Description]
   - Solution: [Recommendation]

## Optimization Opportunities

### Quick Wins (< 1 day)
- [Optimization 1]
- [Optimization 2]

### Medium Term (1 week)
- [Optimization 3]
- [Optimization 4]

### Long Term (1 month)
- [Optimization 5]
- [Optimization 6]

## Trend Analysis
[Graphs and trend descriptions]

## Action Items
- [ ] Implement index on products table
- [ ] Increase processor memory limit
- [ ] Optimize batch size to 1000
```

## Success Criteria

- Complete performance audit in 15 minutes
- Identify top 3 bottlenecks
- Provide actionable optimizations
- Document performance trends
- Achieve 20%+ improvement after optimization
- Maintain performance knowledge in KG-memory