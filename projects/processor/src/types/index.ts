// Export types from product.ts
export * from './product';

// Other type exports
export type ApiResponse<T> = {
  data: T;
  status: number;
  success: boolean;
};

export type PaginatedResponse<T> = {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
};

export type ErrorResponse = {
  message: string;
  code: string;
  status: number;
};

// Export ProcessStats interface used by BaseProcessor
export interface ProcessStats {
  totalProcessed: number;
  totalSuccess: number;
  totalFailed: number;
  startTime: number;
  endTime: number;
  processingTime: number;
}