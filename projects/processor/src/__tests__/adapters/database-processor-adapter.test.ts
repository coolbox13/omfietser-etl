// Tests for DatabaseProcessorAdapter with structure validation
import { EventEmitter } from 'events';
import { DatabaseProcessorAdapter, DatabaseProcessorConfig, ProcessingBatchResult } from '../../adapters/database-processor-adapter';
import { RawProduct, ProcessedProduct, SCHEMA_VERSION_FIELDS, CURRENT_SCHEMA_VERSION } from '../../infrastructure/database/types';
import { StructureValidator } from '../../core/structure/structure-validator';
import * as databaseModule from '../../infrastructure/database';

// Mock database adapter
const mockDatabaseAdapter = {
  getRawProducts: jest.fn(),
  getRawProductById: jest.fn(),
  insertRawProduct: jest.fn(),
  insertRawProducts: jest.fn(),
  insertStagingProduct: jest.fn(),
  insertStagingProducts: jest.fn(),
  getStagingProductByExternalId: jest.fn(),
  getProcessingJobs: jest.fn(),
  getProcessingJobById: jest.fn(),
  createProcessingJob: jest.fn(),
  updateProcessingJob: jest.fn(),
  completeProcessingJob: jest.fn(),
  getProcessedProducts: jest.fn(),
  getProcessedProductById: jest.fn(),
  getProcessedProductByCompositeKey: jest.fn(),
  insertProcessedProduct: jest.fn(),
  insertProcessedProducts: jest.fn(),
  upsertProcessedProduct: jest.fn(),
  getProcessingErrors: jest.fn(),
  insertProcessingError: jest.fn(),
  insertProcessingErrors: jest.fn(),
  resolveProcessingError: jest.fn(),
  getJobStatistics: jest.fn(),
  getErrorSummary: jest.fn(),
  getSchemaVersionStats: jest.fn(),
  healthCheck: jest.fn(),
  getConnectionStats: jest.fn(),
  validateStructureCompliance: jest.fn()
};

// Mock the database module
jest.mock('../../infrastructure/database', () => ({
  getDatabaseAdapter: jest.fn()
}));

describe('DatabaseProcessorAdapter', () => {
  let adapter: DatabaseProcessorAdapter;
  let config: DatabaseProcessorConfig;
  
  beforeEach(async () => {
    config = {
      jobId: 'test-job-123',
      shopType: 'ah',
      batchSize: 10,
      enableProgressUpdates: true,
      progressUpdateInterval: 5,
      enforceStructureValidation: true,
      schemaVersion: CURRENT_SCHEMA_VERSION
    };

    // Reset all mocks
    Object.values(mockDatabaseAdapter).forEach(mock => {
      if (typeof mock === 'function') {
        mock.mockClear();
      }
    });

    // Setup database adapter mock
    const { getDatabaseAdapter } = require('../../infrastructure/database');
    (getDatabaseAdapter as jest.Mock).mockResolvedValue(mockDatabaseAdapter);

    adapter = new DatabaseProcessorAdapter(config);
    
    // Wait for initialization to complete
    await adapter.waitForInitialization();
  });

  describe('initialization', () => {
    it('should create adapter with correct configuration', () => {
      expect(adapter.getConfig()).toEqual({
        ...config,
        enforceStructureValidation: true,
        schemaVersion: CURRENT_SCHEMA_VERSION
      });
    });

    it('should extend EventEmitter', () => {
      expect(adapter).toBeInstanceOf(EventEmitter);
    });

    it('should throw error for unsupported shop type', () => {
      const invalidConfig = { ...config, shopType: 'invalid' };
      expect(() => new DatabaseProcessorAdapter(invalidConfig)).toThrow('Unsupported shop type: invalid');
    });
  });

  describe('structure validation', () => {
    let mockRawProducts: RawProduct[];
    
    beforeEach(() => {
      mockRawProducts = [
        {
          id: 'raw-1',
          shop_type: 'ah',
          job_id: 'test-job-123',
          raw_data: {
            webshopId: 12345,
            title: 'Test Product 1',
            currentPrice: 2.99,
            priceBeforeBonus: 3.49,
            brand: 'Test Brand',
            salesUnitSize: '500g',
            shopType: 'AH',
            images: [{ url: 'https://example.com/image1.jpg', width: 300 }],
            mainCategory: 'Food',
            orderAvailabilityStatus: 'IN_ASSORTMENT'
          },
          scraped_at: new Date(),
          created_at: new Date()
        },
        {
          id: 'raw-2',
          shop_type: 'ah',
          job_id: 'test-job-123',
          raw_data: {
            webshopId: 67890,
            title: 'Test Product 2',
            currentPrice: 4.50,
            priceBeforeBonus: 5.00,
            brand: 'Test Brand',
            salesUnitSize: '1kg',
            shopType: 'AH',
            images: [{ url: 'https://example.com/image2.jpg', width: 300 }],
            mainCategory: 'Food',
            orderAvailabilityStatus: 'IN_ASSORTMENT'
          },
          scraped_at: new Date(),
          created_at: new Date()
        }
      ];

      // Mock successful structure validation
      mockDatabaseAdapter.validateStructureCompliance.mockResolvedValue({
        compliant: 2,
        total: 2,
        violations: []
      });
    });

    it('should process batch with 100% structure compliance', async () => {
      const result = await adapter.processBatch(mockRawProducts);

      expect(result.processed).toBe(2);
      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.structureValidationResults.compliant).toBe(2);
      expect(result.structureValidationResults.total).toBe(2);
      expect(result.structureValidationResults.violations).toHaveLength(0);
    });

    it('should validate all processed products have 32 required fields', async () => {
      const result = await adapter.processBatch(mockRawProducts);

      // Check that all processed products have the correct structure
      for (const product of result.processedProducts) {
        // Verify all required fields are present
        for (const field of SCHEMA_VERSION_FIELDS) {
          expect(product).toHaveProperty(field);
        }

        // Verify database-specific fields
        expect(product).toHaveProperty('job_id');
        expect(product).toHaveProperty('raw_product_id');
        expect(product).toHaveProperty('schema_version');
        expect(product).toHaveProperty('external_id');
      }
    });

    it('should enforce structure validation when enabled', async () => {
      // Mock validation failure
      mockDatabaseAdapter.validateStructureCompliance.mockResolvedValue({
        compliant: 1,
        total: 2,
        violations: ['Product 1: missing required field "title"']
      });

      await expect(adapter.processBatch(mockRawProducts)).rejects.toThrow(
        'Structure compliance failed: 1 violations found'
      );
    });

    it('should allow non-compliant products when validation is disabled', async () => {
      const nonEnforcingConfig = { ...config, enforceStructureValidation: false };
      const nonEnforcingAdapter = new DatabaseProcessorAdapter(nonEnforcingConfig);

      // Mock validation failure
      mockDatabaseAdapter.validateStructureCompliance.mockResolvedValue({
        compliant: 1,
        total: 2,
        violations: ['Product 1: missing required field "title"']
      });

      const result = await nonEnforcingAdapter.processBatch(mockRawProducts);

      expect(result.success).toBe(2);
      expect(result.structureValidationResults.compliant).toBe(1);
      expect(result.structureValidationResults.violations).toHaveLength(1);
    });
  });

  describe('schema versioning', () => {
    it('should include schema version in processed products', async () => {
      const customVersion = '2.0.0';
      const versionedConfig = { ...config, schemaVersion: customVersion };
      const versionedAdapter = new DatabaseProcessorAdapter(versionedConfig);

      const mockRawProducts = [{
        id: 'raw-1',
        shop_type: 'ah',
        job_id: 'test-job-123',
        raw_data: { 
          webshopId: 12345,
          title: 'Test Product',
          currentPrice: 2.99,
          priceBeforeBonus: 3.49,
          brand: 'Test Brand',
          salesUnitSize: '500g',
          shopType: 'AH',
          images: [{ url: 'https://example.com/image.jpg', width: 300 }],
          mainCategory: 'Food',
          orderAvailabilityStatus: 'IN_ASSORTMENT'
        },
        scraped_at: new Date(),
        created_at: new Date()
      }];

      mockDatabaseAdapter.validateStructureCompliance.mockResolvedValue({
        compliant: 1,
        total: 1,
        violations: []
      });

      const result = await versionedAdapter.processBatch(mockRawProducts);

      expect(result.processedProducts[0].schema_version).toBe(customVersion);
    });

    it('should default to current schema version', async () => {
      const mockRawProducts = [{
        id: 'raw-1',
        shop_type: 'ah',
        job_id: 'test-job-123',
        raw_data: { 
          webshopId: 12345,
          title: 'Test Product',
          currentPrice: 2.99,
          priceBeforeBonus: 3.49,
          brand: 'Test Brand',
          salesUnitSize: '500g',
          shopType: 'AH',
          images: [{ url: 'https://example.com/image.jpg', width: 300 }],
          mainCategory: 'Food',
          orderAvailabilityStatus: 'IN_ASSORTMENT'
        },
        scraped_at: new Date(),
        created_at: new Date()
      }];

      mockDatabaseAdapter.validateStructureCompliance.mockResolvedValue({
        compliant: 1,
        total: 1,
        violations: []
      });

      const result = await adapter.processBatch(mockRawProducts);

      expect(result.processedProducts[0].schema_version).toBe(CURRENT_SCHEMA_VERSION);
    });
  });

  describe('staging products', () => {
    it('should create staging products with extracted external_id', async () => {
      const mockRawProducts = [{
        id: 'raw-1',
        shop_type: 'ah',
        job_id: 'test-job-123',
        raw_data: { 
          webshopId: 'ah-external-123',
          title: 'Test Product',
          currentPrice: 2.99,
          priceBeforeBonus: 3.49,
          brand: 'Test Brand',
          salesUnitSize: '500g',
          shopType: 'AH',
          images: [{ url: 'https://example.com/image.jpg', width: 300 }],
          mainCategory: 'Food',
          orderAvailabilityStatus: 'IN_ASSORTMENT'
        },
        scraped_at: new Date(),
        created_at: new Date()
      }];

      mockDatabaseAdapter.validateStructureCompliance.mockResolvedValue({
        compliant: 1,
        total: 1,
        violations: []
      });

      const result = await adapter.processBatch(mockRawProducts);

      expect(result.stagingProducts).toHaveLength(1);
      expect(result.stagingProducts[0]).toMatchObject({
        raw_product_id: 'raw-1',
        shop_type: 'ah',
        external_id: 'ah-external-123',
        name: 'Test Product',
        price: 2.99
      });
      expect(result.stagingProducts[0].content_hash).toBeDefined();
      expect(result.stagingProducts[0].data).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle processing errors gracefully', async () => {
      const mockRawProducts = [{
        id: 'raw-1',
        shop_type: 'ah',
        job_id: 'test-job-123',
        raw_data: null, // Invalid data that will cause error
        scraped_at: new Date(),
        created_at: new Date()
      }];

      const result = await adapter.processBatch(mockRawProducts);

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.success).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        job_id: 'test-job-123',
        raw_product_id: 'raw-1',
        error_type: expect.any(String),
        error_message: expect.any(String),
        severity: expect.any(String)
      });
    });

    it('should categorize error severity correctly', async () => {
      const mockRawProducts = [{
        id: 'raw-1',
        shop_type: 'ah',
        job_id: 'test-job-123',
        raw_data: { 
          webshopId: 99999,
          title: 'Invalid Product',
          // Missing required fields to trigger error
          shopType: 'AH'
        },
        scraped_at: new Date(),
        created_at: new Date()
      }];

      // Force an error during processing
      const originalProcessBatch = adapter.processBatch.bind(adapter);
      jest.spyOn(adapter as any, 'transformProductWithValidation').mockRejectedValue(
        new Error('VALIDATION_ERROR: Invalid product data')
      );

      const result = await adapter.processBatch(mockRawProducts);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].severity).toBeDefined();
      expect(['low', 'medium', 'high', 'critical']).toContain(result.errors[0].severity);
    });
  });

  describe('external ID extraction', () => {
    const testCases = [
      {
        shopType: 'ah',
        rawData: { 
          webshopId: 'ah-123',
          title: 'Test Product',
          currentPrice: 2.99,
          shopType: 'AH',
          images: [{ url: 'https://example.com/image.jpg', width: 300 }],
          orderAvailabilityStatus: 'IN_ASSORTMENT'
        },
        expected: 'ah-123'
      },
      {
        shopType: 'jumbo',
        rawData: { productId: 'jumbo-789', sku: 'jumbo-sku-012' },
        expected: 'jumbo-789'
      },
      {
        shopType: 'aldi',
        rawData: { articleNumber: 'aldi-345' },
        expected: 'aldi-345'
      },
      {
        shopType: 'plus',
        rawData: { productNumber: 'plus-678' },
        expected: 'plus-678'
      }
    ];

    testCases.forEach(({ shopType, rawData, expected }) => {
      it(`should extract external_id correctly for ${shopType}`, async () => {
        const shopConfig = { ...config, shopType };
        const shopAdapter = new DatabaseProcessorAdapter(shopConfig);

        const mockRawProducts = [{
          id: 'raw-1',
          shop_type: shopType,
          job_id: 'test-job-123',
          raw_data: { ...rawData, title: 'Test Product', price: 2.99 },
          scraped_at: new Date(),
          created_at: new Date()
        }];

        mockDatabaseAdapter.validateStructureCompliance.mockResolvedValue({
          compliant: 1,
          total: 1,
          violations: []
        });

        const result = await shopAdapter.processBatch(mockRawProducts);

        expect(result.stagingProducts[0].external_id).toBe(expected);
        expect(result.processedProducts[0].external_id).toBe(expected);
      });
    });
  });

  describe('structure compliance monitoring', () => {
    beforeEach(() => {
      // Mock recent products query
      mockDatabaseAdapter.getProcessedProducts.mockResolvedValue([
        { unified_id: '1', title: 'Product 1' },
        { unified_id: '2', title: 'Product 2' }
      ]);
    });

    it('should calculate structure compliance rate', async () => {
      mockDatabaseAdapter.validateStructureCompliance.mockResolvedValue({
        compliant: 8,
        total: 10,
        violations: ['Product 9: missing field', 'Product 10: missing field']
      });

      const complianceRate = await adapter.getStructureComplianceRate();

      expect(complianceRate).toBe(0.8);
      expect(mockDatabaseAdapter.getProcessedProducts).toHaveBeenCalledWith({
        shop_type: 'ah',
        job_id: 'test-job-123',
        limit: 100
      });
    });

    it('should return 100% compliance for empty product set', async () => {
      mockDatabaseAdapter.getProcessedProducts.mockResolvedValue([]);

      const complianceRate = await adapter.getStructureComplianceRate();

      expect(complianceRate).toBe(1.0);
    });

    it('should handle errors in compliance calculation gracefully', async () => {
      mockDatabaseAdapter.getProcessedProducts.mockRejectedValue(new Error('Database error'));

      const complianceRate = await adapter.getStructureComplianceRate();

      expect(complianceRate).toBe(0);
    });
  });

  describe('event emission', () => {
    it('should emit events with proper logging', () => {
      const eventListener = jest.fn();
      adapter.on('test-event', eventListener);

      const result = adapter.emit('test-event', 'data1', 'data2');

      expect(result).toBe(true);
      expect(eventListener).toHaveBeenCalledWith('data1', 'data2');
    });
  });
});