// Validation schemas for API request bodies using Zod
import { z } from 'zod';

// Valid shop types
const VALID_SHOP_TYPES = ['ah', 'jumbo', 'aldi', 'plus', 'kruidvat'] as const;

// Schema for creating a new processing job
export const createJobSchema = z.object({
  shop_type: z.enum(VALID_SHOP_TYPES, {
    errorMap: () => ({ message: `shop_type must be one of: ${VALID_SHOP_TYPES.join(', ')}` })
  }),
  batch_size: z.number().int().min(1).max(10000).optional(),
  metadata: z.record(z.unknown()).optional()
});

// Schema for canceling a job
export const cancelJobSchema = z.object({
  reason: z.string().min(1).max(500).optional()
});

// Schema for processing a specific shop
export const processShopSchema = z.object({
  batch_size: z.number().int().min(1).max(10000).optional(),
  metadata: z.record(z.unknown()).optional()
});

// Schema for N8N webhook
export const webhookN8nSchema = z.object({
  action: z.string().min(1, "action is required"),
  shop_type: z.enum(VALID_SHOP_TYPES, {
    errorMap: () => ({ message: `shop_type must be one of: ${VALID_SHOP_TYPES.join(', ')}` })
  }),
  batch_id: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

// Schema for starting a job (no body required, but validate if present)
export const startJobSchema = z.object({}).optional();

// Type exports for TypeScript support
export type CreateJobInput = z.infer<typeof createJobSchema>;
export type CancelJobInput = z.infer<typeof cancelJobSchema>;
export type ProcessShopInput = z.infer<typeof processShopSchema>;
export type WebhookN8nInput = z.infer<typeof webhookN8nSchema>;
export type StartJobInput = z.infer<typeof startJobSchema>;
