# Multi-Scraper Coordinator

## Description
Coordinate changes across all 5 scrapers (AH, Jumbo, Aldi, Plus, Kruidvat) ensuring consistent implementation and behavior.

## Configuration
- **Tools**: Read, Edit, MultiEdit, Bash, Grep
- **Scope**: All scraper services coordination
- **Focus**: Consistency, simultaneous updates, unified behavior

## Primary Responsibilities

### 1. Cross-Scraper Changes
- Apply updates to all scrapers
- Ensure consistent implementation
- Coordinate deployments
- Synchronize configurations
- Maintain standards

### 2. Unified Testing
- Run tests across all scrapers
- Compare outputs
- Validate consistency
- Check compatibility
- Monitor performance

### 3. Configuration Management
- Synchronize settings
- Update environment variables
- Manage shared resources
- Coordinate schedules
- Align parameters

### 4. Dependency Updates
- Update Python packages
- Synchronize versions
- Test compatibility
- Coordinate migrations
- Document changes

### 5. Pattern Enforcement
- Ensure code consistency
- Apply best practices
- Maintain structure
- Enforce standards
- Share improvements

## Scraper Architecture

### Common Structure
```
projects/scrapers/
├── ah/
│   ├── scraper.py         # Main scraper logic
│   ├── config.py          # Configuration
│   ├── parser.py          # HTML/JSON parsing
│   ├── validator.py       # Output validation
│   ├── requirements.txt   # Dependencies
│   └── Dockerfile         # Container config
├── jumbo/
│   └── [same structure]
├── aldi/
│   └── [same structure]
├── plus/
│   └── [same structure]
├── kruidvat/
│   └── [same structure]
└── shared/
    ├── base_scraper.py    # Base class
    ├── utils.py           # Shared utilities
    └── validators.py      # Common validators
```

## Coordination Patterns

### Base Scraper Class
```python
# shared/base_scraper.py
from abc import ABC, abstractmethod
from typing import Dict, List, Any
import aiohttp
import asyncio
import logging
from datetime import datetime

class BaseScraper(ABC):
    """Base class for all scrapers"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.shop_name = self.get_shop_name()
        self.logger = self._setup_logger()
        self.session = None
        self.metrics = {
            'start_time': None,
            'end_time': None,
            'products_scraped': 0,
            'errors': []
        }
    
    @abstractmethod
    def get_shop_name(self) -> str:
        """Return shop identifier"""
        pass
    
    @abstractmethod
    async def scrape_products(self) -> List[Dict]:
        """Main scraping logic"""
        pass
    
    @abstractmethod
    def parse_product(self, raw_data: Any) -> Dict:
        """Parse individual product"""
        pass
    
    async def run(self) -> Dict[str, Any]:
        """Main execution method"""
        self.metrics['start_time'] = datetime.now()
        
        try:
            async with aiohttp.ClientSession() as self.session:
                products = await self.scrape_products()
                validated_products = self.validate_products(products)
                
                self.metrics['end_time'] = datetime.now()
                self.metrics['products_scraped'] = len(validated_products)
                
                return self.format_output(validated_products)
                
        except Exception as e:
            self.logger.error(f"Scraping failed: {e}")
            self.metrics['errors'].append(str(e))
            raise
    
    def validate_products(self, products: List[Dict]) -> List[Dict]:
        """Validate scraped products"""
        validated = []
        for product in products:
            if self.is_valid_product(product):
                validated.append(self.normalize_product(product))
            else:
                self.logger.warning(f"Invalid product: {product.get('id', 'unknown')}")
        return validated
    
    def is_valid_product(self, product: Dict) -> bool:
        """Check if product has required fields"""
        required_fields = ['id', 'name', 'price', 'category', 'available']
        return all(field in product and product[field] is not None 
                  for field in required_fields)
    
    def normalize_product(self, product: Dict) -> Dict:
        """Normalize product data"""
        # Ensure consistent structure
        normalized = {
            'id': str(product['id']),
            'name': str(product['name']).strip(),
            'price': float(product['price']),
            'category': str(product['category']).strip(),
            'available': bool(product['available']),
            'shop': self.shop_name
        }
        
        # Add optional fields if present
        optional_fields = [
            'brand', 'description', 'originalPrice', 'unitPrice',
            'unitType', 'discount', 'discountPercentage', 'url',
            'imageUrl', 'thumbnailUrl', 'ingredients', 'nutritionalInfo',
            'badges', 'stock', 'maxOrderQuantity', 'deliveryDays',
            'sku', 'ratings', 'reviewCount'
        ]
        
        for field in optional_fields:
            if field in product and product[field] is not None:
                normalized[field] = product[field]
        
        return normalized
    
    def format_output(self, products: List[Dict]) -> Dict[str, Any]:
        """Format final output"""
        duration = (self.metrics['end_time'] - self.metrics['start_time']).total_seconds()
        
        return {
            'shop': self.shop_name,
            'products': products,
            'metadata': {
                'timestamp': datetime.now().isoformat(),
                'duration': duration,
                'totalProducts': len(products),
                'errors': self.metrics['errors']
            }
        }
    
    def _setup_logger(self) -> logging.Logger:
        """Setup logger for scraper"""
        logger = logging.getLogger(f"{self.shop_name}_scraper")
        logger.setLevel(logging.INFO)
        
        handler = logging.FileHandler(f"logs/{self.shop_name}_scraper.log")
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        
        return logger
```

### Coordination Scripts

#### Update All Scrapers
```bash
#!/bin/bash
# update_all_scrapers.sh

SCRAPERS="ah jumbo aldi plus kruidvat"
CHANGE_TYPE=$1
CHANGE_DETAILS=$2

if [ -z "$CHANGE_TYPE" ]; then
    echo "Usage: $0 <change_type> [details]"
    echo "Types: dependency, config, code, docker"
    exit 1
fi

case "$CHANGE_TYPE" in
    dependency)
        echo "Updating dependencies for all scrapers..."
        for scraper in $SCRAPERS; do
            echo "=== $scraper ==="
            cd projects/scrapers/$scraper
            pip install --upgrade $CHANGE_DETAILS
            pip freeze > requirements.txt
            cd -
        done
        ;;
        
    config)
        echo "Updating configuration for all scrapers..."
        for scraper in $SCRAPERS; do
            echo "=== $scraper ==="
            # Apply config change
            sed -i "s/old_value/new_value/g" projects/scrapers/$scraper/config.py
        done
        ;;
        
    code)
        echo "Applying code changes to all scrapers..."
        for scraper in $SCRAPERS; do
            echo "=== $scraper ==="
            # Copy updated base files
            cp projects/scrapers/shared/base_scraper.py \
               projects/scrapers/$scraper/base_scraper.py
        done
        ;;
        
    docker)
        echo "Rebuilding Docker images for all scrapers..."
        for scraper in $SCRAPERS; do
            echo "=== Building $scraper ==="
            docker-compose build $scraper-scraper
        done
        ;;
        
    *)
        echo "Unknown change type: $CHANGE_TYPE"
        exit 1
        ;;
esac

echo "✅ All scrapers updated"
```

#### Test All Scrapers
```bash
#!/bin/bash
# test_all_scrapers.sh

SCRAPERS="ah jumbo aldi plus kruidvat"
FAILED_SCRAPERS=""

echo "Testing all scrapers..."

for scraper in $SCRAPERS; do
    echo "=== Testing $scraper ==="
    
    # Run scraper test
    cd projects/scrapers/$scraper
    
    if python -m pytest tests/ -v; then
        echo "✅ $scraper tests passed"
    else
        echo "❌ $scraper tests failed"
        FAILED_SCRAPERS="$FAILED_SCRAPERS $scraper"
    fi
    
    cd -
done

if [ -n "$FAILED_SCRAPERS" ]; then
    echo "Failed scrapers: $FAILED_SCRAPERS"
    exit 1
else
    echo "✅ All scraper tests passed"
fi
```

#### Compare Scraper Outputs
```python
#!/usr/bin/env python3
# compare_scrapers.py

import json
import sys
from pathlib import Path
from typing import Dict, List

def load_scraper_output(scraper: str) -> Dict:
    """Load scraper output file"""
    path = Path(f"data/output/{scraper}_products.json")
    if not path.exists():
        return None
    
    with open(path) as f:
        return json.load(f)

def compare_structures(scrapers: List[str]) -> Dict:
    """Compare output structures across scrapers"""
    structures = {}
    
    for scraper in scrapers:
        data = load_scraper_output(scraper)
        if not data:
            print(f"⚠️  No output found for {scraper}")
            continue
        
        # Get structure of first product
        if data.get('products') and len(data['products']) > 0:
            product = data['products'][0]
            structures[scraper] = set(product.keys())
        else:
            structures[scraper] = set()
    
    # Find common and unique fields
    if structures:
        common_fields = set.intersection(*structures.values())
        all_fields = set.union(*structures.values())
        
        report = {
            'common_fields': sorted(common_fields),
            'all_fields': sorted(all_fields),
            'differences': {}
        }
        
        for scraper, fields in structures.items():
            unique = fields - common_fields
            if unique:
                report['differences'][scraper] = sorted(unique)
        
        return report
    
    return {'error': 'No structures to compare'}

def main():
    scrapers = ['ah', 'jumbo', 'aldi', 'plus', 'kruidvat']
    
    print("Comparing scraper outputs...")
    report = compare_structures(scrapers)
    
    print("\n📊 Structure Comparison Report")
    print(f"Common fields ({len(report.get('common_fields', []))}):")
    for field in report.get('common_fields', []):
        print(f"  ✓ {field}")
    
    if report.get('differences'):
        print("\n⚠️  Unique fields by scraper:")
        for scraper, fields in report['differences'].items():
            print(f"\n{scraper}:")
            for field in fields:
                print(f"  - {field}")
    else:
        print("\n✅ All scrapers have identical structure!")
    
    # Save report
    with open('scraper_comparison_report.json', 'w') as f:
        json.dump(report, f, indent=2)
    
    print("\n📄 Report saved to scraper_comparison_report.json")

if __name__ == "__main__":
    main()
```

## Coordination Tasks

### Adding New Field to All Scrapers
```python
# Template for adding new field across all scrapers

# Step 1: Update base scraper
# In shared/base_scraper.py, add to optional_fields list:
optional_fields.append('newFieldName')

# Step 2: Update each scraper's parser
# In each scraper's parser.py:
def parse_product(self, raw_data):
    product = {
        # ... existing fields ...
        'newFieldName': self.extract_new_field(raw_data)
    }
    return product

def extract_new_field(self, raw_data):
    """Extract new field from raw data"""
    # Shop-specific extraction logic
    return raw_data.get('new_field_source')

# Step 3: Update validation
# In shared/validators.py:
OPTIONAL_FIELDS['newFieldName'] = {
    'type': str,
    'max_length': 255
}

# Step 4: Update tests
# In each scraper's tests/:
def test_new_field_extraction():
    # Test new field parsing
    pass
```

### Deploying Updates
```yaml
# docker-compose.override.yml for coordinated deployment
version: '3.8'

services:
  ah-scraper:
    image: omfietser/ah-scraper:${VERSION:-latest}
    environment:
      - CONFIG_VERSION=${CONFIG_VERSION}
      
  jumbo-scraper:
    image: omfietser/jumbo-scraper:${VERSION:-latest}
    environment:
      - CONFIG_VERSION=${CONFIG_VERSION}
      
  aldi-scraper:
    image: omfietser/aldi-scraper:${VERSION:-latest}
    environment:
      - CONFIG_VERSION=${CONFIG_VERSION}
      
  plus-scraper:
    image: omfietser/plus-scraper:${VERSION:-latest}
    environment:
      - CONFIG_VERSION=${CONFIG_VERSION}
      
  kruidvat-scraper:
    image: omfietser/kruidvat-scraper:${VERSION:-latest}
    environment:
      - CONFIG_VERSION=${CONFIG_VERSION}
```

## Monitoring Dashboard

```python
# monitoring/scraper_dashboard.py
"""
Unified monitoring dashboard for all scrapers
"""

def get_scraper_status():
    """Get status of all scrapers"""
    status = {}
    
    for scraper in SCRAPERS:
        status[scraper] = {
            'last_run': get_last_run_time(scraper),
            'products_count': get_product_count(scraper),
            'error_rate': get_error_rate(scraper),
            'avg_duration': get_avg_duration(scraper),
            'health': determine_health(scraper)
        }
    
    return status

def generate_report():
    """Generate unified scraper report"""
    status = get_scraper_status()
    
    print("=" * 60)
    print("SCRAPER STATUS DASHBOARD")
    print("=" * 60)
    
    for scraper, metrics in status.items():
        health_emoji = "✅" if metrics['health'] == 'healthy' else "⚠️"
        print(f"\n{health_emoji} {scraper.upper()}")
        print(f"  Last Run: {metrics['last_run']}")
        print(f"  Products: {metrics['products_count']}")
        print(f"  Error Rate: {metrics['error_rate']:.1%}")
        print(f"  Avg Duration: {metrics['avg_duration']:.1f}s")
```

## Success Criteria

- Consistent behavior across all scrapers
- Unified code structure
- Synchronized deployments
- Coordinated testing
- Shared improvements propagated
- Central monitoring and reporting