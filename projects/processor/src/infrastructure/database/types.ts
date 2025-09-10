// Database types and interfaces for PostgreSQL integration
import { UnifiedProduct } from '../../types/product';

/**
 * Raw product data as scraped by N8N - directly from raw.products table
 */
export interface RawProduct {
  id: string;
  shop_type: string;
  job_id: string; // N8N scraper job ID
  raw_data: any; // JSONB data from scraper
  scraped_at: Date;
  created_at: Date;
}

/**
 * Processing job metadata and tracking
 */
export interface ProcessingJob {
  job_id: string;
  shop_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  batch_size: number;
  total_products: number;
  processed_count: number;
  success_count: number;
  failed_count: number;
  skipped_count: number;
  deduped_count: number;
  started_at?: Date;
  completed_at?: Date;
  duration_ms?: number;
  error_message?: string;
  metadata?: any;
  created_at: Date;
  updated_at: Date;
}

/**
 * Staging products table - intermediate step for debugging
 * Stores products with extracted external_id before final processing
 */
export interface StagingProduct {
  id: number;
  raw_product_id: string;
  shop_type: string;
  external_id?: string; // Extracted shop-specific product ID
  name?: string;
  price?: number;
  data: any; // JSONB - transformed product data
  content_hash?: string; // For change detection
  processed_at: Date;
}

/**
 * Final processed product with all 32 unified fields
 * Extends UnifiedProduct with database-specific metadata
 */
export interface ProcessedProduct extends UnifiedProduct {
  job_id: string;
  raw_product_id: string;
  processed_at: Date;
  created_at: Date;
  updated_at: Date;
  // Schema versioning support
  schema_version?: string;
  external_id?: string; // For composite key (shop_type, external_id, schema_version)
}

/**
 * Processing error tracking
 */
export interface ProcessingError {
  id: string;
  job_id: string;
  raw_product_id?: string;
  product_id?: string; // external_id when available
  error_type: string;
  error_message: string;
  error_details?: any;
  stack_trace?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  is_resolved: boolean;
  created_at: Date;
}

// =============================================
// Query Interfaces
// =============================================

export interface RawProductQuery {
  shop_type?: string;
  job_id?: string;
  limit?: number;
  offset?: number;
  scraped_after?: Date;
  scraped_before?: Date;
}

export interface ProcessingJobQuery {
  shop_type?: string;
  status?: ProcessingJob['status'];
  limit?: number;
  offset?: number;
  created_after?: Date;
  created_before?: Date;
}

export interface ProcessedProductQuery {
  shop_type?: string;
  job_id?: string;
  main_category?: string;
  is_promotion?: boolean;
  is_active?: boolean;
  external_id?: string;
  schema_version?: string;
  limit?: number;
  offset?: number;
  processed_after?: Date;
  processed_before?: Date;
}

export interface ProcessingErrorQuery {
  job_id?: string;
  error_type?: string;
  severity?: ProcessingError['severity'];
  is_resolved?: boolean;
  limit?: number;
  offset?: number;
  created_after?: Date;
  created_before?: Date;
}

// =============================================
// Insert/Update Interfaces
// =============================================

export interface RawProductInsert {
  shop_type: string;
  job_id: string;
  raw_data: any;
  scraped_at?: Date;
}

export interface StagingProductInsert {
  raw_product_id: string;
  shop_type: string;
  external_id?: string;
  name?: string;
  price?: number;
  data: any;
  content_hash?: string;
}

export interface ProcessingJobInsert {
  shop_type: string;
  batch_size?: number;
  metadata?: any;
}

/**
 * Processed product insert interface
 * All 32 fields from UnifiedProduct must be present
 */
export interface ProcessedProductInsert extends Omit<UnifiedProduct, 'unified_id'> {
  unified_id?: string; // Optional for insert, will be generated if not provided
  job_id: string;
  raw_product_id: string;
  external_id?: string; // For schema versioning composite key
  schema_version?: string; // Current schema version (default: '1.0.0')
}

export interface ProcessingErrorInsert {
  job_id: string;
  raw_product_id?: string;
  product_id?: string;
  shop_type: string;
  error_type: string;
  error_message: string;
  error_details?: any;
  stack_trace?: string;
  severity?: ProcessingError['severity'];
}

// =============================================
// Statistics and Reporting Interfaces
// =============================================

export interface JobStatistics {
  job_id: string;
  shop_type: string;
  status: string;
  total_products: number;
  success_count: number;
  failed_count: number;
  skipped_count: number;
  deduped_count: number;
  success_percentage: number;
  duration_ms?: number;
  started_at?: Date;
  completed_at?: Date;
}

export interface ErrorSummary {
  job_id: string;
  total_errors: number;
  unique_error_types: number;
  critical_errors: number;
  high_errors: number;
  medium_errors: number;
  low_errors: number;
}

export interface SchemaVersionStats {
  schema_version: string;
  shop_type: string;
  product_count: number;
  last_updated: Date;
}

// =============================================
// Database Adapter Interface
// =============================================

export interface IDatabaseAdapter {
  // Raw products operations (raw.products table)
  getRawProducts(query: RawProductQuery): Promise<RawProduct[]>;
  getRawProductById(id: string): Promise<RawProduct | null>;
  insertRawProduct(product: RawProductInsert): Promise<RawProduct>;
  insertRawProducts(products: RawProductInsert[]): Promise<RawProduct[]>;

  // Staging products operations (staging.products table)
  insertStagingProduct(product: StagingProductInsert): Promise<StagingProduct>;
  insertStagingProducts(products: StagingProductInsert[]): Promise<StagingProduct[]>;
  getStagingProductByExternalId(shopType: string, externalId: string): Promise<StagingProduct | null>;

  // Processing jobs operations
  getProcessingJobs(query: ProcessingJobQuery): Promise<ProcessingJob[]>;
  getProcessingJobById(jobId: string): Promise<ProcessingJob | null>;
  createProcessingJob(job: ProcessingJobInsert): Promise<ProcessingJob>;
  updateProcessingJob(jobId: string, updates: Partial<ProcessingJob>): Promise<ProcessingJob>;
  completeProcessingJob(jobId: string, stats: { 
    success_count: number; 
    failed_count: number; 
    skipped_count: number; 
    deduped_count: number 
  }): Promise<void>;

  // Processed products operations with schema versioning
  getProcessedProducts(query: ProcessedProductQuery): Promise<ProcessedProduct[]>;
  getProcessedProductById(unifiedId: string): Promise<ProcessedProduct | null>;
  getProcessedProductByCompositeKey(shopType: string, externalId: string, schemaVersion?: string): Promise<ProcessedProduct | null>;
  insertProcessedProduct(product: ProcessedProductInsert): Promise<ProcessedProduct>;
  insertProcessedProducts(products: ProcessedProductInsert[]): Promise<ProcessedProduct[]>;
  upsertProcessedProduct(product: ProcessedProductInsert): Promise<ProcessedProduct>; // Insert or update based on composite key

  // Processing errors operations
  getProcessingErrors(query: ProcessingErrorQuery): Promise<ProcessingError[]>;
  insertProcessingError(error: ProcessingErrorInsert): Promise<ProcessingError>;
  insertProcessingErrors(errors: ProcessingErrorInsert[]): Promise<ProcessingError[]>;
  resolveProcessingError(id: string): Promise<void>;

  // Statistics and monitoring operations
  getJobStatistics(jobId?: string): Promise<JobStatistics[]>;
  getErrorSummary(jobId?: string): Promise<ErrorSummary[]>;
  getSchemaVersionStats(): Promise<SchemaVersionStats[]>;

  // Utility operations
  healthCheck(): Promise<boolean>;
  getConnectionStats(): Promise<any>;
  validateStructureCompliance(products: ProcessedProduct[]): Promise<{ compliant: number; total: number; violations: string[] }>;
}

// =============================================
// Database Configuration
// =============================================

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  poolSize?: number;
  connectionTimeoutMs?: number;
  idleTimeoutMs?: number;
}

export interface DatabaseConnectionStats {
  totalConnections: number;
  idleConnections: number;
  waitingClients: number;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

// =============================================
// Schema Versioning Types
// =============================================

export interface SchemaVersion {
  version: string;
  fields: string[];
  createdAt: Date;
  isActive: boolean;
}

export const CURRENT_SCHEMA_VERSION = '1.0.0';

export const SCHEMA_VERSION_FIELDS = [
  'unified_id', 'shop_type', 'title', 'main_category', 'brand', 'image_url', 'sales_unit_size',
  'quantity_amount', 'quantity_unit', 'default_quantity_amount', 'default_quantity_unit',
  'price_before_bonus', 'current_price', 'unit_price', 'unit_price_unit',
  'is_promotion', 'promotion_type', 'promotion_mechanism', 'promotion_start_date', 'promotion_end_date',
  'parsed_promotion_effective_unit_price', 'parsed_promotion_required_quantity', 
  'parsed_promotion_total_price', 'parsed_promotion_is_multi_purchase_required',
  'normalized_quantity_amount', 'normalized_quantity_unit', 'conversion_factor',
  'price_per_standard_unit', 'current_price_per_standard_unit',
  'discount_absolute', 'discount_percentage', 'is_active'
] as const;

export type SchemaVersionField = typeof SCHEMA_VERSION_FIELDS[number];