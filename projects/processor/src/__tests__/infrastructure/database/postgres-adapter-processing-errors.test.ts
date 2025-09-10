// Tests for processing_errors inserts to ensure shop_type is included
import { PostgreSQLAdapter } from '../../../infrastructure/database/postgres-adapter';
import { DatabaseConnection } from '../../../infrastructure/database/connection';
import { ProcessingErrorInsert } from '../../../infrastructure/database/types';

describe('PostgreSQLAdapter processing_errors inserts', () => {
  let adapter: PostgreSQLAdapter;
  let mockConnection: any;

  beforeEach(() => {
    mockConnection = {
      query: jest.fn(),
      transaction: jest.fn()
    } as unknown as DatabaseConnection;

    adapter = new PostgreSQLAdapter(mockConnection as DatabaseConnection);
  });

  it('insertProcessingError should include shop_type in SQL and params', async () => {
    const error: ProcessingErrorInsert = {
      job_id: 'job-1',
      raw_product_id: 'raw-1',
      product_id: 'raw-1',
      shop_type: 'ah',
      error_type: 'BATCH_PROCESSING_ERROR',
      error_message: 'test',
      severity: 'high'
    };

    (mockConnection.query as jest.Mock).mockResolvedValue({ rows: [{ id: 1 }] });

    await adapter.insertProcessingError(error);

    expect(mockConnection.query).toHaveBeenCalled();
    const [sql, params] = (mockConnection.query as jest.Mock).mock.calls[0];

    expect(sql).toContain('(job_id, raw_product_id, product_id, shop_type, error_type');
    expect(params[3]).toBe('ah'); // $4 is shop_type
  });

  it('insertProcessingErrors should include shop_type in SQL and params for batch', async () => {
    const errors: ProcessingErrorInsert[] = [
      {
        job_id: 'job-2',
        raw_product_id: 'raw-2',
        product_id: 'raw-2',
        shop_type: 'jumbo',
        error_type: 'BATCH_PROCESSING_ERROR',
        error_message: 'batch',
        severity: 'high'
      }
    ];

    const mockClient = { query: jest.fn().mockResolvedValue({ rows: [{ id: 2 }] }) };
    (mockConnection.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(mockClient));

    await adapter.insertProcessingErrors(errors);

    expect(mockClient.query).toHaveBeenCalled();
    const [sql, params] = (mockClient.query as jest.Mock).mock.calls[0];

    expect(sql).toContain('(job_id, raw_product_id, product_id, shop_type, error_type');
    expect(params[3]).toBe('jumbo'); // $4 is shop_type
  });
});
