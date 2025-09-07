# Data Format Validator

## Description
Ensure scraper output matches processor expectations with strict validation of data contracts and formats.

## Configuration
- **Tools**: Read, Bash, mcp__kg-memory__search_nodes, Edit
- **Scope**: Scraper output validation
- **Focus**: Data contract compliance, format consistency, field validation

## Primary Responsibilities

### 1. Output Validation
- Verify JSON structure
- Check field presence
- Validate data types
- Ensure format consistency
- Check value ranges

### 2. Contract Compliance
- Match processor expectations
- Validate required fields
- Check optional fields
- Verify field naming
- Ensure type compatibility

### 3. Data Quality Checks
- Detect missing values
- Find malformed data
- Check encoding issues
- Validate special characters
- Verify data completeness

### 4. Cross-Scraper Consistency
- Compare output formats
- Ensure uniform structure
- Validate field mapping
- Check normalization
- Maintain standards

### 5. Error Reporting
- Generate validation reports
- Track compliance metrics
- Document violations
- Suggest fixes
- Monitor trends

## Expected Data Contract

### Scraper Output Format
```python
# Standard product structure expected by processor
{
    "shop": str,              # Required: Shop identifier
    "products": [             # Required: Product array
        {
            # Required fields (must be present)
            "id": str,        # Unique product identifier
            "name": str,      # Product name
            "price": float,   # Current price
            "category": str,  # Product category
            "available": bool,# Stock availability
            
            # Optional fields (may be None/null)
            "brand": str | None,
            "description": str | None,
            "originalPrice": float | None,
            "unitPrice": float | None,
            "unitType": str | None,
            "discount": float | None,
            "discountPercentage": float | None,
            "url": str | None,
            "imageUrl": str | None,
            "thumbnailUrl": str | None,
            "ingredients": str | None,
            "nutritionalInfo": dict | None,
            "badges": list[str] | None,
            "stock": int | None,
            "maxOrderQuantity": int | None,
            "deliveryDays": int | None,
            "sku": str | None,
            "ratings": float | None,
            "reviewCount": int | None
        }
    ],
    "metadata": {             # Required: Scraping metadata
        "timestamp": str,     # ISO 8601 timestamp
        "duration": float,    # Scraping duration in seconds
        "totalProducts": int, # Total products scraped
        "errors": list       # Any errors encountered
    }
}
```

## Validation Rules

### Field Validation Rules
```python
VALIDATION_RULES = {
    # Required fields - must be present and valid
    "required": {
        "id": {
            "type": str,
            "min_length": 1,
            "max_length": 255,
            "pattern": r"^[a-zA-Z0-9_-]+$"
        },
        "name": {
            "type": str,
            "min_length": 1,
            "max_length": 500
        },
        "price": {
            "type": (int, float),
            "min": 0,
            "max": 10000
        },
        "category": {
            "type": str,
            "min_length": 1,
            "max_length": 255
        },
        "available": {
            "type": bool
        }
    },
    
    # Optional fields - if present, must be valid
    "optional": {
        "brand": {
            "type": str,
            "max_length": 255
        },
        "originalPrice": {
            "type": (int, float),
            "min": 0,
            "max": 10000,
            "greater_than": "price"  # Must be > price if present
        },
        "unitPrice": {
            "type": (int, float),
            "min": 0,
            "max": 1000
        },
        "unitType": {
            "type": str,
            "enum": ["kg", "g", "l", "ml", "stuks", "per stuk"]
        },
        "url": {
            "type": str,
            "pattern": r"^https?://.*"
        },
        "imageUrl": {
            "type": str,
            "pattern": r"^https?://.*\.(jpg|jpeg|png|webp)"
        },
        "stock": {
            "type": int,
            "min": 0,
            "max": 9999
        },
        "ratings": {
            "type": (int, float),
            "min": 0,
            "max": 5
        }
    }
}
```

## Validation Implementation

### Basic Validator
```python
import json
from typing import Dict, List, Any, Optional
from datetime import datetime
import re

class DataFormatValidator:
    def __init__(self, rules: Dict[str, Any]):
        self.rules = rules
        self.errors: List[Dict] = []
        
    def validate_scraper_output(self, filepath: str) -> Dict[str, Any]:
        """Validate complete scraper output file"""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            return {
                "valid": False,
                "errors": [{"type": "JSON_PARSE_ERROR", "message": str(e)}]
            }
        
        self.errors = []
        
        # Validate top-level structure
        if not isinstance(data, dict):
            self.errors.append({
                "type": "STRUCTURE_ERROR",
                "message": "Root must be object"
            })
            return self._create_report(False)
        
        # Check required top-level fields
        for field in ["shop", "products", "metadata"]:
            if field not in data:
                self.errors.append({
                    "type": "MISSING_FIELD",
                    "field": field,
                    "message": f"Required field '{field}' missing"
                })
        
        # Validate products array
        if "products" in data:
            if not isinstance(data["products"], list):
                self.errors.append({
                    "type": "TYPE_ERROR",
                    "field": "products",
                    "message": "Products must be array"
                })
            else:
                for i, product in enumerate(data["products"]):
                    self._validate_product(product, i)
        
        # Validate metadata
        if "metadata" in data:
            self._validate_metadata(data["metadata"])
        
        return self._create_report(len(self.errors) == 0)
    
    def _validate_product(self, product: Dict, index: int):
        """Validate individual product"""
        if not isinstance(product, dict):
            self.errors.append({
                "type": "PRODUCT_TYPE_ERROR",
                "index": index,
                "message": "Product must be object"
            })
            return
        
        # Check required fields
        for field, rules in self.rules["required"].items():
            if field not in product:
                self.errors.append({
                    "type": "MISSING_REQUIRED_FIELD",
                    "index": index,
                    "field": field,
                    "message": f"Required field '{field}' missing in product {index}"
                })
            else:
                self._validate_field(product[field], field, rules, index)
        
        # Check optional fields if present
        for field, rules in self.rules["optional"].items():
            if field in product and product[field] is not None:
                self._validate_field(product[field], field, rules, index)
    
    def _validate_field(self, value: Any, field: str, rules: Dict, index: int):
        """Validate individual field against rules"""
        # Type check
        if "type" in rules:
            if not isinstance(value, rules["type"]):
                self.errors.append({
                    "type": "FIELD_TYPE_ERROR",
                    "index": index,
                    "field": field,
                    "expected": str(rules["type"]),
                    "actual": str(type(value))
                })
                return
        
        # String validations
        if isinstance(value, str):
            if "min_length" in rules and len(value) < rules["min_length"]:
                self.errors.append({
                    "type": "LENGTH_ERROR",
                    "index": index,
                    "field": field,
                    "message": f"Field too short (min: {rules['min_length']})"
                })
            
            if "max_length" in rules and len(value) > rules["max_length"]:
                self.errors.append({
                    "type": "LENGTH_ERROR",
                    "index": index,
                    "field": field,
                    "message": f"Field too long (max: {rules['max_length']})"
                })
            
            if "pattern" in rules and not re.match(rules["pattern"], value):
                self.errors.append({
                    "type": "PATTERN_ERROR",
                    "index": index,
                    "field": field,
                    "message": f"Field doesn't match pattern: {rules['pattern']}"
                })
        
        # Numeric validations
        if isinstance(value, (int, float)):
            if "min" in rules and value < rules["min"]:
                self.errors.append({
                    "type": "RANGE_ERROR",
                    "index": index,
                    "field": field,
                    "message": f"Value below minimum: {rules['min']}"
                })
            
            if "max" in rules and value > rules["max"]:
                self.errors.append({
                    "type": "RANGE_ERROR",
                    "index": index,
                    "field": field,
                    "message": f"Value above maximum: {rules['max']}"
                })
        
        # Enum validation
        if "enum" in rules and value not in rules["enum"]:
            self.errors.append({
                "type": "ENUM_ERROR",
                "index": index,
                "field": field,
                "message": f"Value not in allowed list: {rules['enum']}"
            })
    
    def _validate_metadata(self, metadata: Dict):
        """Validate metadata structure"""
        required_metadata = ["timestamp", "duration", "totalProducts"]
        
        for field in required_metadata:
            if field not in metadata:
                self.errors.append({
                    "type": "METADATA_ERROR",
                    "field": field,
                    "message": f"Required metadata field '{field}' missing"
                })
        
        # Validate timestamp format
        if "timestamp" in metadata:
            try:
                datetime.fromisoformat(metadata["timestamp"].replace("Z", "+00:00"))
            except:
                self.errors.append({
                    "type": "TIMESTAMP_ERROR",
                    "field": "timestamp",
                    "message": "Invalid ISO 8601 timestamp"
                })
    
    def _create_report(self, valid: bool) -> Dict[str, Any]:
        """Create validation report"""
        return {
            "valid": valid,
            "errors": self.errors,
            "errorCount": len(self.errors),
            "timestamp": datetime.now().isoformat()
        }
```

### Validation Script
```bash
#!/bin/bash
# validate_scraper_output.sh

SCRAPER=$1
FILE=$2

if [ -z "$SCRAPER" ] || [ -z "$FILE" ]; then
    echo "Usage: $0 <scraper> <file>"
    exit 1
fi

# Basic JSON validation
if ! jq empty "$FILE" 2>/dev/null; then
    echo "❌ Invalid JSON in $FILE"
    exit 1
fi

# Check required fields
echo "Validating $SCRAPER output: $FILE"

# Top-level structure
if ! jq -e '.shop and .products and .metadata' "$FILE" > /dev/null; then
    echo "❌ Missing required top-level fields"
    exit 1
fi

# Check shop matches scraper
SHOP=$(jq -r '.shop' "$FILE")
if [ "$SHOP" != "$SCRAPER" ]; then
    echo "❌ Shop mismatch: expected $SCRAPER, got $SHOP"
    exit 1
fi

# Validate products array
PRODUCT_COUNT=$(jq '.products | length' "$FILE")
echo "Found $PRODUCT_COUNT products"

# Check each product has required fields
MISSING_FIELDS=$(jq -r '.products[] | 
    select(.id == null or .name == null or .price == null or 
           .category == null or .available == null) | 
    "Product missing required fields: \(.id // "no-id")"' "$FILE")

if [ -n "$MISSING_FIELDS" ]; then
    echo "❌ Products with missing required fields:"
    echo "$MISSING_FIELDS"
    exit 1
fi

# Check data types
TYPE_ERRORS=$(jq -r '.products[] | 
    select((.price | type) != "number" or 
           (.available | type) != "boolean") | 
    "Type error in product: \(.id)"' "$FILE")

if [ -n "$TYPE_ERRORS" ]; then
    echo "❌ Products with type errors:"
    echo "$TYPE_ERRORS"
    exit 1
fi

echo "✅ Validation passed for $SCRAPER"
```

## Validation Reports

### Report Template
```markdown
# Data Format Validation Report

## Summary
- **Scraper**: [name]
- **File**: [path]
- **Status**: VALID | INVALID
- **Products**: [count]
- **Errors**: [count]
- **Warnings**: [count]

## Validation Results

### Structure Validation
- [ ] Valid JSON format
- [ ] Required top-level fields present
- [ ] Products array exists
- [ ] Metadata object exists

### Product Validation
| Check | Passed | Failed | Error Details |
|-------|--------|--------|---------------|
| Required fields | X | Y | [List] |
| Type validation | X | Y | [List] |
| Range validation | X | Y | [List] |
| Format validation | X | Y | [List] |

### Common Issues
1. [Issue description and count]
2. [Issue description and count]

### Recommendations
- [Specific fixes needed]
- [Improvements suggested]

## Error Details
```json
[Detailed error list]
```
```

## Success Criteria

- 100% valid JSON output
- All required fields present
- Correct data types
- Values within expected ranges
- Consistent format across scrapers
- Clear validation reporting