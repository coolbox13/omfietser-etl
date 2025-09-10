// Database processor adapter - bridges existing processors with database I/O using structure template validation
import { EventEmitter } from 'events';
import { getDatabaseAdapter } from '../infrastructure/database';
import { getLogger } from '../infrastructure/logging';
import {
  IDatabaseAdapter,
  RawProduct,
  ProcessedProduct,
  ProcessedProductInsert,
  ProcessingErrorInsert,
  StagingProduct,
  StagingProductInsert,
  CURRENT_SCHEMA_VERSION
} from '../infrastructure/database/types';
import { UnifiedProduct } from '../types/product';
import { StructureValidator } from '../core/structure/structure-validator';

// Import existing processors
import { AHProcessor } from '../processors/ah';
import { JumboProcessor } from '../processors/jumbo';
import { AldiProcessor } from '../processors/aldi';
import { PlusProcessor } from '../processors/plus';
import { BaseProcessor, BaseProcessorConfig } from '../processors/base';

// Processor factory type
type ProcessorClass = new (config: BaseProcessorConfig) => BaseProcessor<any>;

export interface DatabaseProcessorConfig {
  jobId: string;
  shopType: string;
  batchSize: number;
  enableProgressUpdates: boolean;
  progressUpdateInterval: number;
  enforceStructureValidation: boolean; // New: force structure validation
  schemaVersion?: string; // New: schema version override
}

export interface ProcessingBatchResult {
  processed: number;
  success: number;
  failed: number;
  skipped: number;
  deduped: number;
  errors: ProcessingErrorInsert[];
  successfulProducts: Set<string>;
  processedProducts: ProcessedProductInsert[];
  stagingProducts: StagingProductInsert[];
  structureValidationResults: {
    compliant: number;
    total: number;
    violations: string[];
  };
}

/**
 * Database processor adapter with structure template validation
 * Ensures 100% compliance with 32-field unified structure
 */
export class DatabaseProcessorAdapter extends EventEmitter {
  private dbAdapter: IDatabaseAdapter | null = null;
  private logger = getLogger();
  private config: DatabaseProcessorConfig;
  private processorInstance: BaseProcessor<any> | null = null;
  private structureValidator = new StructureValidator();
  private initialized = false;

  constructor(config: DatabaseProcessorConfig) {
    super();
    this.config = {
      ...config,
      enforceStructureValidation: config.enforceStructureValidation ?? true,
      schemaVersion: config.schemaVersion || CURRENT_SCHEMA_VERSION
    };
    
    // Validate shop type immediately during construction
    this.getProcessorClass(this.config.shopType);
    
    this.initializeAdapter();
  }

  private initializationPromise: Promise<void> | null = null;

  private async initializeAdapter(): Promise<void> {
    if (this.initializationPromise) {
      this.logger.error('TRACE: Returning existing initialization promise');
      return this.initializationPromise;
    }

    this.logger.error('TRACE: Starting new initialization promise');

    this.initializationPromise = (async () => {
      try {
        this.logger.error('TRACE: Starting database adapter initialization');
        this.dbAdapter = await getDatabaseAdapter();
        this.logger.error('TRACE: Database adapter obtained successfully', { dbAdapterExists: !!this.dbAdapter });
        this.initializeProcessor();
        this.logger.error('TRACE: Processor initialized successfully', { processorExists: !!this.processorInstance });
        this.initialized = true;
        this.logger.error('TRACE: DatabaseProcessorAdapter fully initialized', { initialized: this.initialized });
      } catch (error) {
        this.logger.error('DEBUG: Failed to initialize database adapter', { 
          error: error instanceof Error ? { message: error.message, stack: error.stack } : error 
        });
        this.initialized = false;
        throw error;
      }
    })();

    this.logger.error('TRACE: About to return initialization promise');
    return this.initializationPromise;
  }

  /**
   * Wait for the adapter to be fully initialized
   */
  public async waitForInitialization(): Promise<void> {
    return this.initializeAdapter();
  }

  private initializeProcessor(): void {
    // Create processor config without file I/O dependencies
    const processorConfig: BaseProcessorConfig = {
      inputDir: '', // Not used in database mode
      outputDir: '', // Not used in database mode
      inputFile: '', // Not used in database mode
      batchSize: this.config.batchSize,
      parallelProcessing: false // Database adapter handles parallelism
    };

    // Get the appropriate processor class
    const ProcessorClass = this.getProcessorClass(this.config.shopType);
    this.processorInstance = new ProcessorClass(processorConfig);
  }

  private getProcessorClass(shopType: string): ProcessorClass {
    switch (shopType.toLowerCase()) {
      case 'ah':
        return AHProcessor;
      case 'jumbo':
        return JumboProcessor;
      case 'aldi':
        return AldiProcessor;
      case 'plus':
        return PlusProcessor;
      case 'kruidvat':
        throw new Error(`Kruidvat processor not yet implemented. Please implement KruidvatProcessor class.`);
      default:
        throw new Error(`Unsupported shop type: ${shopType}`);
    }
  }

  // =============================================
  // Main Processing Methods
  // =============================================

  public async processBatch(rawProducts: RawProduct[]): Promise<ProcessingBatchResult> {
    this.logger.error('TRACE: processBatch called', { 
      initialized: this.initialized, 
      processorExists: !!this.processorInstance, 
      dbAdapterExists: !!this.dbAdapter,
      initPromiseExists: !!this.initializationPromise
    });

    // Ensure adapter is initialized to avoid race conditions
    await this.waitForInitialization();
    this.logger.error('TRACE: after waitForInitialization', { 
      initialized: this.initialized, 
      processorExists: !!this.processorInstance, 
      dbAdapterExists: !!this.dbAdapter,
      initPromiseExists: !!this.initializationPromise
    });

    if (!this.initialized || !this.processorInstance || !this.dbAdapter) {
      const details = {
        initialized: this.initialized,
        processorInstance: !!this.processorInstance,
        dbAdapter: !!this.dbAdapter,
        initializationPromise: !!this.initializationPromise
      };
      
      let specificError = 'Adapter not fully initialized:';
      if (!this.initialized) specificError += ' initialized=false';
      if (!this.processorInstance) specificError += ' processorInstance=null';
      if (!this.dbAdapter) specificError += ' dbAdapter=null';
      
      this.logger.error('TRACE: processBatch failing - adapter not fully initialized', details);
      throw new Error(specificError);
    }

    const result: ProcessingBatchResult = {
      processed: rawProducts.length,
      success: 0,
      failed: 0,
      skipped: 0,
      deduped: 0,
      errors: [],
      successfulProducts: new Set<string>(),
      processedProducts: [],
      stagingProducts: [],
      structureValidationResults: {
        compliant: 0,
        total: 0,
        violations: []
      }
    };

    this.logger.info('Processing batch with structure validation', {
      context: {
        jobId: this.config.jobId,
        shopType: this.config.shopType,
        batchSize: rawProducts.length,
        schemaVersion: this.config.schemaVersion,
        enforceValidation: this.config.enforceStructureValidation
      }
    });

    try {
      // Process products using existing processor logic with structure validation
      const processedResults = await this.processProductsWithStructureValidation(rawProducts);

      // Separate successful and failed results
      for (let i = 0; i < rawProducts.length; i++) {
        const rawProduct = rawProducts[i];
        const processedResult = processedResults[i];

        if (processedResult && processedResult.success) {
          // Successful processing with structure compliance
          result.success++;
          result.successfulProducts.add(rawProduct.id);

          const transformedProduct = processedResult.product!;
          const externalId = this.extractExternalId(transformedProduct, rawProduct);

          // Create staging product record
          const stagingProduct: StagingProductInsert = {
            raw_product_id: rawProduct.id,
            shop_type: this.config.shopType,
            external_id: externalId,
            name: transformedProduct.title,
            price: transformedProduct.current_price,
            data: transformedProduct,
            content_hash: this.generateContentHash(transformedProduct)
          };

          result.stagingProducts.push(stagingProduct);

          // Convert to database format for final processed products
          const dbProduct: ProcessedProductInsert = {
            job_id: this.config.jobId,
            raw_product_id: rawProduct.id,
            external_id: externalId,
            schema_version: this.config.schemaVersion,
            // All 32 required fields from UnifiedProduct
            unified_id: transformedProduct.unified_id,
            shop_type: this.config.shopType,
            title: transformedProduct.title,
            main_category: transformedProduct.main_category,
            brand: transformedProduct.brand,
            image_url: transformedProduct.image_url,
            sales_unit_size: transformedProduct.sales_unit_size,
            quantity_amount: transformedProduct.quantity_amount,
            quantity_unit: transformedProduct.quantity_unit,
            default_quantity_amount: transformedProduct.default_quantity_amount,
            default_quantity_unit: transformedProduct.default_quantity_unit,
            price_before_bonus: transformedProduct.price_before_bonus,
            current_price: transformedProduct.current_price,
            unit_price: transformedProduct.unit_price,
            unit_price_unit: transformedProduct.unit_price_unit,
            is_promotion: transformedProduct.is_promotion,
            promotion_type: transformedProduct.promotion_type,
            promotion_mechanism: transformedProduct.promotion_mechanism,
            promotion_start_date: transformedProduct.promotion_start_date,
            promotion_end_date: transformedProduct.promotion_end_date,
            parsed_promotion_effective_unit_price: transformedProduct.parsed_promotion_effective_unit_price,
            parsed_promotion_required_quantity: transformedProduct.parsed_promotion_required_quantity,
            parsed_promotion_total_price: transformedProduct.parsed_promotion_total_price,
            parsed_promotion_is_multi_purchase_required: transformedProduct.parsed_promotion_is_multi_purchase_required,
            normalized_quantity_amount: transformedProduct.normalized_quantity_amount,
            normalized_quantity_unit: transformedProduct.normalized_quantity_unit,
            conversion_factor: transformedProduct.conversion_factor,
            price_per_standard_unit: transformedProduct.price_per_standard_unit,
            current_price_per_standard_unit: transformedProduct.current_price_per_standard_unit,
            discount_absolute: transformedProduct.discount_absolute,
            discount_percentage: transformedProduct.discount_percentage,
            is_active: transformedProduct.is_active
          };

          result.processedProducts.push(dbProduct);

        } else {
          // Failed processing
          result.failed++;

          // Create error record
          const error: ProcessingErrorInsert = {
            job_id: this.config.jobId,
            raw_product_id: rawProduct.id,
            product_id: rawProduct.id,
            shop_type: this.config.shopType,
            error_type: processedResult?.error?.type || 'PROCESSING_ERROR',
            error_message: processedResult?.error?.message || 'Unknown processing error',
            error_details: processedResult?.error?.details || {},
            severity: this.determineSeverity(processedResult?.error?.type || 'PROCESSING_ERROR')
          };

          result.errors.push(error);
        }
      }

      // Run final structure validation on all processed products
      if (result.processedProducts.length > 0) {
        result.structureValidationResults = await this.dbAdapter.validateStructureCompliance(
          result.processedProducts as ProcessedProduct[]
        );

        // If enforcement is enabled and compliance is not 100%, fail the batch
        if (this.config.enforceStructureValidation && result.structureValidationResults.compliant < result.structureValidationResults.total) {
          throw new Error(`Structure compliance failed: ${result.structureValidationResults.violations.length} violations found`);
        }
      }

      this.logger.info('Batch processing completed with structure validation', {
        context: {
          jobId: this.config.jobId,
          shopType: this.config.shopType,
          processed: result.processed,
          success: result.success,
          failed: result.failed,
          structureCompliance: `${result.structureValidationResults.compliant}/${result.structureValidationResults.total}`
        }
      });

      return result;

    } catch (error) {
      this.logger.error('Batch processing failed', {
        context: {
          jobId: this.config.jobId,
          shopType: this.config.shopType,
          batchSize: rawProducts.length
        },
        error
      });

      // Mark all products as failed
      result.success = 0;
      result.failed = rawProducts.length;

      // Create error records for all products
      for (const rawProduct of rawProducts) {
        const errorRecord: ProcessingErrorInsert = {
          job_id: this.config.jobId,
          raw_product_id: rawProduct.id,
          product_id: rawProduct.id,
          shop_type: this.config.shopType,
          error_type: 'BATCH_PROCESSING_ERROR',
          error_message: error instanceof Error ? error.message : 'Batch processing failed',
          error_details: { originalError: error },
          severity: 'high'
        };
        result.errors.push(errorRecord);
      }

      return result;
    }
  }

  // =============================================
  // Processing Logic Integration with Structure Validation
  // =============================================

  private async processProductsWithStructureValidation(
    rawProducts: RawProduct[]
  ): Promise<Array<{ success: boolean; product?: UnifiedProduct; error?: any }>> {
    if (!this.processorInstance) {
      throw new Error('Processor not initialized');
    }

    const results: Array<{ success: boolean; product?: UnifiedProduct; error?: any }> = [];

    // Process each product individually with structure validation
    for (let i = 0; i < rawProducts.length; i++) {
      const rawProduct = rawProducts[i];

      try {
        // Transform using the processor's transform method
        const transformedProduct = await this.transformProductWithValidation(rawProduct);
        
        if (transformedProduct) {
          results.push({ success: true, product: transformedProduct });
        } else {
          results.push({ 
            success: false, 
            error: { 
              type: 'TRANSFORMATION_ERROR', 
              message: 'Product transformation returned null' 
            } 
          });
        }

      } catch (error) {
        this.logger.warn('Product transformation failed', {
          context: {
            jobId: this.config.jobId,
            shopType: this.config.shopType,
            productIndex: i,
            rawProductId: rawProduct.id
          },
          error
        });

        results.push({
          success: false,
          error: {
            type: this.getErrorType(error),
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error
          }
        });
      }
    }

    return results;
  }

  private async transformProductWithValidation(rawProduct: RawProduct): Promise<UnifiedProduct | null> {
    try {
      // Use the actual processor's transformSingle method instead of placeholder
      const transformedProduct = await this.processorInstance!.transformSingle(rawProduct.raw_data);
      
      // Validate structure compliance before returning
      const validationResult = this.structureValidator.validateCompleteStructure(transformedProduct);
      
      if (!validationResult.isValid) {
        const errorMessages = [
          ...validationResult.missingFields.map(field => `missing field: ${field}`),
          ...validationResult.extraFields.map(field => `extra field: ${field}`),
          ...validationResult.typeErrors.map(error => `type error: ${error.field} expected ${error.expected}, got ${error.actual}`)
        ];
        
        if (this.config.enforceStructureValidation) {
          throw new Error(`Structure validation failed: ${errorMessages.join(', ')}`);
        } else {
          this.logger.warn('Structure validation failed but enforcement is disabled', {
            context: {
              rawProductId: rawProduct.id,
              shopType: this.config.shopType,
              errors: errorMessages
            }
          });
        }
      }

      return transformedProduct;

    } catch (error) {
      this.logger.error('Product transformation with validation failed', {
        context: {
          jobId: this.config.jobId,
          shopType: this.config.shopType,
          rawProductId: rawProduct.id
        },
        error
      });
      return null;
    }
  }

  private createBaseProductFromRawData(rawProduct: RawProduct): UnifiedProduct {
    const inputData = rawProduct.raw_data;
    
    // Create a complete UnifiedProduct with all 32 required fields
    return {
      unified_id: `${this.config.shopType}_${rawProduct.id}_${Date.now()}`,
      shop_type: this.config.shopType,
      title: String(inputData.title || inputData.name || 'Unknown Product'),
      main_category: inputData.category || null,
      brand: String(inputData.brand || 'Unknown'),
      image_url: String(inputData.image_url || inputData.imageUrl || ''),
      sales_unit_size: String(inputData.sales_unit_size || inputData.unitSize || ''),
      
      // Quantity Information
      quantity_amount: this.parseNumber(inputData.quantity_amount || inputData.quantity) || 1,
      quantity_unit: String(inputData.quantity_unit || inputData.unit || 'piece'),
      default_quantity_amount: this.parseNumber(inputData.default_quantity_amount),
      default_quantity_unit: inputData.default_quantity_unit || null,
      
      // Price Information
      price_before_bonus: this.parseNumber(inputData.price_before_bonus || inputData.originalPrice) || 0,
      current_price: this.parseNumber(inputData.current_price || inputData.price) || 0,
      unit_price: this.parseNumber(inputData.unit_price),
      unit_price_unit: inputData.unit_price_unit || null,
      
      // Promotion Information
      is_promotion: Boolean(inputData.is_promotion || inputData.promotion || inputData.discount),
      promotion_type: String(inputData.promotion_type || inputData.promotionType || 'none'),
      promotion_mechanism: String(inputData.promotion_mechanism || inputData.promotionMechanism || 'none'),
      promotion_start_date: this.parseDate(inputData.promotion_start_date),
      promotion_end_date: this.parseDate(inputData.promotion_end_date),
      
      // Parsed Promotion Fields
      parsed_promotion_effective_unit_price: this.parseNumber(inputData.parsed_promotion_effective_unit_price),
      parsed_promotion_required_quantity: this.parseNumber(inputData.parsed_promotion_required_quantity),
      parsed_promotion_total_price: this.parseNumber(inputData.parsed_promotion_total_price),
      parsed_promotion_is_multi_purchase_required: inputData.parsed_promotion_is_multi_purchase_required || null,
      
      // Normalized Fields
      normalized_quantity_amount: this.parseNumber(inputData.normalized_quantity_amount),
      normalized_quantity_unit: inputData.normalized_quantity_unit || null,
      conversion_factor: this.parseNumber(inputData.conversion_factor),
      
      // Calculated Price Fields
      price_per_standard_unit: this.parseNumber(inputData.price_per_standard_unit),
      current_price_per_standard_unit: this.parseNumber(inputData.current_price_per_standard_unit),
      discount_absolute: this.parseNumber(inputData.discount_absolute),
      discount_percentage: this.parseNumber(inputData.discount_percentage),
      
      // Availability
      is_active: inputData.is_active !== false // Default to true unless explicitly false
    };
  }

  // =============================================
  // Helper Methods
  // =============================================

  private extractExternalId(product: UnifiedProduct | undefined, rawProduct: RawProduct): string | undefined {
    if (!product) return undefined;

    // Shop-specific external ID extraction logic
    switch (this.config.shopType.toLowerCase()) {
      case 'ah':
        return rawProduct.raw_data?.id || 
               rawProduct.raw_data?.productId || 
               rawProduct.raw_data?.product?.id ||
               product.unified_id;

      case 'jumbo':
        return rawProduct.raw_data?.id || 
               rawProduct.raw_data?.productId ||
               rawProduct.raw_data?.sku ||
               product.unified_id;

      case 'aldi':
        return rawProduct.raw_data?.id || 
               rawProduct.raw_data?.articleNumber ||
               rawProduct.raw_data?.productId ||
               product.unified_id;

      case 'plus':
        return rawProduct.raw_data?.id || 
               rawProduct.raw_data?.productId ||
               rawProduct.raw_data?.productNumber ||
               product.unified_id;

      case 'kruidvat':
        return rawProduct.raw_data?.id || 
               rawProduct.raw_data?.productId ||
               rawProduct.raw_data?.sku ||
               product.unified_id;

      default:
        // Fallback: try common field names
        return rawProduct.raw_data?.id || 
               rawProduct.raw_data?.productId ||
               rawProduct.raw_data?.sku ||
               product.unified_id;
    }
  }

  private generateContentHash(product: any): string {
    if (!product) return '';
    
    // Create a hash of key product fields to detect changes
    const key = `${product.title || ''}_${product.current_price || 0}_${product.brand || ''}_${product.quantity_amount || 0}`;
    
    // Simple hash function (in production, consider using crypto.createHash)
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  private parseNumber(value: any): number | undefined {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value.replace(/[^\d.-]/g, ''));
      return isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  private parseDate(value: any): string | null {
    if (!value) return null;
    
    try {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date.toISOString();
    } catch {
      return null;
    }
  }

  private getErrorType(error: any): string {
    if (error?.name) return error.name;
    if (error instanceof Error) return error.constructor.name;
    return 'UNKNOWN_ERROR';
  }

  private determineSeverity(errorType: string): 'low' | 'medium' | 'high' | 'critical' {
    const criticalErrors = ['BATCH_PROCESSING_ERROR', 'DATABASE_ERROR', 'STRUCTURE_VALIDATION_ERROR'];
    const highErrors = ['VALIDATION_ERROR', 'TRANSFORMATION_ERROR'];
    const mediumErrors = ['PARSING_ERROR', 'FORMAT_ERROR'];

    if (criticalErrors.includes(errorType)) return 'critical';
    if (highErrors.includes(errorType)) return 'high';
    if (mediumErrors.includes(errorType)) return 'medium';
    return 'low';
  }

  // =============================================
  // Progress and Event Methods
  // =============================================

  public getConfig(): DatabaseProcessorConfig {
    return { ...this.config };
  }

  public async getStructureComplianceRate(): Promise<number> {
    // Query recent processed products to get compliance rate
    try {
      if (!this.dbAdapter) {
        throw new Error('Database adapter not initialized');
      }
      
      const recentProducts = await this.dbAdapter.getProcessedProducts({
        shop_type: this.config.shopType,
        job_id: this.config.jobId,
        limit: 100
      });

      if (recentProducts.length === 0) return 1.0; // 100% if no products yet

      const validationResult = await this.dbAdapter.validateStructureCompliance(recentProducts);
      return validationResult.compliant / validationResult.total;
    } catch (error) {
      this.logger.error('Failed to get structure compliance rate', { error });
      return 0;
    }
  }

  public emit(event: string | symbol, ...args: any[]): boolean {
    this.logger.debug('DatabaseProcessorAdapter event emitted', { event, argsCount: args.length });
    return super.emit(event, ...args);
  }
}