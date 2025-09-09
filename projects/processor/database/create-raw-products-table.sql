-- Create raw products table for scraped data from N8N workflows
-- This table stores the raw product data before processing

BEGIN;

-- Create raw schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS raw;

-- Grant permissions to etl_user for raw schema
GRANT ALL PRIVILEGES ON SCHEMA raw TO etl_user;

-- Raw products table (populated by scrapers)
CREATE TABLE IF NOT EXISTS raw.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_type VARCHAR(50) NOT NULL,
    job_id VARCHAR(255) NOT NULL,  -- N8N scraper job ID
    raw_data JSONB NOT NULL,       -- Complete scraped product data
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for raw products
CREATE INDEX IF NOT EXISTS idx_raw_products_shop_type ON raw.products(shop_type);
CREATE INDEX IF NOT EXISTS idx_raw_products_job_id ON raw.products(job_id);
CREATE INDEX IF NOT EXISTS idx_raw_products_scraped_at ON raw.products(scraped_at);

-- Grant permissions
GRANT ALL PRIVILEGES ON TABLE raw.products TO etl_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA raw TO etl_user;

-- Insert some test data for AH to allow processor testing
INSERT INTO raw.products (shop_type, job_id, raw_data) VALUES 
(
  'ah',
  'test-job-123',
  '{
    "webshop_id": "wi123456",
    "title": "Test Product AH",
    "sales_unit_size": "500 gram",
    "price": {
      "was": 2.99,
      "now": 2.49,
      "unit_info": {
        "price": 4.98,
        "description": "4.98 per kg"
      }
    },
    "category": {
      "id": "cat123",
      "title": "Fresh Vegetables",
      "images": []
    },
    "brand": "AH",
    "images": [],
    "availability": {
      "is_available": true
    },
    "discount": {
      "label": "Bonus"
    },
    "nutritional_values": [],
    "shield": {
      "text": "Fair Trade",
      "color": "GREEN"
    }
  }'::jsonb
),
(
  'ah',
  'test-job-123', 
  '{
    "webshop_id": "wi789012",
    "title": "Another Test Product",
    "sales_unit_size": "1 piece",
    "price": {
      "was": 3.50,
      "now": 3.50,
      "unit_info": {
        "price": 3.50,
        "description": "3.50 per piece"
      }
    },
    "category": {
      "id": "cat456", 
      "title": "Dairy",
      "images": []
    },
    "brand": "Brand Name",
    "images": [],
    "availability": {
      "is_available": true
    },
    "nutritional_values": []
  }'::jsonb
);

COMMIT;

-- Verification
DO $$
BEGIN
    RAISE NOTICE 'Raw products table created successfully in raw schema!';
    RAISE NOTICE 'Added 2 test AH products for processor testing';
END $$;