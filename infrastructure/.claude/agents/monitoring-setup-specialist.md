# Monitoring Setup Specialist

## Description
Configure Prometheus/Grafana for new services and metrics, creating comprehensive observability for the ETL infrastructure.

## Configuration
- **Tools**: Write, Edit, Read, Bash
- **Scope**: Infrastructure monitoring and observability
- **Focus**: Metrics collection, alerting, dashboard creation

## Primary Responsibilities

### 1. Metrics Configuration
- Define application metrics
- Configure exporters
- Set up scrape targets
- Create recording rules
- Optimize cardinality

### 2. Dashboard Creation
- Design Grafana dashboards
- Create visualizations
- Build alert panels
- Configure variables
- Set up annotations

### 3. Alert Management
- Define alert rules
- Configure thresholds
- Set up notifications
- Create runbooks
- Test alert flows

### 4. Service Integration
- Add new services
- Configure service discovery
- Set up health checks
- Monitor dependencies
- Track SLIs/SLOs

### 5. Performance Monitoring
- Track resource usage
- Monitor response times
- Analyze throughput
- Identify bottlenecks
- Predict capacity needs

## Monitoring Stack

### Architecture
```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./prometheus/rules:/etc/prometheus/rules
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
      - '--web.enable-lifecycle'
    ports:
      - "9090:9090"
    networks:
      - monitoring

  grafana:
    image: grafana/grafana:latest
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}
      - GF_INSTALL_PLUGINS=grafana-piechart-panel,grafana-clock-panel
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning
      - ./grafana/dashboards:/var/lib/grafana/dashboards
      - grafana_data:/var/lib/grafana
    ports:
      - "3001:3000"
    networks:
      - monitoring
    depends_on:
      - prometheus

  alertmanager:
    image: prom/alertmanager:latest
    volumes:
      - ./alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml
      - alertmanager_data:/alertmanager
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--storage.path=/alertmanager'
    ports:
      - "9093:9093"
    networks:
      - monitoring

  node_exporter:
    image: prom/node-exporter:latest
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    ports:
      - "9100:9100"
    networks:
      - monitoring

  postgres_exporter:
    image: prometheuscommunity/postgres-exporter:latest
    environment:
      DATA_SOURCE_NAME: "postgresql://etl_user:password@postgres:5432/omfietser_etl?sslmode=disable"
    ports:
      - "9187:9187"
    networks:
      - monitoring

networks:
  monitoring:
    driver: bridge

volumes:
  prometheus_data:
  grafana_data:
  alertmanager_data:
```

## Prometheus Configuration

### Main Configuration
```yaml
# prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    monitor: 'omfietser-etl'
    environment: 'production'

# Alertmanager configuration
alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - alertmanager:9093

# Load rules
rule_files:
  - "/etc/prometheus/rules/*.yml"

# Scrape configurations
scrape_configs:
  # Prometheus self-monitoring
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Node exporter
  - job_name: 'node'
    static_configs:
      - targets: ['node_exporter:9100']

  # Postgres exporter
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres_exporter:9187']

  # Processor service
  - job_name: 'processor'
    static_configs:
      - targets: ['processor:3000']
    metrics_path: '/metrics'

  # Scrapers
  - job_name: 'scrapers'
    static_configs:
      - targets:
          - 'ah-scraper:8000'
          - 'jumbo-scraper:8000'
          - 'aldi-scraper:8000'
          - 'plus-scraper:8000'
          - 'kruidvat-scraper:8000'
    metrics_path: '/metrics'

  # Docker containers
  - job_name: 'docker'
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
    relabel_configs:
      - source_labels: [__meta_docker_container_name]
        target_label: container_name
      - source_labels: [__meta_docker_container_label_com_docker_compose_service]
        target_label: service
```

### Alert Rules
```yaml
# prometheus/rules/alerts.yml
groups:
  - name: service_alerts
    interval: 30s
    rules:
      # Service down
      - alert: ServiceDown
        expr: up == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"
          description: "{{ $labels.instance }} of job {{ $labels.job }} has been down for more than 2 minutes."

      # High CPU usage
      - alert: HighCPU
        expr: rate(process_cpu_seconds_total[5m]) * 100 > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage on {{ $labels.instance }}"
          description: "CPU usage is above 80% (current value: {{ $value }}%)"

      # High memory usage
      - alert: HighMemory
        expr: (process_resident_memory_bytes / 1024 / 1024) > 500
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.instance }}"
          description: "Memory usage is above 500MB (current value: {{ $value }}MB)"

      # Database connection pool exhausted
      - alert: DatabasePoolExhausted
        expr: pg_stat_database_numbackends / pg_settings_max_connections > 0.8
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Database connection pool near exhaustion"
          description: "Connection pool usage is above 80% ({{ $value }})"

      # Scraping failures
      - alert: ScrapingFailures
        expr: rate(scraper_errors_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High scraping error rate for {{ $labels.shop }}"
          description: "Error rate is {{ $value }} errors per second"

      # Processing slowdown
      - alert: ProcessingSlow
        expr: histogram_quantile(0.95, rate(processing_duration_seconds_bucket[5m])) > 60
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Processing is slow"
          description: "95th percentile processing time is {{ $value }}s"
```

## Grafana Dashboards

### ETL Overview Dashboard
```json
{
  "dashboard": {
    "title": "Omfietser ETL Overview",
    "panels": [
      {
        "title": "Service Status",
        "type": "stat",
        "targets": [
          {
            "expr": "up",
            "legendFormat": "{{ job }}"
          }
        ]
      },
      {
        "title": "Processing Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(products_processed_total[5m])",
            "legendFormat": "{{ shop }}"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(processing_errors_total[5m])",
            "legendFormat": "{{ error_type }}"
          }
        ]
      },
      {
        "title": "Database Connections",
        "type": "gauge",
        "targets": [
          {
            "expr": "pg_stat_database_numbackends / pg_settings_max_connections * 100",
            "legendFormat": "Connection Pool %"
          }
        ]
      },
      {
        "title": "Memory Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "process_resident_memory_bytes / 1024 / 1024",
            "legendFormat": "{{ job }} (MB)"
          }
        ]
      },
      {
        "title": "CPU Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(process_cpu_seconds_total[5m]) * 100",
            "legendFormat": "{{ job }} (%)"
          }
        ]
      }
    ]
  }
}
```

### Scraper Performance Dashboard
```json
{
  "dashboard": {
    "title": "Scraper Performance",
    "panels": [
      {
        "title": "Products Scraped",
        "type": "bargauge",
        "targets": [
          {
            "expr": "scraper_products_total",
            "legendFormat": "{{ shop }}"
          }
        ]
      },
      {
        "title": "Scraping Duration",
        "type": "heatmap",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(scraping_duration_seconds_bucket[5m]))",
            "legendFormat": "{{ shop }} p95"
          }
        ]
      },
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{ shop }} {{ status }}"
          }
        ]
      },
      {
        "title": "Rate Limit Hits",
        "type": "stat",
        "targets": [
          {
            "expr": "increase(rate_limit_hits_total[1h])",
            "legendFormat": "{{ shop }}"
          }
        ]
      }
    ]
  }
}
```

## Application Metrics

### Processor Metrics
```typescript
// processor/src/metrics.ts
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

const register = new Registry();

// Counters
export const productsProcessed = new Counter({
  name: 'products_processed_total',
  help: 'Total number of products processed',
  labelNames: ['shop', 'status'],
  registers: [register]
});

export const processingErrors = new Counter({
  name: 'processing_errors_total',
  help: 'Total number of processing errors',
  labelNames: ['shop', 'error_type'],
  registers: [register]
});

// Histograms
export const processingDuration = new Histogram({
  name: 'processing_duration_seconds',
  help: 'Processing duration in seconds',
  labelNames: ['shop'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120],
  registers: [register]
});

// Gauges
export const activeJobs = new Gauge({
  name: 'active_processing_jobs',
  help: 'Number of active processing jobs',
  labelNames: ['shop'],
  registers: [register]
});

export const databaseConnections = new Gauge({
  name: 'database_connections_active',
  help: 'Active database connections',
  registers: [register]
});

// Express middleware
export function metricsMiddleware(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    
    httpRequestDuration.observe({
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode
    }, duration);
  });
  
  next();
}

// Metrics endpoint
export function metricsEndpoint(req, res) {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
}
```

### Scraper Metrics
```python
# scrapers/shared/metrics.py
from prometheus_client import Counter, Histogram, Gauge, generate_latest
import time

# Metrics
products_scraped = Counter(
    'scraper_products_total',
    'Total products scraped',
    ['shop']
)

scraping_duration = Histogram(
    'scraping_duration_seconds',
    'Time spent scraping',
    ['shop'],
    buckets=[1, 5, 10, 30, 60, 120, 300, 600]
)

http_requests = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['shop', 'status']
)

rate_limit_hits = Counter(
    'rate_limit_hits_total',
    'Rate limit hits',
    ['shop']
)

active_scrapers = Gauge(
    'active_scrapers',
    'Number of active scraper instances',
    ['shop']
)

# Decorator for timing
def measure_duration(shop):
    def decorator(func):
        def wrapper(*args, **kwargs):
            start = time.time()
            try:
                result = func(*args, **kwargs)
                return result
            finally:
                duration = time.time() - start
                scraping_duration.labels(shop=shop).observe(duration)
        return wrapper
    return decorator

# Metrics endpoint
def metrics_endpoint():
    return generate_latest()
```

## Alertmanager Configuration

```yaml
# alertmanager/alertmanager.yml
global:
  resolve_timeout: 5m
  smtp_from: 'alerts@omfietser.com'
  smtp_smarthost: 'smtp.gmail.com:587'
  smtp_auth_username: 'alerts@omfietser.com'
  smtp_auth_password: 'password'

route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'team-notifications'
  
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty'
      continue: true
    
    - match:
        severity: warning
      receiver: 'team-notifications'

receivers:
  - name: 'team-notifications'
    email_configs:
      - to: 'team@omfietser.com'
        headers:
          Subject: 'ETL Alert: {{ .GroupLabels.alertname }}'
    
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_URL}'
        channel: '#etl-alerts'
        title: 'ETL Alert'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'

  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: '${PAGERDUTY_KEY}'
        description: '{{ .GroupLabels.alertname }}'

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'service']
```

## Success Criteria

- All services have metrics endpoints
- Dashboards cover all key metrics
- Alerts fire within 2 minutes
- No false positive alerts
- Complete service visibility
- Historical data retention > 30 days