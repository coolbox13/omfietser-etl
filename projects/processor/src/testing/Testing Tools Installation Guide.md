# Testing Tools Installation Guide

This guide walks you through setting up and running the product data testing tools.

## Prerequisites

- Node.js (v14+)
- npm or yarn
- TypeScript (v4.0+)
- Access to product data files in `scraped_data` directory

## Installation Steps

1. **Create the testing directory structure**

   ```bash
   mkdir -p src/testing
   ```

2. **Copy the testing scripts to your project**

   Copy these files to the `src/testing` directory:
   - `simple-sample-products.ts` - Simple product sampler
   - `sample-test-products.ts` - Advanced product sampler
   - `run-promotion-tests.ts` - Test runner
   - `config-helper.ts` - Configuration helper
   - `README.md` - Documentation

3. **Install any required dependencies**

   ```bash
   npm install fs-extra path
   npm install --save-dev @types/fs-extra
   ```

## Running the Tests

### Step 1: Generate Test Data

First, run the simple sampler to generate test data:

```bash
npx ts-node src/testing/simple-sample-products.ts
```

This will create a `test_data` directory with sample products from each supermarket.

### Step 2: Run the Test Runner

Next, run the test runner to analyze promotion parsing:

```bash
npx ts-node src/testing/run-promotion-tests.ts
```

This will process the test data and generate analysis reports in `test_data/results`.

### Step 3: Examine Test Results

Review the output files to see how well the promotion parsing works:
- Check `test_data/results/<shop>_enriched.json` for enriched products
- Look for `test_data/results/<shop>_missing_fields.json` to identify issues

## Troubleshooting

### TypeScript Errors

If you encounter TypeScript errors:

1. Ensure your `tsconfig.json` has appropriate settings:
   ```json
   {
     "compilerOptions": {
       "strict": false,
       "esModuleInterop": true
     }
   }
   ```

2. Try running with ts-node's transpile-only mode:
   ```bash
   npx ts-node --transpile-only src/testing/simple-sample-products.ts
   ```

### Missing Files or Directories

If the scripts can't find input files:

1. Check that `scraped_data` directory exists and contains product files
2. Verify the file names match what's expected in `config-helper.ts`
3. Create empty directories if needed:
   ```bash
   mkdir -p scraped_data test_data test_data/results
   ```

### Permission Issues

If you encounter permission errors:

1. Check folder permissions:
   ```bash
   chmod -R 755 src/testing
   chmod -R 755 test_data
   ```

2. Ensure you have write access to the directories

## Next Steps

After setting up the testing tools, you can:

1. Modify the ALDI processor to better handle promotion parsing
2. Add new promotion patterns to the parsers
3. Run the tests regularly to ensure consistent promotion parsing