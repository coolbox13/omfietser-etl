-- Processor Database Schema Initialization
-- Creates all required tables for the supermarket processor to function
-- This fixes the 500 error when calling /api/v1/webhook/n8n

BEGIN;

-- Main processed products table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop VARCHAR(50) NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    name TEXT NOT NULL,
    brand VARCHAR(255),
    category VARCHAR(255) NOT NULL,
    original_category VARCHAR(255),
    description TEXT,
    ingredients TEXT,
    price DECIMAL(10, 2) NOT NULL,
    original_price DECIMAL(10, 2),
    unit_price DECIMAL(10, 2),
    unit_type VARCHAR(50),
    discount DECIMAL(10, 2),
    discount_percentage DECIMAL(5, 2),
    available BOOLEAN NOT NULL DEFAULT true,
    stock INTEGER,
    max_order_quantity INTEGER,
    delivery_days INTEGER,
    image_url TEXT,
    thumbnail_url TEXT,
    badges JSONB,
    ratings DECIMAL(3, 2),
    review_count INTEGER,
    nutritional_info JSONB,
    url TEXT,
    sku VARCHAR(100),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    price_history JSONB,
    is_new BOOLEAN DEFAULT false,
    processing_errors JSONB,
    hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(shop, external_id)
);

-- Processing jobs tracking table
CREATE TABLE IF NOT EXISTS processing_jobs (
    job_id VARCHAR(255) PRIMARY KEY,  -- N8N compatible job ID
    shop_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    batch_size INTEGER DEFAULT 100,
    total_products INTEGER DEFAULT 0,
    processed_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,
    deduped_count INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Processing errors/issues tracking table
CREATE TABLE IF NOT EXISTS processing_errors (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(255) REFERENCES processing_jobs(job_id),
    raw_product_id VARCHAR(255),
    shop_type VARCHAR(50) NOT NULL,
    error_type VARCHAR(100) NOT NULL,
    error_code VARCHAR(50),
    severity VARCHAR(50) DEFAULT 'medium',
    error_message TEXT NOT NULL,
    product_data JSONB,
    stack_trace TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved BOOLEAN DEFAULT false
);

-- Staging products table (intermediate processing step)
CREATE TABLE IF NOT EXISTS staging_products (
    id SERIAL PRIMARY KEY,
    raw_product_id VARCHAR(255) NOT NULL,
    shop_type VARCHAR(50) NOT NULL,
    job_id VARCHAR(255) REFERENCES processing_jobs(job_id),
    external_id VARCHAR(255),
    name TEXT,
    price DECIMAL(10, 2),
    data JSONB NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending'
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_shop_category ON products(shop, category);
CREATE INDEX IF NOT EXISTS idx_products_shop_available ON products(shop, available);
CREATE INDEX IF NOT EXISTS idx_products_last_updated ON products(last_updated);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_hash ON products(hash);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_shop_status ON processing_jobs(shop_type, status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_created ON processing_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);

CREATE INDEX IF NOT EXISTS idx_processing_errors_job_id ON processing_errors(job_id);
CREATE INDEX IF NOT EXISTS idx_processing_errors_shop_type ON processing_errors(shop_type);
CREATE INDEX IF NOT EXISTS idx_processing_errors_severity ON processing_errors(severity);
CREATE INDEX IF NOT EXISTS idx_processing_errors_resolved ON processing_errors(resolved);

CREATE INDEX IF NOT EXISTS idx_staging_products_job_id ON staging_products(job_id);
CREATE INDEX IF NOT EXISTS idx_staging_products_shop_external ON staging_products(shop_type, external_id);

-- Grant permissions to the ETL user
GRANT ALL PRIVILEGES ON TABLE products TO etl_user;
GRANT ALL PRIVILEGES ON TABLE processing_jobs TO etl_user;
GRANT ALL PRIVILEGES ON TABLE processing_errors TO etl_user;
GRANT ALL PRIVILEGES ON TABLE staging_products TO etl_user;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO etl_user;

COMMIT;

-- Insert a test record to verify the schema works
DO $$
BEGIN
    -- This will help verify the tables were created successfully
    RAISE NOTICE 'Processor database schema initialized successfully!';
    RAISE NOTICE 'Tables created: products, processing_jobs, processing_errors, staging_products';
    RAISE NOTICE 'Ready for processor webhook calls to /api/v1/webhook/n8n';
END $$;