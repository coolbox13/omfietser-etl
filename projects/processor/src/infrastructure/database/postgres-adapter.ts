// PostgreSQL database adapter implementation with schema versioning and structure validation
import { PoolClient } from 'pg';
import { DatabaseConnection } from './connection';
import { getLogger } from '../logging';
import {
  IDatabaseAdapter,
  RawProduct,
  ProcessingJob,
  ProcessedProduct,
  ProcessingError,
  StagingProduct,
  RawProductQuery,
  ProcessingJobQuery,
  ProcessedProductQuery,
  ProcessingErrorQuery,
  RawProductInsert,
  ProcessingJobInsert,
  ProcessedProductInsert,
  ProcessingErrorInsert,
  StagingProductInsert,
  JobStatistics,
  ErrorSummary,
  SchemaVersionStats,
  CURRENT_SCHEMA_VERSION,
  SCHEMA_VERSION_FIELDS
} from './types';
import { StructureValidator } from '../../core/structure/structure-validator';

/**
 * PostgreSQL adapter for supermarket processor database operations
 * Supports schema versioning, structure validation, and full CRUD operations
 */
export class PostgreSQLAdapter implements IDatabaseAdapter {
  private connection: DatabaseConnection;
  private logger = getLogger();
  private structureValidator = new StructureValidator();

  constructor(connection: DatabaseConnection) {
    this.connection = connection;
  }

  // =============================================
  // Raw Products Operations (raw.products table)
  // =============================================

  async getRawProducts(query: RawProductQuery): Promise<RawProduct[]> {
    let sql = 'SELECT * FROM raw.products WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (query.shop_type) {
      sql += ` AND shop_type = $${paramIndex++}`;
      params.push(query.shop_type);
    }

    if (query.job_id) {
      sql += ` AND job_id = $${paramIndex++}`;
      params.push(query.job_id);
    }

    if (query.scraped_after) {
      sql += ` AND scraped_at >= $${paramIndex++}`;
      params.push(query.scraped_after);
    }

    if (query.scraped_before) {
      sql += ` AND scraped_at <= $${paramIndex++}`;
      params.push(query.scraped_before);
    }

    sql += ' ORDER BY scraped_at DESC';

    if (query.limit) {
      sql += ` LIMIT $${paramIndex++}`;
      params.push(query.limit);
    }

    if (query.offset) {
      sql += ` OFFSET $${paramIndex++}`;
      params.push(query.offset);
    }

    try {
      const result = await this.connection.query(sql, params);
      this.logger.debug('Retrieved raw products', {
        context: {
          query: query,
          count: result.rows.length
        }
      });
      return result.rows;
    } catch (error) {
      this.logger.error('Failed to get raw products', { query, error });
      throw error;
    }
  }

  async getRawProductById(id: string): Promise<RawProduct | null> {
    try {
      const sql = 'SELECT * FROM raw.products WHERE id = $1';
      const result = await this.connection.query(sql, [id]);
      return result.rows[0] || null;
    } catch (error) {
      this.logger.error('Failed to get raw product by ID', { id, error });
      throw error;
    }
  }

  async insertRawProduct(product: RawProductInsert): Promise<RawProduct> {
    try {
      const sql = `
        INSERT INTO raw.products (shop_type, job_id, raw_data, scraped_at)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      const params = [
        product.shop_type,
        product.job_id,
        JSON.stringify(product.raw_data),
        product.scraped_at || new Date()
      ];

      const result = await this.connection.query(sql, params);
      this.logger.debug('Inserted raw product', { productId: result.rows[0].id });
      return result.rows[0];
    } catch (error) {
      this.logger.error('Failed to insert raw product', { product, error });
      throw error;
    }
  }

  async insertRawProducts(products: RawProductInsert[]): Promise<RawProduct[]> {
    if (products.length === 0) return [];

    try {
      return await this.connection.transaction(async (client: PoolClient) => {
        const insertedProducts: RawProduct[] = [];

        // Use batch insert for better performance
        const sql = `
          INSERT INTO raw.products (shop_type, job_id, raw_data, scraped_at)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `;

        for (const product of products) {
          const params = [
            product.shop_type,
            product.job_id,
            JSON.stringify(product.raw_data),
            product.scraped_at || new Date()
          ];

          const result = await client.query(sql, params);
          insertedProducts.push(result.rows[0]);
        }

        this.logger.info('Batch inserted raw products', { count: insertedProducts.length });
        return insertedProducts;
      });
    } catch (error) {
      this.logger.error('Failed to batch insert raw products', { count: products.length, error });
      throw error;
    }
  }

  // =============================================
  // Staging Products Operations (staging.products table)
  // =============================================

  async insertStagingProduct(product: StagingProductInsert): Promise<StagingProduct> {
    try {
      const sql = `
        INSERT INTO staging.products (raw_product_id, shop_type, external_id, name, price, data, content_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (shop_type, external_id) 
        DO UPDATE SET 
          raw_product_id = EXCLUDED.raw_product_id,
          name = EXCLUDED.name,
          price = EXCLUDED.price,
          data = EXCLUDED.data,
          content_hash = EXCLUDED.content_hash,
          processed_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      const params = [
        product.raw_product_id,
        product.shop_type,
        product.external_id,
        product.name,
        product.price,
        JSON.stringify(product.data),
        product.content_hash
      ];

      const result = await this.connection.query(sql, params);
      this.logger.debug('Inserted/updated staging product', { 
        externalId: product.external_id,
        shopType: product.shop_type
      });
      return result.rows[0];
    } catch (error) {
      this.logger.error('Failed to insert staging product', { product, error });
      throw error;
    }
  }

  async insertStagingProducts(products: StagingProductInsert[]): Promise<StagingProduct[]> {
    if (products.length === 0) return [];

    try {
      return await this.connection.transaction(async (client: PoolClient) => {
        const insertedProducts: StagingProduct[] = [];

        for (const product of products) {
          const sql = `
            INSERT INTO staging.products (raw_product_id, shop_type, external_id, name, price, data, content_hash)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (shop_type, external_id) 
            DO UPDATE SET 
              raw_product_id = EXCLUDED.raw_product_id,
              name = EXCLUDED.name,
              price = EXCLUDED.price,
              data = EXCLUDED.data,
              content_hash = EXCLUDED.content_hash,
              processed_at = CURRENT_TIMESTAMP
            RETURNING *
          `;
          const params = [
            product.raw_product_id,
            product.shop_type,
            product.external_id,
            product.name,
            product.price,
            JSON.stringify(product.data),
            product.content_hash
          ];

          const result = await client.query(sql, params);
          insertedProducts.push(result.rows[0]);
        }

        this.logger.info('Batch inserted staging products', { count: insertedProducts.length });
        return insertedProducts;
      });
    } catch (error) {
      this.logger.error('Failed to batch insert staging products', { count: products.length, error });
      throw error;
    }
  }

  async getStagingProductByExternalId(shopType: string, externalId: string): Promise<StagingProduct | null> {
    try {
      const sql = 'SELECT * FROM staging.products WHERE shop_type = $1 AND external_id = $2';
      const result = await this.connection.query(sql, [shopType, externalId]);
      return result.rows[0] || null;
    } catch (error) {
      this.logger.error('Failed to get staging product by external ID', { shopType, externalId, error });
      throw error;
    }
  }

  // =============================================
  // Processing Jobs Operations
  // =============================================

  async getProcessingJobs(query: ProcessingJobQuery): Promise<ProcessingJob[]> {
    let sql = 'SELECT * FROM processing_jobs WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (query.shop_type) {
      sql += ` AND shop_type = $${paramIndex++}`;
      params.push(query.shop_type);
    }

    if (query.status) {
      sql += ` AND status = $${paramIndex++}`;
      params.push(query.status);
    }

    if (query.created_after) {
      sql += ` AND created_at >= $${paramIndex++}`;
      params.push(query.created_after);
    }

    if (query.created_before) {
      sql += ` AND created_at <= $${paramIndex++}`;
      params.push(query.created_before);
    }

    sql += ' ORDER BY created_at DESC';

    if (query.limit) {
      sql += ` LIMIT $${paramIndex++}`;
      params.push(query.limit);
    }

    if (query.offset) {
      sql += ` OFFSET $${paramIndex++}`;
      params.push(query.offset);
    }

    try {
      const result = await this.connection.query(sql, params);
      return result.rows;
    } catch (error) {
      this.logger.error('Failed to get processing jobs', { query, error });
      throw error;
    }
  }

  async getProcessingJobById(jobId: string): Promise<ProcessingJob | null> {
    try {
      const sql = 'SELECT * FROM processing_jobs WHERE job_id = $1';
      const result = await this.connection.query(sql, [jobId]);
      return result.rows[0] || null;
    } catch (error) {
      this.logger.error('Failed to get processing job by ID', { jobId, error });
      throw error;
    }
  }

  async createProcessingJob(job: ProcessingJobInsert): Promise<ProcessingJob> {
    try {
      // Generate job_id
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      const sql = `
        INSERT INTO processing_jobs (job_id, shop_type, batch_size, metadata)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      const params = [
        jobId,
        job.shop_type,
        job.batch_size || 100,
        job.metadata ? JSON.stringify(job.metadata) : null
      ];

      const result = await this.connection.query(sql, params);
      this.logger.info('Created processing job', { jobId: result.rows[0].job_id });
      return result.rows[0];
    } catch (error) {
      this.logger.error('Failed to create processing job', { job, error });
      throw error;
    }
  }

  async updateProcessingJob(jobId: string, updates: Partial<ProcessingJob>): Promise<ProcessingJob> {
    const setClause: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Filter out undefined values and job_id
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && key !== 'job_id' && key !== 'created_at') {
        setClause.push(`${key} = $${paramIndex++}`);
        params.push(key === 'metadata' && typeof value === 'object' ? JSON.stringify(value) : value);
      }
    });

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    // Always update updated_at
    setClause.push(`updated_at = CURRENT_TIMESTAMP`);

    try {
      const sql = `
        UPDATE processing_jobs 
        SET ${setClause.join(', ')}
        WHERE job_id = $${paramIndex}
        RETURNING *
      `;
      params.push(jobId);

      const result = await this.connection.query(sql, params);
      this.logger.debug('Updated processing job', { jobId, updatedFields: Object.keys(updates) });
      return result.rows[0];
    } catch (error) {
      this.logger.error('Failed to update processing job', { jobId, updates, error });
      throw error;
    }
  }

  async completeProcessingJob(
    jobId: string, 
    stats: { success_count: number; failed_count: number; skipped_count: number; deduped_count: number }
  ): Promise<void> {
    try {
      this.logger.info('DEBUG completeProcessingJob called with stats:', { jobId, stats });
      const sql = `
        UPDATE processing_jobs 
        SET status = 'completed',
            completed_at = CURRENT_TIMESTAMP,
            duration_ms = (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) * 1000)::INTEGER,
            success_count = $1::INTEGER,
            failed_count = $2::INTEGER, 
            skipped_count = $3::INTEGER,
            deduped_count = $4::INTEGER,
            processed_count = ($1::INTEGER + $2::INTEGER + $3::INTEGER),
            updated_at = CURRENT_TIMESTAMP
        WHERE job_id = $5
      `;

      const params = [
        stats.success_count,
        stats.failed_count, 
        stats.skipped_count,
        stats.deduped_count,
        jobId
      ];

      this.logger.info('DEBUG about to execute SQL with params:', { jobId, params });
      await this.connection.query(sql, params);

      this.logger.info('Completed processing job', { jobId, stats });
    } catch (error) {
      this.logger.error('Failed to complete processing job', { jobId, stats, error });
      throw error;
    }
  }

  // =============================================
  // Processed Products Operations with Schema Versioning
  // =============================================

  async getProcessedProducts(query: ProcessedProductQuery): Promise<ProcessedProduct[]> {
    let sql = 'SELECT * FROM processed.products WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (query.shop_type) {
      sql += ` AND shop_type = $${paramIndex++}`;
      params.push(query.shop_type);
    }

    if (query.job_id) {
      sql += ` AND job_id = $${paramIndex++}`;
      params.push(query.job_id);
    }

    if (query.main_category) {
      sql += ` AND main_category = $${paramIndex++}`;
      params.push(query.main_category);
    }

    if (query.is_promotion !== undefined) {
      sql += ` AND is_promotion = $${paramIndex++}`;
      params.push(query.is_promotion);
    }

    if (query.is_active !== undefined) {
      sql += ` AND is_active = $${paramIndex++}`;
      params.push(query.is_active);
    }

    if (query.external_id) {
      sql += ` AND external_id = $${paramIndex++}`;
      params.push(query.external_id);
    }

    if (query.schema_version) {
      sql += ` AND schema_version = $${paramIndex++}`;
      params.push(query.schema_version);
    }

    if (query.processed_after) {
      sql += ` AND processed_at >= $${paramIndex++}`;
      params.push(query.processed_after);
    }

    if (query.processed_before) {
      sql += ` AND processed_at <= $${paramIndex++}`;
      params.push(query.processed_before);
    }

    sql += ' ORDER BY processed_at DESC';

    if (query.limit) {
      sql += ` LIMIT $${paramIndex++}`;
      params.push(query.limit);
    }

    if (query.offset) {
      sql += ` OFFSET $${paramIndex++}`;
      params.push(query.offset);
    }

    try {
      const result = await this.connection.query(sql, params);
      return result.rows;
    } catch (error) {
      this.logger.error('Failed to get processed products', { query, error });
      throw error;
    }
  }

  async getProcessedProductById(unifiedId: string): Promise<ProcessedProduct | null> {
    try {
      const sql = 'SELECT * FROM processed.products WHERE unified_id = $1';
      const result = await this.connection.query(sql, [unifiedId]);
      return result.rows[0] || null;
    } catch (error) {
      this.logger.error('Failed to get processed product by ID', { unifiedId, error });
      throw error;
    }
  }

  async getProcessedProductByCompositeKey(
    shopType: string, 
    externalId: string, 
    schemaVersion?: string
  ): Promise<ProcessedProduct | null> {
    try {
      const version = schemaVersion || CURRENT_SCHEMA_VERSION;
      const sql = 'SELECT * FROM processed.products WHERE shop_type = $1 AND external_id = $2 AND schema_version = $3';
      const result = await this.connection.query(sql, [shopType, externalId, version]);
      return result.rows[0] || null;
    } catch (error) {
      this.logger.error('Failed to get processed product by composite key', { 
        shopType, externalId, schemaVersion, error 
      });
      throw error;
    }
  }

  async insertProcessedProduct(product: ProcessedProductInsert): Promise<ProcessedProduct> {
    // Validate structure compliance before insert
    const validationResult = this.structureValidator.validateCompleteStructure(product);
    if (!validationResult.isValid) {
      const errorMessages = [
        ...validationResult.missingFields.map(field => `missing field: ${field}`),
        ...validationResult.extraFields.map(field => `extra field: ${field}`),
        ...validationResult.typeErrors.map(error => `type error: ${error.field} expected ${error.expected}, got ${error.actual}`)
      ];
      throw new Error(`Structure validation failed: ${errorMessages.join(', ')}`);
    }

    try {
      const sql = `
        INSERT INTO processed.products (
          unified_id, shop_type, external_id, schema_version, job_id, raw_product_id,
          title, main_category, brand, image_url, sales_unit_size,
          quantity_amount, quantity_unit, default_quantity_amount, default_quantity_unit,
          price_before_bonus, current_price, unit_price, unit_price_unit,
          is_promotion, promotion_type, promotion_mechanism, promotion_start_date, promotion_end_date,
          parsed_promotion_effective_unit_price, parsed_promotion_required_quantity,
          parsed_promotion_total_price, parsed_promotion_is_multi_purchase_required,
          normalized_quantity_amount, normalized_quantity_unit, conversion_factor,
          price_per_standard_unit, current_price_per_standard_unit,
          discount_absolute, discount_percentage, is_active
        ) VALUES (
          COALESCE($1, $2::TEXT || '_' || COALESCE($3, '')::TEXT || '_' || COALESCE($4, $5)::TEXT), $2, $3, COALESCE($4, $5), $6, $7,
          $8, $9, $10, $11, $12,
          $13, $14, $15, $16,
          $17, $18, $19, $20,
          $21, $22, $23, $24, $25,
          $26, $27, $28, $29,
          $30, $31, $32,
          $33, $34,
          $35, $36, $37
        )
        RETURNING *
      `;

      const params = [
        product.unified_id, // $1 - if provided
        product.shop_type, // $2
        product.external_id || `${product.shop_type}_${product.raw_product_id}`, // $3
        product.schema_version, // $4 - if provided
        CURRENT_SCHEMA_VERSION, // $5 - default schema version
        product.job_id, // $6
        product.raw_product_id, // $7
        product.title, // $8
        product.main_category, // $9
        product.brand, // $10
        product.image_url, // $11
        product.sales_unit_size, // $12
        product.quantity_amount, // $13
        product.quantity_unit, // $14
        product.default_quantity_amount, // $15
        product.default_quantity_unit, // $16
        product.price_before_bonus, // $17
        product.current_price, // $18
        product.unit_price, // $19
        product.unit_price_unit, // $20
        product.is_promotion, // $21
        product.promotion_type, // $22
        product.promotion_mechanism, // $23
        product.promotion_start_date, // $24
        product.promotion_end_date, // $25
        product.parsed_promotion_effective_unit_price, // $26
        product.parsed_promotion_required_quantity, // $27
        product.parsed_promotion_total_price, // $28
        product.parsed_promotion_is_multi_purchase_required, // $29
        product.normalized_quantity_amount, // $30
        product.normalized_quantity_unit, // $31
        product.conversion_factor, // $32
        product.price_per_standard_unit, // $33
        product.current_price_per_standard_unit, // $34
        product.discount_absolute, // $35
        product.discount_percentage, // $36
        product.is_active // $37
      ];

      this.logger.info('DEBUG about to insert processed product with params:', { 
        shop_type: product.shop_type,
        external_id: product.external_id,
        paramCount: params.length 
      });
      
      const result = await this.connection.query(sql, params);
      this.logger.info('Inserted processed product', { 
        unifiedId: result.rows[0].unified_id,
        shopType: product.shop_type,
        schemaVersion: result.rows[0].schema_version 
      });
      return result.rows[0];
    } catch (error) {
      this.logger.error('Failed to insert processed product', { 
        shop_type: product.shop_type,
        external_id: product.external_id,
        error 
      });
      throw error;
    }
  }

  async insertProcessedProducts(products: ProcessedProductInsert[]): Promise<ProcessedProduct[]> {
    if (products.length === 0) return [];

    // Validate all products before batch insert
    for (const product of products) {
      const validationResult = this.structureValidator.validateCompleteStructure(product);
      if (!validationResult.isValid) {
        const errorMessages = [
          ...validationResult.missingFields.map(field => `missing field: ${field}`),
          ...validationResult.extraFields.map(field => `extra field: ${field}`),
          ...validationResult.typeErrors.map(error => `type error: ${error.field} expected ${error.expected}, got ${error.actual}`)
        ];
        throw new Error(`Structure validation failed for product: ${errorMessages.join(', ')}`);
      }
    }

    try {
      return await this.connection.transaction(async (client: PoolClient) => {
        const insertedProducts: ProcessedProduct[] = [];

        for (const product of products) {
          const sql = `
            INSERT INTO processed.products (
              unified_id, shop_type, external_id, schema_version, job_id, raw_product_id,
              title, main_category, brand, image_url, sales_unit_size,
              quantity_amount, quantity_unit, default_quantity_amount, default_quantity_unit,
              price_before_bonus, current_price, unit_price, unit_price_unit,
              is_promotion, promotion_type, promotion_mechanism, promotion_start_date, promotion_end_date,
              parsed_promotion_effective_unit_price, parsed_promotion_required_quantity,
              parsed_promotion_total_price, parsed_promotion_is_multi_purchase_required,
              normalized_quantity_amount, normalized_quantity_unit, conversion_factor,
              price_per_standard_unit, current_price_per_standard_unit,
              discount_absolute, discount_percentage, is_active
            ) VALUES (
              COALESCE($1, $2::TEXT || '_' || COALESCE($3, '')::TEXT || '_' || COALESCE($4, $5)::TEXT), $2, $3, COALESCE($4, $5), $6, $7,
              $8, $9, $10, $11, $12,
              $13, $14, $15, $16,
              $17, $18, $19, $20,
              $21, $22, $23, $24, $25,
              $26, $27, $28, $29,
              $30, $31, $32,
              $33, $34,
              $35, $36, $37
            )
            ON CONFLICT (shop_type, external_id, schema_version)
            DO UPDATE SET
              unified_id = EXCLUDED.unified_id,
              job_id = EXCLUDED.job_id,
              raw_product_id = EXCLUDED.raw_product_id,
              title = EXCLUDED.title,
              main_category = EXCLUDED.main_category,
              brand = EXCLUDED.brand,
              image_url = EXCLUDED.image_url,
              sales_unit_size = EXCLUDED.sales_unit_size,
              quantity_amount = EXCLUDED.quantity_amount,
              quantity_unit = EXCLUDED.quantity_unit,
              default_quantity_amount = EXCLUDED.default_quantity_amount,
              default_quantity_unit = EXCLUDED.default_quantity_unit,
              price_before_bonus = EXCLUDED.price_before_bonus,
              current_price = EXCLUDED.current_price,
              unit_price = EXCLUDED.unit_price,
              unit_price_unit = EXCLUDED.unit_price_unit,
              is_promotion = EXCLUDED.is_promotion,
              promotion_type = EXCLUDED.promotion_type,
              promotion_mechanism = EXCLUDED.promotion_mechanism,
              promotion_start_date = EXCLUDED.promotion_start_date,
              promotion_end_date = EXCLUDED.promotion_end_date,
              parsed_promotion_effective_unit_price = EXCLUDED.parsed_promotion_effective_unit_price,
              parsed_promotion_required_quantity = EXCLUDED.parsed_promotion_required_quantity,
              parsed_promotion_total_price = EXCLUDED.parsed_promotion_total_price,
              parsed_promotion_is_multi_purchase_required = EXCLUDED.parsed_promotion_is_multi_purchase_required,
              normalized_quantity_amount = EXCLUDED.normalized_quantity_amount,
              normalized_quantity_unit = EXCLUDED.normalized_quantity_unit,
              conversion_factor = EXCLUDED.conversion_factor,
              price_per_standard_unit = EXCLUDED.price_per_standard_unit,
              current_price_per_standard_unit = EXCLUDED.current_price_per_standard_unit,
              discount_absolute = EXCLUDED.discount_absolute,
              discount_percentage = EXCLUDED.discount_percentage,
              is_active = EXCLUDED.is_active,
              updated_at = CURRENT_TIMESTAMP
            RETURNING *
          `;

          const params = [
            product.unified_id, // $1
            product.shop_type, // $2
            product.external_id || `${product.shop_type}_${product.raw_product_id}`, // $3
            product.schema_version, // $4
            CURRENT_SCHEMA_VERSION, // $5
            product.job_id, // $6
            product.raw_product_id, // $7
            product.title, // $8
            product.main_category, // $9
            product.brand, // $10
            product.image_url, // $11
            product.sales_unit_size, // $12
            product.quantity_amount, // $13
            product.quantity_unit, // $14
            product.default_quantity_amount, // $15
            product.default_quantity_unit, // $16
            product.price_before_bonus, // $17
            product.current_price, // $18
            product.unit_price, // $19
            product.unit_price_unit, // $20
            product.is_promotion, // $21
            product.promotion_type, // $22
            product.promotion_mechanism, // $23
            product.promotion_start_date, // $24
            product.promotion_end_date, // $25
            product.parsed_promotion_effective_unit_price, // $26
            product.parsed_promotion_required_quantity, // $27
            product.parsed_promotion_total_price, // $28
            product.parsed_promotion_is_multi_purchase_required, // $29
            product.normalized_quantity_amount, // $30
            product.normalized_quantity_unit, // $31
            product.conversion_factor, // $32
            product.price_per_standard_unit, // $33
            product.current_price_per_standard_unit, // $34
            product.discount_absolute, // $35
            product.discount_percentage, // $36
            product.is_active // $37
          ];

          this.logger.info('DEBUG about to batch insert product:', { 
            shop_type: product.shop_type,
            external_id: product.external_id,
            paramCount: params.length,
            productIndex: insertedProducts.length
          });
          
          const result = await client.query(sql, params);
          insertedProducts.push(result.rows[0]);
        }

        this.logger.info('Batch inserted processed products', { 
          count: insertedProducts.length,
          schemaVersion: CURRENT_SCHEMA_VERSION
        });
        return insertedProducts;
      });
    } catch (error) {
      this.logger.error('Failed to batch insert processed products', { 
        count: products.length,
        error 
      });
      throw error;
    }
  }

  async upsertProcessedProduct(product: ProcessedProductInsert): Promise<ProcessedProduct> {
    // Use the same logic as insertProcessedProducts but for a single product
    const results = await this.insertProcessedProducts([product]);
    return results[0];
  }

  // =============================================
  // Processing Errors Operations
  // =============================================

  async getProcessingErrors(query: ProcessingErrorQuery): Promise<ProcessingError[]> {
    let sql = 'SELECT * FROM processing_errors WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (query.job_id) {
      sql += ` AND job_id = $${paramIndex++}`;
      params.push(query.job_id);
    }

    if (query.error_type) {
      sql += ` AND error_type = $${paramIndex++}`;
      params.push(query.error_type);
    }

    if (query.severity) {
      sql += ` AND severity = $${paramIndex++}`;
      params.push(query.severity);
    }

    if (query.is_resolved !== undefined) {
      sql += ` AND is_resolved = $${paramIndex++}`;
      params.push(query.is_resolved);
    }

    if (query.created_after) {
      sql += ` AND created_at >= $${paramIndex++}`;
      params.push(query.created_after);
    }

    if (query.created_before) {
      sql += ` AND created_at <= $${paramIndex++}`;
      params.push(query.created_before);
    }

    sql += ' ORDER BY created_at DESC';

    if (query.limit) {
      sql += ` LIMIT $${paramIndex++}`;
      params.push(query.limit);
    }

    if (query.offset) {
      sql += ` OFFSET $${paramIndex++}`;
      params.push(query.offset);
    }

    try {
      const result = await this.connection.query(sql, params);
      return result.rows;
    } catch (error) {
      this.logger.error('Failed to get processing errors', { query, error });
      throw error;
    }
  }

  async insertProcessingError(error: ProcessingErrorInsert): Promise<ProcessingError> {
    try {
      const sql = `
        INSERT INTO processing_errors (job_id, raw_product_id, product_id, shop_type, error_type, error_message, error_details, stack_trace, severity)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;
      const params = [
        error.job_id,
        error.raw_product_id,
        error.product_id,
        error.shop_type,
        error.error_type,
        error.error_message,
        error.error_details ? JSON.stringify(error.error_details) : null,
        error.stack_trace,
        error.severity || 'medium'
      ];

      const result = await this.connection.query(sql, params);
      return result.rows[0];
    } catch (dbError) {
      this.logger.error('Failed to insert processing error', { error, dbError });
      throw dbError;
    }
  }

  async insertProcessingErrors(errors: ProcessingErrorInsert[]): Promise<ProcessingError[]> {
    if (errors.length === 0) return [];

    try {
      return await this.connection.transaction(async (client: PoolClient) => {
        const insertedErrors: ProcessingError[] = [];

        for (const error of errors) {
          const sql = `
            INSERT INTO processing_errors (job_id, raw_product_id, product_id, shop_type, error_type, error_message, error_details, stack_trace, severity)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
          `;
          const params = [
            error.job_id,
            error.raw_product_id,
            error.product_id,
            error.shop_type,
            error.error_type,
            error.error_message,
            error.error_details ? JSON.stringify(error.error_details) : null,
            error.stack_trace,
            error.severity || 'medium'
          ];

          const result = await client.query(sql, params);
          insertedErrors.push(result.rows[0]);
        }

        this.logger.info('Batch inserted processing errors', { count: insertedErrors.length });
        return insertedErrors;
      });
    } catch (error) {
      this.logger.error('Failed to batch insert processing errors', { count: errors.length, error });
      throw error;
    }
  }

  async resolveProcessingError(id: string): Promise<void> {
    try {
      const sql = 'UPDATE processing_errors SET is_resolved = true WHERE id = $1';
      await this.connection.query(sql, [id]);
      this.logger.debug('Resolved processing error', { errorId: id });
    } catch (error) {
      this.logger.error('Failed to resolve processing error', { id, error });
      throw error;
    }
  }

  // =============================================
  // Statistics and Monitoring Operations
  // =============================================

  async getJobStatistics(jobId?: string): Promise<JobStatistics[]> {
    try {
      let sql = `
        SELECT 
          job_id,
          shop_type,
          status,
          total_products,
          success_count,
          failed_count,
          skipped_count,
          deduped_count,
          CASE 
            WHEN total_products > 0 THEN ROUND((success_count::decimal / total_products::decimal) * 100, 2)
            ELSE 0 
          END as success_percentage,
          duration_ms,
          started_at,
          completed_at
        FROM processing_jobs
      `;

      const params: any[] = [];
      if (jobId) {
        sql += ' WHERE job_id = $1';
        params.push(jobId);
      } else {
        sql += ' ORDER BY created_at DESC LIMIT 100';
      }

      const result = await this.connection.query(sql, params);
      return result.rows;
    } catch (error) {
      this.logger.error('Failed to get job statistics', { jobId, error });
      throw error;
    }
  }

  async getErrorSummary(jobId?: string): Promise<ErrorSummary[]> {
    try {
      let sql = `
        SELECT 
          job_id,
          COUNT(*) as total_errors,
          COUNT(DISTINCT error_type) as unique_error_types,
          COUNT(*) FILTER (WHERE severity = 'critical') as critical_errors,
          COUNT(*) FILTER (WHERE severity = 'high') as high_errors,
          COUNT(*) FILTER (WHERE severity = 'medium') as medium_errors,
          COUNT(*) FILTER (WHERE severity = 'low') as low_errors
        FROM processing_errors
      `;

      const params: any[] = [];
      if (jobId) {
        sql += ' WHERE job_id = $1';
        params.push(jobId);
      }

      sql += ' GROUP BY job_id ORDER BY total_errors DESC';

      const result = await this.connection.query(sql, params);
      return result.rows;
    } catch (error) {
      this.logger.error('Failed to get error summary', { jobId, error });
      throw error;
    }
  }

  async getSchemaVersionStats(): Promise<SchemaVersionStats[]> {
    try {
      const sql = `
        SELECT 
          schema_version,
          shop_type,
          COUNT(*) as product_count,
          MAX(updated_at) as last_updated
        FROM processed.products
        GROUP BY schema_version, shop_type
        ORDER BY schema_version DESC, shop_type ASC
      `;

      const result = await this.connection.query(sql);
      return result.rows;
    } catch (error) {
      this.logger.error('Failed to get schema version stats', { error });
      throw error;
    }
  }

  // =============================================
  // Utility Operations
  // =============================================

  async healthCheck(): Promise<boolean> {
    try {
      return await this.connection.healthCheck();
    } catch (error) {
      this.logger.error('Database health check failed', { error });
      return false;
    }
  }

  async getConnectionStats(): Promise<any> {
    try {
      return await this.connection.getConnectionStats();
    } catch (error) {
      this.logger.error('Failed to get connection stats', { error });
      return null;
    }
  }

  async validateStructureCompliance(products: ProcessedProduct[]): Promise<{
    compliant: number;
    total: number;
    violations: string[];
  }> {
    const violations: string[] = [];
    let compliantCount = 0;

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const validationResult = this.structureValidator.validateCompleteStructure(product);
      
      if (validationResult.isValid) {
        compliantCount++;
      } else {
        const errorMessages = [
          ...validationResult.missingFields.map(field => `missing field: ${field}`),
          ...validationResult.extraFields.map(field => `extra field: ${field}`),
          ...validationResult.typeErrors.map(error => `type error: ${error.field} expected ${error.expected}, got ${error.actual}`)
        ];
        violations.push(`Product ${i} (${product.unified_id}): ${errorMessages.join(', ')}`);
      }
    }

    this.logger.info('Structure compliance validation completed', {
      total: products.length,
      compliant: compliantCount,
      violationCount: violations.length
    });

    return {
      compliant: compliantCount,
      total: products.length,
      violations
    };
  }
}