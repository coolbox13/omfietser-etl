# Product Data Testing Tools

This directory contains testing utilities for supermarket product data processing, particularly focused on promotion parsing.

## Scripts

### 1. `simple-sample-products.ts` (Recommended)

A lightweight script with minimal dependencies that samples products from source data.

#### Features:
- Directly parses JSON files without complex dependencies
- Samples products into basic categories (regular, discount, multipack, other)
- Creates both category-specific and combined sample files

#### Usage:
```bash
# Run from project root
npx ts-node src/testing/simple-sample-products.ts
```

### 2. `sample-test-products.ts` (Advanced)

A more advanced sampler that creates detailed categorization of promotion types.

#### Features:
- Samples products from all supermarkets (AH, Jumbo, ALDI, Plus)
- Automatically categorizes by specific promotion types (X_FOR_Y, X_PLUS_Y_FREE, etc.)
- Creates separate test files for each promotion category
- Creates combined test files with diverse promotion types

#### Usage:
```bash
# Run from project root
npx ts-node src/testing/sample-test-products.ts
```

### 3. `run-promotion-tests.ts`

Tests the promotion parsing functionality with mocked processors.

#### Features:
- Processes test data through mock supermarket processors
- Includes a simple enricher implementation for promotion parsing
- Identifies issues with missing promotion fields
- Generates detailed test reports without external dependencies

#### Usage:
```bash
# Run from project root
npx ts-node src/testing/run-promotion-tests.ts
```

## Configuration

The testing utilities include a standalone configuration module (`config-helper.ts`) that:
- Loads configuration from the project's default.json if available
- Falls back to sensible defaults if not found
- Reduces dependencies on other project modules

## Promotion Types

The testing tools track the following promotion types:

1. `X_FOR_Y` - Products with "X voor Y" promotions (e.g., "2 voor €3")
2. `X_PLUS_Y_FREE` - Products with "X+Y gratis" promotions (e.g., "1+1 gratis")
3. `PERCENTAGE_DISCOUNT` - Products with percentage discounts (e.g., "25% korting")
4. `SECOND_HALF_PRICE` - Products with second half price promotions (e.g., "2e halve prijs")
5. `SECOND_FREE` - Products with second free promotions (e.g., "2e gratis")
6. `PRICE_REDUCTION` - Products with price reduction (ALDI specific: "PRIJS VERLAAGD")
7. `UNKNOWN` - Products with unrecognized promotion formats

## Test Data Structure

The scripts create a structured test dataset:

```
test_data/
  ├── ah/
  │   ├── non_promotion.json
  │   ├── x_for_y.json
  │   ├── percentage_discount.json
  │   └── ...
  ├── jumbo/
  │   ├── ...
  ├── aldi/
  │   ├── ...
  ├── plus/
  │   ├── ...
  ├── ah_test_products.json
  ├── jumbo_test_products.json
  ├── aldi_test_products.json
  └── plus_test_products.json
```

## Using as Test Suite

To use these files as test inputs for your processors:

1. Run `simple-sample-products.ts` to generate test data
2. Modify processor code as needed
3. Run `run-promotion-tests.ts` to verify parsing functionality
4. Examine the results in the output directory

## Troubleshooting

If you encounter TypeScript errors:

1. Ensure you're using compatible TypeScript settings (`"strict": false` in tsconfig.json)
2. Try the `simple-sample-products.ts` script which has minimal dependencies
3. Check that the required directories exist (`scraped_data`, `test_data`)