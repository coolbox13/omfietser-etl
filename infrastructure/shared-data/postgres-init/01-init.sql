-- PostgreSQL initialization script for scraper database
-- This script runs automatically when the database is first created

-- Create extension for UUID generation (if needed in the future)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS staging;

-- Raw product storage - one product per row
CREATE TABLE IF NOT EXISTS raw.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_type VARCHAR(20) NOT NULL CHECK (shop_type IN ('ah', 'jumbo', 'aldi', 'plus', 'kruidvat')),
    job_id VARCHAR(100) NOT NULL,
    raw_data JSONB NOT NULL,
    content_hash TEXT,
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_raw_products_shop_job ON raw.products (shop_type, job_id);
CREATE INDEX IF NOT EXISTS idx_raw_products_scraped_at ON raw.products (scraped_at);
CREATE INDEX IF NOT EXISTS idx_raw_products_job_id ON raw.products (job_id);
CREATE INDEX IF NOT EXISTS idx_raw_products_content_hash ON raw.products (content_hash);

-- Staging tables (for processed/normalized data - future use)
CREATE TABLE IF NOT EXISTS staging.products (
    id SERIAL PRIMARY KEY,
    raw_product_id UUID REFERENCES raw.products(id),
    shop_type VARCHAR(20) NOT NULL,
    external_id TEXT,
    name TEXT,
    price DECIMAL(10,2),
    data JSONB,
    content_hash TEXT,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(shop_type, external_id)
);

-- Create a simple health check table
CREATE TABLE IF NOT EXISTS health_check (
    id SERIAL PRIMARY KEY,
    message TEXT NOT NULL DEFAULT 'PostgreSQL is ready',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert initial health check record
INSERT INTO health_check (message) VALUES ('Database initialized successfully');

-- Log initialization
\echo 'PostgreSQL database initialized for scraper system';