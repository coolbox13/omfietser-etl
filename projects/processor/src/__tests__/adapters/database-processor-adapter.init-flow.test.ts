// Tests specifically for adapter initialization flow and implicit waiting in processBatch
import { DatabaseProcessorAdapter, DatabaseProcessorConfig } from '../../adapters/database-processor-adapter';
import { RawProduct, CURRENT_SCHEMA_VERSION } from '../../infrastructure/database/types';

// Mock database adapter
const mockDatabaseAdapter = {
  validateStructureCompliance: jest.fn().mockResolvedValue({ compliant: 1, total: 1, violations: [] })
} as any;

// Mock the database module to return our mock adapter
jest.mock('../../infrastructure/database', () => ({
  getDatabaseAdapter: jest.fn()
}));

describe('DatabaseProcessorAdapter initialization flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('processBatch should implicitly wait for initialization without explicit waitForInitialization', async () => {
    const config: DatabaseProcessorConfig = {
      jobId: 'test-job-init-flow',
      shopType: 'ah',
      batchSize: 1,
      enableProgressUpdates: true,
      progressUpdateInterval: 5,
      enforceStructureValidation: true,
      schemaVersion: CURRENT_SCHEMA_VERSION
    };

    // Wire mock DB adapter
    const { getDatabaseAdapter } = require('../../infrastructure/database');
    (getDatabaseAdapter as jest.Mock).mockResolvedValue(mockDatabaseAdapter);

    const adapter = new DatabaseProcessorAdapter(config);

    // Do NOT call await adapter.waitForInitialization();
    // Provide minimal raw product consistent with other tests
    const rawProducts: RawProduct[] = [
      {
        id: 'raw-implicit-1',
        shop_type: 'ah',
        job_id: 'test-job-init-flow',
        raw_data: {
          webshopId: 1010,
          title: 'Implicit Init Product',
          currentPrice: 1.99,
          priceBeforeBonus: 2.49,
          brand: 'Test Brand',
          salesUnitSize: '250g',
          shopType: 'AH',
          images: [{ url: 'https://example.com/image.jpg', width: 300 }],
          mainCategory: 'Food',
          orderAvailabilityStatus: 'IN_ASSORTMENT'
        },
        scraped_at: new Date(),
        created_at: new Date()
      }
    ];

    const result = await adapter.processBatch(rawProducts);

    // Should process successfully, not throw "Adapter not fully initialized"
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockDatabaseAdapter.validateStructureCompliance).toHaveBeenCalled();
  });
});
