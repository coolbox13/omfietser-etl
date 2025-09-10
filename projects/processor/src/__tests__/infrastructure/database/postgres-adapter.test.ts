// Tests for PostgreSQLAdapter with structure validation and schema versioning
import { PostgreSQLAdapter } from '../../../infrastructure/database/postgres-adapter';
import { DatabaseConnection } from '../../../infrastructure/database/connection';
import { 
  RawProduct,
  ProcessedProduct,
  ProcessedProductInsert, 
  CURRENT_SCHEMA_VERSION,
  SCHEMA_VERSION_FIELDS 
} from '../../../infrastructure/database/types';
import { StructureValidator } from '../../../core/structure/structure-validator';

// Mock the database connection
const mockConnection = {
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getConnectionStats: jest.fn(),
  isReady: jest.fn().mockReturnValue(true)
} as unknown as DatabaseConnection;

// Mock StructureValidator
jest.mock('../../../core/structure/structure-validator');
const MockStructureValidator = StructureValidator as jest.MockedClass<typeof StructureValidator>;

describe('PostgreSQLAdapter', () => {
  let adapter: PostgreSQLAdapter;
  let mockStructureValidator: jest.Mocked<StructureValidator>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mock structure validator - only mock the methods we use
    mockStructureValidator = {
      validateCompleteStructure: jest.fn().mockReturnValue({
        isValid: true,
        missingFields: [],
        extraFields: [],
        typeErrors: [],
        complianceScore: 1.0
      })
    } as any;

    adapter = new PostgreSQLAdapter(mockConnection);
    // Inject the mock validator
    (adapter as any).structureValidator = mockStructureValidator;
  });

  describe('Raw Products Operations', () => {
    describe('getRawProducts', () => {
      it('should build correct query with filters', async () => {
        const mockResults = { rows: [] };
        (mockConnection.query as jest.Mock).mockResolvedValue(mockResults);

        await adapter.getRawProducts({
          shop_type: 'ah',
          job_id: 'job-123',
          limit: 10,
          offset: 5
        });

        expect(mockConnection.query).toHaveBeenCalledWith(
          expect.stringContaining('SELECT * FROM raw.products WHERE 1=1 AND shop_type = $1 AND job_id = $2'),
          expect.arrayContaining(['ah', 'job-123', 10, 5])
        );
      });

      it('should handle date range filters', async () => {
        const mockResults = { rows: [] };
        (mockConnection.query as jest.Mock).mockResolvedValue(mockResults);

        const startDate = new Date('2024-01-01');
        const endDate = new Date('2024-01-31');

        await adapter.getRawProducts({
          scraped_after: startDate,
          scraped_before: endDate
        });

        expect(mockConnection.query).toHaveBeenCalledWith(
          expect.stringContaining('AND scraped_at >= $1 AND scraped_at <= $2'),
          [startDate, endDate]
        );
      });
    });

    describe('insertProcessedProducts', () => {
      it('should validate structure before batch insert', async () => {
        const mockProducts: ProcessedProductInsert[] = [{
          job_id: 'job-123',
          raw_product_id: 'raw-1',
          external_id: 'ext-1',
          shop_type: 'ah',
          title: 'Test Product',
          main_category: 'Food',
          brand: 'Test Brand',
          image_url: 'https://example.com/image.jpg',
          sales_unit_size: '500g',
          quantity_amount: 1,
          quantity_unit: 'piece',
          default_quantity_amount: 1,
          default_quantity_unit: 'piece',
          price_before_bonus: 3.99,
          current_price: 2.99,
          unit_price: 5.98,
          unit_price_unit: '1kg',
          is_promotion: true,
          promotion_type: 'discount',
          promotion_mechanism: 'percentage',
          promotion_start_date: '2024-01-01T00:00:00.000Z',
          promotion_end_date: '2024-01-31T23:59:59.000Z',
          parsed_promotion_effective_unit_price: 5.98,
          parsed_promotion_required_quantity: 1,
          parsed_promotion_total_price: 2.99,
          parsed_promotion_is_multi_purchase_required: false,
          normalized_quantity_amount: 500,
          normalized_quantity_unit: 'g',
          conversion_factor: 0.5,
          price_per_standard_unit: 5.98,
          current_price_per_standard_unit: 5.98,
          discount_absolute: 1.00,
          discount_percentage: 25.06,
          is_active: true
        }];

        // Mock transaction
        const mockClient = { query: jest.fn().mockResolvedValue({ rows: [{ id: 1, ...mockProducts[0] }] }) };
        (mockConnection.transaction as jest.Mock).mockImplementation(async (callback) => {
          return await callback(mockClient);
        });

        const result = await adapter.insertProcessedProducts(mockProducts);

        expect(mockStructureValidator.validateCompleteStructure).toHaveBeenCalledWith(mockProducts[0], {
          allowExtraFields: false,
          allowedExtraFields: ['job_id', 'raw_product_id', 'external_id', 'schema_version']
        });
        expect(result).toHaveLength(1);
      });

      it('should reject products that fail structure validation', async () => {
        const invalidProduct: ProcessedProductInsert = {
          job_id: 'job-123',
          raw_product_id: 'raw-1',
          shop_type: 'ah',
          // Missing required fields intentionally
        } as ProcessedProductInsert;

        // Mock validation failure
        mockStructureValidator.validateCompleteStructure.mockReturnValue({
          isValid: false,
          missingFields: ['title', 'brand'],
          extraFields: [],
          typeErrors: [],
          complianceScore: 0.0
        });

        await expect(adapter.insertProcessedProducts([invalidProduct])).rejects.toThrow(
          'Structure validation failed for product: missing field: title, missing field: brand'
        );
      });

      it('should include schema versioning in upsert query', async () => {
        const mockProduct: ProcessedProductInsert = {
          job_id: 'job-123',
          raw_product_id: 'raw-1',
          external_id: 'ext-1',
          schema_version: '2.0.0',
          shop_type: 'ah',
          title: 'Test Product',
          main_category: null,
          brand: 'Test Brand',
          image_url: '',
          sales_unit_size: '',
          quantity_amount: 1,
          quantity_unit: 'piece',
          default_quantity_amount: undefined,
          default_quantity_unit: undefined,
          price_before_bonus: 2.99,
          current_price: 2.99,
          unit_price: undefined,
          unit_price_unit: undefined,
          is_promotion: false,
          promotion_type: 'none',
          promotion_mechanism: 'none',
          promotion_start_date: null,
          promotion_end_date: null,
          parsed_promotion_effective_unit_price: undefined,
          parsed_promotion_required_quantity: undefined,
          parsed_promotion_total_price: undefined,
          parsed_promotion_is_multi_purchase_required: undefined,
          normalized_quantity_amount: undefined,
          normalized_quantity_unit: undefined,
          conversion_factor: undefined,
          price_per_standard_unit: undefined,
          current_price_per_standard_unit: undefined,
          discount_absolute: undefined,
          discount_percentage: undefined,
          is_active: true
        };

        const mockClient = { query: jest.fn().mockResolvedValue({ rows: [{ ...mockProduct, id: 1 }] }) };
        (mockConnection.transaction as jest.Mock).mockImplementation(async (callback) => {
          return await callback(mockClient);
        });

        await adapter.insertProcessedProducts([mockProduct]);

        // Verify the query includes schema versioning
        const queryCall = mockClient.query.mock.calls[0];
        expect(queryCall[0]).toContain('ON CONFLICT (shop_type, external_id, schema_version)');
        expect(queryCall[1]).toContain('2.0.0'); // Custom schema version
      });
    });
  });

  describe('Schema Versioning Support', () => {
    describe('getProcessedProductByCompositeKey', () => {
      it('should query with composite key including schema version', async () => {
        const mockResult = { rows: [{ unified_id: 'test-1' }] };
        (mockConnection.query as jest.Mock).mockResolvedValue(mockResult);

        await adapter.getProcessedProductByCompositeKey('ah', 'ext-123', '1.5.0');

        expect(mockConnection.query).toHaveBeenCalledWith(
          'SELECT * FROM processed.products WHERE shop_type = $1 AND external_id = $2 AND schema_version = $3',
          ['ah', 'ext-123', '1.5.0']
        );
      });

      it('should default to current schema version when not specified', async () => {
        const mockResult = { rows: [] };
        (mockConnection.query as jest.Mock).mockResolvedValue(mockResult);

        await adapter.getProcessedProductByCompositeKey('jumbo', 'ext-456');

        expect(mockConnection.query).toHaveBeenCalledWith(
          expect.any(String),
          ['jumbo', 'ext-456', CURRENT_SCHEMA_VERSION]
        );
      });
    });

    describe('getSchemaVersionStats', () => {
      it('should return schema version statistics', async () => {
        const mockStats = {
          rows: [
            { schema_version: '1.0.0', shop_type: 'ah', product_count: 1000, last_updated: new Date() },
            { schema_version: '1.0.0', shop_type: 'jumbo', product_count: 800, last_updated: new Date() },
            { schema_version: '2.0.0', shop_type: 'ah', product_count: 100, last_updated: new Date() }
          ]
        };
        (mockConnection.query as jest.Mock).mockResolvedValue(mockStats);

        const stats = await adapter.getSchemaVersionStats();

        expect(stats).toHaveLength(3);
        expect(stats[0]).toHaveProperty('schema_version');
        expect(stats[0]).toHaveProperty('shop_type');
        expect(stats[0]).toHaveProperty('product_count');
        expect(stats[0]).toHaveProperty('last_updated');
      });
    });
  });

  describe('Structure Validation', () => {
    describe('validateStructureCompliance', () => {
      it('should validate all products and report compliance', async () => {
        const mockProducts = [
          { unified_id: '1', title: 'Product 1' },
          { unified_id: '2', title: 'Product 2' },
          { unified_id: '3', title: 'Product 3' }
        ] as any[];

        // Mock mixed validation results
        mockStructureValidator.validateCompleteStructure
          .mockReturnValueOnce({ isValid: true, missingFields: [], extraFields: [], typeErrors: [], complianceScore: 1.0 })
          .mockReturnValueOnce({ isValid: false, missingFields: ['brand'], extraFields: [], typeErrors: [], complianceScore: 0.9 })
          .mockReturnValueOnce({ isValid: true, missingFields: [], extraFields: [], typeErrors: [], complianceScore: 1.0 });

        const result = await adapter.validateStructureCompliance(mockProducts);

        expect(result.total).toBe(3);
        expect(result.compliant).toBe(2);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]).toContain('Product 1 (2): missing field: brand');
      });

      it('should return 100% compliance for fully valid products', async () => {
        const mockProducts = [
          { unified_id: '1', title: 'Product 1' },
          { unified_id: '2', title: 'Product 2' }
        ] as any[];

        // All products pass validation
        mockStructureValidator.validateCompleteStructure.mockReturnValue({
          isValid: true,
          missingFields: [],
          extraFields: [],
          typeErrors: [],
          complianceScore: 1.0
        });

        const result = await adapter.validateStructureCompliance(mockProducts);

        expect(result.total).toBe(2);
        expect(result.compliant).toBe(2);
        expect(result.violations).toHaveLength(0);
      });
    });
  });

  describe('Staging Products Operations', () => {
    describe('insertStagingProducts', () => {
      it('should handle batch insertion with upsert logic', async () => {
        const stagingProducts = [
          {
            raw_product_id: 'raw-1',
            shop_type: 'ah',
            external_id: 'ext-1',
            name: 'Product 1',
            price: 2.99,
            data: { title: 'Product 1', price: 2.99 },
            content_hash: 'hash1'
          },
          {
            raw_product_id: 'raw-2',
            shop_type: 'ah',
            external_id: 'ext-2',
            name: 'Product 2',
            price: 4.50,
            data: { title: 'Product 2', price: 4.50 },
            content_hash: 'hash2'
          }
        ];

        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [{ id: 1, ...stagingProducts[0] }] })
            .mockResolvedValueOnce({ rows: [{ id: 2, ...stagingProducts[1] }] })
        };

        (mockConnection.transaction as jest.Mock).mockImplementation(async (callback) => {
          return await callback(mockClient);
        });

        const result = await adapter.insertStagingProducts(stagingProducts);

        expect(result).toHaveLength(2);
        expect(mockClient.query).toHaveBeenCalledTimes(2);
        
        // Verify upsert query structure
        const firstCall = mockClient.query.mock.calls[0];
        expect(firstCall[0]).toContain('ON CONFLICT (shop_type, external_id)');
        expect(firstCall[0]).toContain('DO UPDATE SET');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      const dbError = new Error('Connection failed');
      (mockConnection.query as jest.Mock).mockRejectedValue(dbError);

      await expect(adapter.getRawProducts({})).rejects.toThrow('Connection failed');
    });

    it('should log errors with appropriate context', async () => {
      const dbError = new Error('Query failed');
      (mockConnection.query as jest.Mock).mockRejectedValue(dbError);

      // Mock logger to verify error logging
      const mockLogger = { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() };
      (adapter as any).logger = mockLogger;

      await expect(adapter.getRawProductById('test-id')).rejects.toThrow('Query failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get raw product by ID',
        expect.objectContaining({ id: 'test-id', error: dbError })
      );
    });
  });

  describe('Health Check and Monitoring', () => {
    it('should delegate health check to connection', async () => {
      (mockConnection.healthCheck as jest.Mock).mockResolvedValue(true);

      const result = await adapter.healthCheck();

      expect(result).toBe(true);
      expect(mockConnection.healthCheck).toHaveBeenCalled();
    });

    it('should delegate connection stats to connection', async () => {
      const mockStats = { totalConnections: 10, idleConnections: 5 };
      (mockConnection.getConnectionStats as jest.Mock).mockResolvedValue(mockStats);

      const result = await adapter.getConnectionStats();

      expect(result).toEqual(mockStats);
      expect(mockConnection.getConnectionStats).toHaveBeenCalled();
    });
  });

  describe('Statistics Operations', () => {
    describe('getJobStatistics', () => {
      it('should return statistics for specific job', async () => {
        const mockStats = {
          rows: [{
            job_id: 'job-123',
            shop_type: 'ah',
            status: 'completed',
            total_products: 100,
            success_count: 95,
            failed_count: 5,
            success_percentage: 95.00
          }]
        };
        (mockConnection.query as jest.Mock).mockResolvedValue(mockStats);

        const stats = await adapter.getJobStatistics('job-123');

        expect(stats).toHaveLength(1);
        expect(stats[0].job_id).toBe('job-123');
        expect(stats[0].success_percentage).toBe(95.00);
      });

      it('should return recent jobs when no jobId specified', async () => {
        const mockStats = { rows: [] };
        (mockConnection.query as jest.Mock).mockResolvedValue(mockStats);

        await adapter.getJobStatistics();

        const queryCall = (mockConnection.query as jest.Mock).mock.calls[0];
        expect(queryCall[0]).toContain('ORDER BY created_at DESC LIMIT 100');
        expect(queryCall[1]).toEqual([]);
      });
    });
  });
});