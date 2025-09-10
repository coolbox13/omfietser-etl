// src/processors/base.ts
import { chunk } from 'lodash';
import { getLogger } from '../infrastructure/logging';
import { ValidationError, TransformationError, serializeError } from '../utils/error';
import { UnifiedProduct, ProcessingResult } from '../types/product';
import { dedupeProducts } from '../utils/dedupe';
import { createConfig } from '../config';
import { getProductQualityService } from '../core/services/quality/product-quality-service';
import { calculateFields } from '../utils/calculate-fields';
import { getProgressTracker } from '../infrastructure/monitoring/progress-tracker';
import { getIssueTracker } from '../infrastructure/logging/issue-tracker';
import { ShopType } from '../types/monitoring';
// NEW: Structure validation imports for Phase 1
import { 
  UnifiedProductTemplate, 
  ensureCompleteStructure
} from '../core/structure/unified-product-template';
import { 
  structureValidator,
  validateProduct
} from '../core/structure/structure-validator';
// TODO: Fix JSON schema validator TypeScript issues
// import { jsonSchemaValidator } from '../core/structure/json-schema-validator';
import path from 'path';
import fs from 'fs-extra';

export interface BaseProcessorConfig {
  inputDir: string;
  outputDir: string;
  inputFile: string;
  batchSize: number;
  parallelProcessing: boolean;
}

export interface ProcessingStats {
  totalProcessed: number;
  success: number;
  failed: number;
  skipped: number;
  deduped: number;
  startTime: number;
  endTime: number;
  errors: Array<{
    productId: string;
    error: string;
    details?: any;
  }>;
}

export abstract class BaseProcessor<T> {
  protected readonly config: BaseProcessorConfig;
  protected readonly shopType: string;
  protected stats: ProcessingStats;
  private readonly qualityService = getProductQualityService();
  private readonly progressTracker = getProgressTracker();
  private readonly issueTracker = getIssueTracker();

  // Lazy-loaded logger to avoid initialization issues
  protected get logger() {
    return getLogger();
  }

  constructor(config: BaseProcessorConfig, shopType: string) {
    this.config = config;
    this.shopType = shopType;
    this.stats = this.initializeStats();
  }

  private initializeStats(): ProcessingStats {
    return {
      totalProcessed: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      deduped: 0,
      startTime: Date.now(),
      endTime: 0,
      errors: []
    };
  }

  public async process(): Promise<ProcessingResult> {
    this.logger.info(`Starting processing for ${this.shopType}`, {
      context: {
        shopType: this.shopType,
        inputFile: this.config.inputFile
      }
    });

    try {
      const inputFilePath = path.join(this.config.inputDir, this.config.inputFile);

      // Validate input file exists
      if (!await fs.pathExists(inputFilePath)) {
        throw new Error(`Input file not found: ${inputFilePath}`);
      }

      // Read and parse input file
      const rawData = await fs.readFile(inputFilePath, 'utf8');
      const products = this.parseInputData(rawData);

      this.logger.info(`Loaded ${products.length} products for ${this.shopType}`);

      // Initialize progress tracking
      const totalBatches = Math.ceil(products.length / this.config.batchSize);
      this.progressTracker.initializeShop(
        this.shopType as ShopType,
        products.length,
        totalBatches
      );

      // Process products
      const transformedProducts = this.config.parallelProcessing
        ? await this.processInParallel(products)
        : await this.processSequentially(products);

      // Get application config
      const appConfig = await createConfig();

      // Apply field calculations to all products
      let processedProducts = transformedProducts.map(product => calculateFields(product));
      this.logger.info(`Calculated derived fields for ${processedProducts.length} products`);

      // Deduplicate products
      const dedupedProducts = dedupeProducts(processedProducts);
      const dedupedCount = processedProducts.length - dedupedProducts.length;
      this.stats.deduped = dedupedCount;

      // Apply quality metrics but don't include them in the final output
      await this.calculateAndLogQualityMetrics(dedupedProducts);

      // Remove quality metrics before writing output
      const outputProducts = this.qualityService.removeQualityMetrics(dedupedProducts);

      // Write output
      const outputFile = path.join(this.config.outputDir, `unified_${this.shopType.toLowerCase()}_products.json`);
      await fs.writeJson(outputFile, outputProducts, { spaces: 2 });

      // Complete stats
      this.stats.endTime = Date.now();

      this.logger.info(`Completed processing for ${this.shopType}`, {
        context: {
          shopType: this.shopType,
          stats: {
            totalProcessed: this.stats.totalProcessed,
            success: this.stats.success,
            failed: this.stats.failed,
            skipped: this.stats.skipped,
            deduped: this.stats.deduped,
            durationMs: this.stats.endTime - this.stats.startTime
          }
        }
      });

      // Mark processing as complete
      this.progressTracker.completeShop(this.shopType as ShopType);

      // Generate report if there are errors
      if (this.stats.errors.length > 0) {
        await this.writeErrorReport();
        await this.writeStatsReport();
      }

      return {
        success: this.stats.success,
        failed: this.stats.failed,
        skipped: this.stats.skipped,
        deduped: this.stats.deduped,
        errors: this.stats.errors,
        shopType: this.shopType
      };
    } catch (error) {
      const serializedError = serializeError(error);
      this.logger.error(`Failed to process ${this.shopType} data`, {
        context: {
          shopType: this.shopType,
          error: serializedError,
          processingState: {
            statsBeforeError: {
              totalProcessed: this.stats.totalProcessed,
              success: this.stats.success,
              failed: this.stats.failed,
              skipped: this.stats.skipped
            },
            configUsed: {
              inputFile: this.config.inputFile,
              batchSize: this.config.batchSize,
              parallelProcessing: this.config.parallelProcessing
            }
          }
        }
      });
      throw error;
    }
  }

  /**
   * Public method to transform a single product - used by database adapter
   * @param rawProduct The raw product data to transform
   * @returns Promise<UnifiedProduct> The transformed and validated product
   */
  public async transformSingle(rawProduct: T): Promise<UnifiedProduct> {
    const productId = this.getProductId(rawProduct);
    
    this.logger.debug(`Starting single product transformation`, {
      context: {
        shopType: this.shopType,
        productId,
        productFields: Object.keys(rawProduct || {})
      }
    });

    try {
      // Check if product should be skipped
      if (this.shouldSkipProduct(rawProduct)) {
        this.logger.debug(`Product should be skipped`, {
          context: {
            shopType: this.shopType,
            productId,
            reason: 'Failed business rules validation'
          }
        });
        throw new Error('Product should be skipped based on business rules');
      }

      // Transform product using the processor's specific logic
      this.logger.debug(`Calling transformProduct for ${productId}`);
      const transformed = this.transformProduct(rawProduct);
      
      this.logger.debug(`Product transformed successfully`, {
        context: {
          shopType: this.shopType,
          productId,
          transformedFields: Object.keys(transformed)
        }
      });
      
      // Ensure complete structure compliance and get validated product
      this.logger.debug(`Starting validation for ${productId}`);
      const validatedProduct = this.validateRequiredFields(transformed);
      
      this.logger.debug(`Product validated successfully`, {
        context: {
          shopType: this.shopType,
          productId,
          validatedFields: Object.keys(validatedProduct)
        }
      });
      
      // Apply field calculations
      this.logger.debug(`Calculating fields for ${productId}`);
      const calculatedProduct = calculateFields(validatedProduct);
      
      this.logger.debug(`Single product transformation completed successfully`, {
        context: {
          shopType: this.shopType,
          productId,
          finalFields: Object.keys(calculatedProduct)
        }
      });
      
      return calculatedProduct;
    } catch (error) {
      const serializedError = serializeError(error);
      this.logger.error('Failed to transform single product', {
        context: {
          shopType: this.shopType,
          productId,
          error: serializedError,
          productData: JSON.stringify(rawProduct, null, 2)
        }
      });
      throw error;
    }
  }

  private async processInParallel(products: T[]): Promise<UnifiedProduct[]> {
    const batches = chunk(products, this.config.batchSize);

    this.logger.info(`Processing ${products.length} products in ${batches.length} batches (parallel)`);

    const results = await Promise.all(
      batches.map((batch, index) => this.processBatch(batch, index))
    );

    return results.flat();
  }

  private async processSequentially(products: T[]): Promise<UnifiedProduct[]> {
    const batches = chunk(products, this.config.batchSize);

    this.logger.info(`Processing ${products.length} products in ${batches.length} batches (sequential)`);

    const results: UnifiedProduct[] = [];

    for (let i = 0; i < batches.length; i++) {
      const batchResults = await this.processBatch(batches[i], i);
      results.push(...batchResults);
    }

    return results;
  }

  private async processBatch(batch: T[], batchIndex: number): Promise<UnifiedProduct[]> {
    const startTime = Date.now();
    const transformedProducts: UnifiedProduct[] = [];
    
    // Track batch-specific metrics
    let batchSuccessCount = 0;
    let batchFailedCount = 0;
    let batchSkippedCount = 0;
    
    this.logger.debug(`Starting batch ${batchIndex} processing`, {
      context: {
        shopType: this.shopType,
        batchIndex,
        batchSize: batch.length,
        totalProcessedSoFar: this.stats.totalProcessed
      }
    });

    for (let productIndex = 0; productIndex < batch.length; productIndex++) {
      const product = batch[productIndex];
      const productId = this.getProductId(product);
      
      try {
        this.stats.totalProcessed++;
        
        this.logger.debug(`Processing product ${productIndex + 1}/${batch.length} in batch ${batchIndex}`, {
          context: {
            shopType: this.shopType,
            batchIndex,
            productIndex,
            productId,
            totalProcessed: this.stats.totalProcessed
          }
        });

        // Check if product should be skipped
        if (this.shouldSkipProduct(product)) {
          this.stats.skipped++;
          batchSkippedCount++;

          // Enhanced logging for skipped products with reasoning
          this.logger.debug(`Skipped product: ${productId}`, {
            context: {
              shopType: this.shopType,
              productId,
              batchIndex,
              productIndex,
              reason: 'Failed validation in shouldSkipProduct',
              productFields: Object.keys(product || {})
            }
          });

          continue;
        }

        // Transform product with detailed logging
        this.logger.debug(`Transforming product ${productId}`);
        const transformed = this.transformProduct(product);
        
        this.logger.debug(`Product ${productId} transformed, validating...`);
        // Ensure complete structure compliance and get validated product
        const validatedProduct = this.validateRequiredFields(transformed);
        
        this.logger.debug(`Product ${productId} validated successfully`);
        transformedProducts.push(validatedProduct);
        this.stats.success++;
        batchSuccessCount++;
      } catch (error) {
        this.stats.failed++;
        batchFailedCount++;
        
        this.logger.error(`Error processing product ${productIndex + 1}/${batch.length} in batch ${batchIndex}`, {
          context: {
            shopType: this.shopType,
            batchIndex,
            productIndex,
            productId,
            error: serializeError(error),
            batchProgress: {
              processed: productIndex + 1,
              total: batch.length,
              successSoFar: batchSuccessCount,
              failedSoFar: batchFailedCount,
              skippedSoFar: batchSkippedCount
            }
          }
        });
        
        this.handleProcessingError(error, product);
      }
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Update progress tracker with batch-specific counts
    this.progressTracker.updateBatchProgress(
      this.shopType as ShopType,
      batchIndex,
      {
        processed: batch.length,
        successful: batchSuccessCount,
        failed: batchFailedCount,
        skipped: batchSkippedCount
      }
    );

    this.logger.info(`Batch ${batchIndex} completed`, {
      context: {
        shopType: this.shopType,
        batchIndex,
        batchResults: {
          totalInBatch: batch.length,
          successful: batchSuccessCount,
          failed: batchFailedCount,
          skipped: batchSkippedCount,
          duration: `${duration}ms`,
          processingRate: `${Math.round(batch.length / (duration / 1000))} products/second`,
          successRate: `${((batchSuccessCount / batch.length) * 100).toFixed(1)}%`,
          failureRate: `${((batchFailedCount / batch.length) * 100).toFixed(1)}%`
        },
        overallProgress: {
          totalProcessed: this.stats.totalProcessed,
          totalSuccess: this.stats.success,
          totalFailed: this.stats.failed,
          totalSkipped: this.stats.skipped
        }
      }
    });

    return transformedProducts;
  }


  /**
   * Validate complete structure compliance using the Phase 1 validation system
   * Ensures ALL 32 required fields are present with zero tolerance for missing fields
   */
  private validateRequiredFields(product: UnifiedProduct): UnifiedProduct {
    // Use the comprehensive structure validation system
    const validationResult = validateProduct(product);
    
    if (!validationResult.isValid) {
      const errorDetails = {
        missingFields: validationResult.missingFields,
        extraFields: validationResult.extraFields,
        typeErrors: validationResult.typeErrors,
        complianceScore: validationResult.complianceScore,
        productId: product.unified_id || 'unknown'
      };

      this.logger.error('Product failed structure validation', errorDetails);

      throw new ValidationError(
        `Product structure validation failed. Missing: ${validationResult.missingFields.length} fields, ` +
        `Type errors: ${validationResult.typeErrors.length}, ` +
        `Compliance score: ${Math.round(validationResult.complianceScore * 100)}%`,
        errorDetails
      );
    }

    // Ensure complete structure with defaults for any missing optional fields
    const completeProduct = ensureCompleteStructure(product);

    // Additional business logic validation for price fields
    this.validateBusinessRules(completeProduct);

    return completeProduct;
  }

  /**
   * Validate business-specific rules after structure compliance is ensured
   */
  private validateBusinessRules(product: UnifiedProduct): void {
    // For promotional products, validate price logic
    if (product.is_promotion) {
      if (typeof product.price_before_bonus === 'number' && product.price_before_bonus <= 0) {
        throw new ValidationError(
          'Invalid price_before_bonus for promotional product: must be greater than 0',
          { productId: product.unified_id || 'unknown', value: product.price_before_bonus }
        );
      }
    }

    // For all products, ensure at least one valid price exists
    const hasPriceBeforeBonus = typeof product.price_before_bonus === 'number' && product.price_before_bonus > 0;
    const hasCurrentPrice = typeof product.current_price === 'number' && product.current_price > 0;
    
    if (!hasPriceBeforeBonus && !hasCurrentPrice) {
      throw new ValidationError(
        'No valid price information: both price_before_bonus and current_price are invalid',
        { 
          productId: product.unified_id || 'unknown', 
          priceBeforeBonus: product.price_before_bonus,
          currentPrice: product.current_price
        }
      );
    }
  }

  private handleProcessingError(error: unknown, product: T): void {
    const productId = this.getProductId(product);
    const serializedError = serializeError(error);

    // Log the raw product data for debugging failed transformations
    this.logger.debug(`Processing error - Raw product data`, {
      context: {
        shopType: this.shopType,
        productId,
        productData: JSON.stringify(product, null, 2),
        errorPreview: error instanceof Error ? error.message : String(error)
      }
    });

    // Track error counts
    this.progressTracker.incrementErrorCount(this.shopType as ShopType);

    // Track specific error types as issues
    if (error instanceof ValidationError) {
      this.issueTracker.trackIssue(
        'VALIDATION_ERROR',
        {
          processingStep: 'product_validation',
          shopType: this.shopType as ShopType,
          productId,
          additionalData: {
            ...error.details,
            errorStack: serializedError.stack,
            productFields: Object.keys(product || {})
          }
        },
        JSON.stringify(product),
        null,
        `Fix validation error: ${error.message}`
      );

      this.logger.warn(`Validation error for product ${productId}`, {
        context: {
          shopType: this.shopType,
          productId,
          error: serializedError,
          validationDetails: error.details,
          productSize: JSON.stringify(product).length
        }
      });
    } else if (error instanceof TransformationError) {
      this.issueTracker.trackIssue(
        'TRANSFORMATION_ERROR',
        {
          processingStep: 'product_transformation',
          shopType: this.shopType as ShopType,
          productId,
          additionalData: {
            ...error.details,
            errorStack: serializedError.stack,
            productFields: Object.keys(product || {})
          }
        },
        JSON.stringify(product),
        null,
        `Fix transformation logic for ${this.shopType} products`
      );

      this.logger.warn(`Transformation error for product ${productId}`, {
        context: {
          shopType: this.shopType,
          productId,
          error: serializedError,
          transformationDetails: error.details,
          productSize: JSON.stringify(product).length
        }
      });
    } else {
      // Log unexpected errors with full context
      this.logger.error(`Unexpected error processing product ${productId}`, {
        context: {
          shopType: this.shopType,
          productId,
          error: serializedError,
          productFields: Object.keys(product || {}),
          productSize: JSON.stringify(product).length,
          errorType: error?.constructor?.name || typeof error
        }
      });

      // Track unexpected errors as issues
      this.issueTracker.trackIssue(
        'TRANSFORMATION_ERROR',
        {
          processingStep: 'product_processing_unexpected',
          shopType: this.shopType as ShopType,
          productId,
          additionalData: {
            errorType: error?.constructor?.name || typeof error,
            errorStack: serializedError.stack,
            productFields: Object.keys(product || {})
          }
        },
        JSON.stringify(product),
        null,
        `Investigate unexpected error: ${serializedError.message}`
      );
    }

    // Create detailed error entry for stats with full error information
    this.stats.errors.push({
      productId,
      error: serializedError.message || String(error),
      details: {
        errorType: serializedError.name || 'UnknownError',
        stack: serializedError.stack,
        originalError: serializedError,
        productPreview: {
          fields: Object.keys(product || {}),
          size: JSON.stringify(product).length
        },
        ...(error instanceof TransformationError ? error.details : {})
      }
    });
  }

  private async writeErrorReport(): Promise<void> {
    // Return early if no errors
    if (this.stats.errors.length === 0) {
      return;
    }

    // Group errors by type
    const errorsByType = this.stats.errors.reduce((acc, error) => {
      if (!acc[error.error]) {
        acc[error.error] = [];
      }
      acc[error.error].push(error);
      return acc;
    }, {} as Record<string, typeof this.stats.errors>);

    // Create error summary
    const errorSummary = Object.entries(errorsByType).map(([errorType, errors]) => ({
      error: errorType,
      count: errors.length,
      examples: errors.slice(0, 5) // First 5 examples of each error type
    }));

    try {
      // Write to logs directory
      const errorsFile = `${this.shopType.toLowerCase()}-errors`;

      await this.logger.writeReport(errorsFile, {
        shopType: this.shopType,
        totalErrors: this.stats.errors.length,
        errorSummary,
        allErrors: this.stats.errors
      });

      this.logger.info(`Error report written`, {
        context: { shopType: this.shopType, errorCount: this.stats.errors.length }
      });
    } catch (error) {
      this.logger.error(`Failed to write error report for ${this.shopType}`, {
        context: { error: serializeError(error) }
      });
    }
  }

  private async writeStatsReport(): Promise<void> {
    // Generate detailed processing statistics
    const statsReport = {
      shopType: this.shopType,
      timestamp: new Date().toISOString(),
      processingDuration: `${((this.stats.endTime - this.stats.startTime) / 1000).toFixed(2)} seconds`,
      metrics: {
        totalProcessed: this.stats.totalProcessed,
        success: this.stats.success,
        failed: this.stats.failed,
        skipped: this.stats.skipped,
        deduped: this.stats.deduped,
        successRate: `${((this.stats.success / this.stats.totalProcessed) * 100).toFixed(2)}%`,
        failureRate: `${((this.stats.failed / this.stats.totalProcessed) * 100).toFixed(2)}%`,
        skipRate: `${((this.stats.skipped / this.stats.totalProcessed) * 100).toFixed(2)}%`,
        processingRate: `${Math.round(this.stats.totalProcessed / ((this.stats.endTime - this.stats.startTime) / 1000))} items/sec`,
        skippedDetails: {
          count: this.stats.skipped,
          reasons: this.collectSkipReasons()
        }
      }
    };

    try {
      // Write to logs directory
      const statsFile = `${this.shopType.toLowerCase()}-stats`;

      await this.logger.writeReport(statsFile, statsReport);

      this.logger.info(`Stats report written`, {
        context: { shopType: this.shopType, successCount: this.stats.success }
      });
    } catch (error) {
      this.logger.error(`Failed to write stats report for ${this.shopType}`, {
        context: { error: serializeError(error) }
      });
    }
  }

  private collectSkipReasons(): Record<string, number> {
    // This would require additional tracking of skip reasons
    // For now, we'll return a placeholder
    return {
      "validationFailed": this.stats.skipped,
      "missingRequiredFields": 0,
      "unavailable": 0
    };
  }

  /**
   * Parse input data from JSON string to array of products
   * Subclasses can override this if needed
   */
  protected parseInputData(rawData: string): T[] {
    try {
      return JSON.parse(rawData);
    } catch (error) {
      const serializedError = serializeError(error);
      this.logger.error(`Failed to parse input data for ${this.shopType}`, {
        context: {
          shopType: this.shopType,
          error: serializedError,
          dataPreview: rawData.substring(0, 200) + (rawData.length > 200 ? '...' : ''),
          dataSize: rawData.length
        }
      });
      throw new Error(`Failed to parse input data for ${this.shopType}: ${serializedError.message || String(error)}`);
    }
  }

  /**
   * Calculate quality metrics for the processed products
   */
  protected async calculateAndLogQualityMetrics(products: UnifiedProduct[]): Promise<void> {
    if (!products.length) return;

    try {
      const metrics = this.qualityService.calculateQualityMetrics(products);

      this.logger.info(`Quality metrics for ${this.shopType}`, {
        context: {
          shopType: this.shopType,
          overallScore: metrics.overallScore.toFixed(1),
          completeness: metrics.completeness.toFixed(1) + '%',
          categoryAccuracy: metrics.categoryAccuracy.toFixed(1) + '%',
          priceConsistency: metrics.priceConsistency.toFixed(1) + '%',
          promotionAccuracy: metrics.promotionAccuracy.toFixed(1) + '%',
          unitConsistency: metrics.unitConsistency.toFixed(1) + '%',
          scoreDistribution: metrics.scoreDistribution
        }
      });

      // Generate and save full report to intermediate directory
      const report = this.qualityService.generateQualityReport(products);
      const reportPath = path.join('processed_data', `quality-report-${this.shopType.toLowerCase()}.md`);
      await fs.writeFile(reportPath, report);

      this.logger.info(`Quality report written to ${reportPath}`);
    } catch (error) {
      this.logger.warn(`Failed to calculate quality metrics for ${this.shopType}`, {
        context: {
          error: serializeError(error)
        }
      });
    }
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  protected abstract shouldSkipProduct(product: T): boolean;
  protected abstract transformProduct(product: T): UnifiedProduct;
  protected abstract getProductId(product: T): string;
}
