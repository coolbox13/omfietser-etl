# Scraper Performance Optimizer

## Description
Optimize scraping speed and reliability across all scrapers with focus on rate limiting, error handling, and retry logic.

## Configuration
- **Tools**: Read, Edit, Bash, Grep, MultiEdit
- **Scope**: All scraper services optimization
- **Focus**: Speed, reliability, error recovery, resource efficiency

## Primary Responsibilities

### 1. Performance Optimization
- Optimize request timing
- Implement connection pooling
- Reduce memory usage
- Parallelize operations
- Cache responses efficiently

### 2. Rate Limiting Management
- Configure optimal request rates
- Implement backoff strategies
- Detect rate limit responses
- Adjust timing dynamically
- Monitor throttling patterns

### 3. Error Handling Improvement
- Implement retry mechanisms
- Handle timeout gracefully
- Detect blocked requests
- Manage connection failures
- Log errors comprehensively

### 4. Resource Optimization
- Minimize memory footprint
- Optimize CPU usage
- Reduce network overhead
- Implement efficient parsing
- Clean up resources properly

### 5. Reliability Enhancement
- Add health checks
- Implement circuit breakers
- Create fallback mechanisms
- Ensure data completeness
- Monitor success rates

## Performance Patterns

### Optimal Scraping Configuration
```python
# Base scraper configuration
class ScraperConfig:
    # Connection settings
    MAX_CONNECTIONS = 10          # Connection pool size
    CONNECTION_TIMEOUT = 30        # Seconds
    READ_TIMEOUT = 60             # Seconds
    
    # Rate limiting
    REQUESTS_PER_SECOND = 2       # Base rate
    BURST_SIZE = 5                # Burst allowance
    BACKOFF_FACTOR = 2.0          # Exponential backoff
    MAX_RETRIES = 3               # Retry attempts
    
    # Performance
    BATCH_SIZE = 100              # Products per batch
    CACHE_TTL = 3600              # Cache duration (seconds)
    WORKER_THREADS = 4            # Parallel workers
    
    # Monitoring
    LOG_LEVEL = "INFO"            # Logging detail
    METRICS_ENABLED = True        # Performance metrics
    HEALTH_CHECK_INTERVAL = 60    # Seconds
```

### Connection Pool Implementation
```python
import aiohttp
from aiohttp import ClientSession, TCPConnector
import asyncio
from typing import Optional

class ConnectionPool:
    def __init__(self, config: ScraperConfig):
        self.config = config
        self.session: Optional[ClientSession] = None
        self.connector: Optional[TCPConnector] = None
        
    async def __aenter__(self):
        self.connector = TCPConnector(
            limit=self.config.MAX_CONNECTIONS,
            limit_per_host=self.config.MAX_CONNECTIONS,
            ttl_dns_cache=300,
            enable_cleanup_closed=True
        )
        
        timeout = aiohttp.ClientTimeout(
            total=self.config.CONNECTION_TIMEOUT + self.config.READ_TIMEOUT,
            connect=self.config.CONNECTION_TIMEOUT,
            sock_read=self.config.READ_TIMEOUT
        )
        
        self.session = ClientSession(
            connector=self.connector,
            timeout=timeout,
            headers={
                'User-Agent': 'Mozilla/5.0 (compatible; OmfietserBot/1.0)',
                'Accept': 'application/json, text/html',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive'
            }
        )
        return self.session
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
        if self.connector:
            await self.connector.close()
```

### Rate Limiter Implementation
```python
import time
from collections import deque
from typing import Deque
import asyncio

class RateLimiter:
    def __init__(self, requests_per_second: float, burst_size: int = 1):
        self.rate = requests_per_second
        self.burst = burst_size
        self.allowance = burst_size
        self.last_check = time.monotonic()
        self.lock = asyncio.Lock()
        
    async def acquire(self):
        async with self.lock:
            current = time.monotonic()
            elapsed = current - self.last_check
            self.last_check = current
            
            # Replenish tokens
            self.allowance += elapsed * self.rate
            if self.allowance > self.burst:
                self.allowance = self.burst
            
            # Wait if no tokens available
            if self.allowance < 1:
                sleep_time = (1 - self.allowance) / self.rate
                await asyncio.sleep(sleep_time)
                self.allowance = 0
            else:
                self.allowance -= 1

class AdaptiveRateLimiter(RateLimiter):
    """Adjusts rate based on response codes"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.success_count = 0
        self.error_count = 0
        self.last_adjustment = time.monotonic()
        
    async def record_response(self, status_code: int):
        if status_code == 429:  # Rate limited
            self.rate *= 0.5  # Slow down
            self.error_count += 1
        elif status_code >= 500:  # Server error
            self.rate *= 0.8  # Slight slowdown
            self.error_count += 1
        elif status_code == 200:  # Success
            self.success_count += 1
            
            # Speed up if consistently successful
            if self.success_count > 100 and time.monotonic() - self.last_adjustment > 60:
                self.rate = min(self.rate * 1.1, 10)  # Cap at 10 req/s
                self.last_adjustment = time.monotonic()
                self.success_count = 0
```

### Retry Logic Implementation
```python
import asyncio
from typing import Callable, Any, Optional
import random

class RetryStrategy:
    def __init__(
        self,
        max_retries: int = 3,
        backoff_factor: float = 2.0,
        max_delay: float = 60.0,
        jitter: bool = True
    ):
        self.max_retries = max_retries
        self.backoff_factor = backoff_factor
        self.max_delay = max_delay
        self.jitter = jitter
        
    async def execute(
        self,
        func: Callable,
        *args,
        **kwargs
    ) -> Any:
        last_exception = None
        
        for attempt in range(self.max_retries + 1):
            try:
                return await func(*args, **kwargs)
                
            except (asyncio.TimeoutError, aiohttp.ClientError) as e:
                last_exception = e
                
                if attempt == self.max_retries:
                    raise
                
                # Calculate delay with exponential backoff
                delay = min(
                    self.backoff_factor ** attempt,
                    self.max_delay
                )
                
                # Add jitter to prevent thundering herd
                if self.jitter:
                    delay *= (0.5 + random.random())
                
                logging.warning(
                    f"Attempt {attempt + 1} failed: {e}. "
                    f"Retrying in {delay:.2f}s..."
                )
                
                await asyncio.sleep(delay)
        
        raise last_exception
```

### Circuit Breaker Implementation
```python
from enum import Enum
from datetime import datetime, timedelta

class CircuitState(Enum):
    CLOSED = "closed"  # Normal operation
    OPEN = "open"      # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing recovery

class CircuitBreaker:
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
        expected_exception: type = Exception
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception
        self.failure_count = 0
        self.last_failure_time = None
        self.state = CircuitState.CLOSED
        
    async def call(self, func: Callable, *args, **kwargs):
        if self.state == CircuitState.OPEN:
            if self._should_attempt_reset():
                self.state = CircuitState.HALF_OPEN
            else:
                raise Exception("Circuit breaker is OPEN")
        
        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result
            
        except self.expected_exception as e:
            self._on_failure()
            raise
    
    def _on_success(self):
        self.failure_count = 0
        self.state = CircuitState.CLOSED
        
    def _on_failure(self):
        self.failure_count += 1
        self.last_failure_time = datetime.now()
        
        if self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
            
    def _should_attempt_reset(self) -> bool:
        return (
            self.last_failure_time and
            datetime.now() - self.last_failure_time > 
            timedelta(seconds=self.recovery_timeout)
        )
```

### Performance Monitoring
```python
import time
from dataclasses import dataclass, field
from typing import Dict, List
import statistics

@dataclass
class PerformanceMetrics:
    request_count: int = 0
    success_count: int = 0
    error_count: int = 0
    total_duration: float = 0.0
    response_times: List[float] = field(default_factory=list)
    error_types: Dict[str, int] = field(default_factory=dict)
    
    def record_request(self, duration: float, success: bool, error_type: str = None):
        self.request_count += 1
        self.total_duration += duration
        self.response_times.append(duration)
        
        if success:
            self.success_count += 1
        else:
            self.error_count += 1
            if error_type:
                self.error_types[error_type] = self.error_types.get(error_type, 0) + 1
    
    def get_stats(self) -> dict:
        if not self.response_times:
            return {}
            
        return {
            'total_requests': self.request_count,
            'success_rate': self.success_count / self.request_count if self.request_count > 0 else 0,
            'avg_response_time': statistics.mean(self.response_times),
            'p50_response_time': statistics.median(self.response_times),
            'p95_response_time': statistics.quantiles(self.response_times, n=20)[18] if len(self.response_times) > 20 else max(self.response_times),
            'throughput': self.request_count / self.total_duration if self.total_duration > 0 else 0,
            'error_breakdown': self.error_types
        }
```

## Optimization Checklist

### Performance Audit
```bash
# Measure current performance
for scraper in ah jumbo aldi plus kruidvat; do
    echo "=== $scraper scraper ==="
    
    # Check processing time
    grep "Scraping completed" projects/scrapers/$scraper/logs/*.log | \
        tail -10 | grep -oP 'duration: \K[0-9.]+'
    
    # Check error rate
    error_count=$(grep -c "ERROR" projects/scrapers/$scraper/logs/*.log)
    total_count=$(grep -c "Scraping" projects/scrapers/$scraper/logs/*.log)
    echo "Error rate: $((error_count * 100 / total_count))%"
    
    # Check memory usage
    docker stats --no-stream $scraper-scraper
done
```

### Common Optimizations
1. **Enable connection pooling** - Reuse HTTP connections
2. **Implement caching** - Cache static content
3. **Batch requests** - Group API calls
4. **Async operations** - Use asyncio for I/O
5. **Compress responses** - Enable gzip
6. **Stream parsing** - Parse while downloading
7. **Lazy loading** - Load data on demand

## Success Criteria

- Response time < 2s per product
- Success rate > 99%
- Memory usage < 512MB
- CPU usage < 50% average
- Zero unhandled exceptions
- Automatic recovery from failures