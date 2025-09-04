// src/config/index.ts
import fs from 'fs-extra';
import path from 'path';
import { z } from 'zod';

// Define schema for configuration validation
const ShopConfigSchema = z.object({
  inputFile: z.string(),
  webshopId: z.number()
});

const ProcessingConfigSchema = z.object({
  batchSize: z.number().int().positive(),
  parallelProcessing: z.boolean(),
  retryAttempts: z.number().int().nonnegative()
});

const DirectoryConfigSchema = z.object({
  input: z.string(),
  output: z.string(),
  intermediate: z.string(),
  logs: z.string(),
  temp: z.string().optional().default('tmp')
});

const OutputConfigSchema = z.object({
  createBackups: z.boolean(),
  compressionEnabled: z.boolean(),
  prettyPrint: z.boolean()
});

const MLConfigSchema = z.object({
  modelDirectory: z.string().optional().default('saved_models'),
  confidenceThreshold: z.number().min(0).max(1).optional().default(0.65),
  enablePredictions: z.boolean().optional().default(true)
});

const EnrichmentConfigSchema = z.object({
  enabled: z.boolean().optional().default(false),
  calculatePricePerUnit: z.boolean().optional().default(true),
  calculateDiscounts: z.boolean().optional().default(true),
  calculateQualityScore: z.boolean().optional().default(true),
  categorizeProducts: z.boolean().optional().default(true),
  standardizeQuantities: z.boolean().optional().default(true)
});

const AppConfigSchema = z.object({
  directories: DirectoryConfigSchema,
  shops: z.object({
    ah: ShopConfigSchema,
    jumbo: ShopConfigSchema,
    aldi: ShopConfigSchema,
    plus: ShopConfigSchema
  }),
  processing: ProcessingConfigSchema,
  output: OutputConfigSchema,
  ml: MLConfigSchema.optional().default({
    modelDirectory: 'saved_models',
    confidenceThreshold: 0.65,
    enablePredictions: true
  }),
  enrichment: EnrichmentConfigSchema.optional().default({
    enabled: false,
    calculatePricePerUnit: true,
    calculateDiscounts: true,
    calculateQualityScore: true,
    categorizeProducts: true,
    standardizeQuantities: true
  }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).optional().default('info'),
    includeTimestamp: z.boolean().optional().default(true),
    consoleOutput: z.boolean().optional().default(true),
    fileOutput: z.boolean().optional().default(true),
    cleanupOnStartup: z.boolean().optional().default(true),
    retentionDays: z.number().int().positive().optional().default(7)
  }).optional().default({
    level: 'info',
    includeTimestamp: true,
    consoleOutput: true,
    fileOutput: true,
    cleanupOnStartup: true,
    retentionDays: 7
  })
});

// Type derived from schema
export type AppConfig = z.infer<typeof AppConfigSchema>;

/**
 * Loads and validates the application configuration
 */
export function loadConfig(configPath?: string): AppConfig {
  // Default config path is in the config directory
  const defaultConfigPath = path.resolve(__dirname, './default.json');
  const configFilePath = configPath || defaultConfigPath;

  try {
    if (!fs.existsSync(configFilePath)) {
      throw new Error(`Configuration file not found: ${configFilePath}`);
    }

    const rawConfig = fs.readJsonSync(configFilePath);

    // Validate config against schema
    return AppConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationErrors = error.errors.map((e) => {
        return `${e.path.join('.')}: ${e.message}`;
      }).join('\n');

      throw new Error(`Configuration validation failed:\n${validationErrors}`);
    }

    throw error;
  }
}

/**
 * Ensure all required directories in the config exist
 */
export async function ensureConfigDirectories(config: AppConfig): Promise<void> {
  const { directories } = config;

  // Create required directories if they don't exist
  await Promise.all([
    fs.ensureDir(directories.input),
    fs.ensureDir(directories.output),
    fs.ensureDir(directories.intermediate),
    fs.ensureDir(directories.logs),
    fs.ensureDir(path.join(directories.intermediate, 'temp')),
    fs.ensureDir(path.join(directories.intermediate, 'backups'))
  ]);
}

/**
 * Merge environment variables into the configuration
 * This allows for runtime overrides of configuration values
 */
export function applyEnvironmentOverrides(config: AppConfig): AppConfig {
  const overrides: Partial<AppConfig> = {};

  // Processing configuration overrides
  if (process.env.PARALLEL_PROCESSING) {
    overrides.processing = {
      ...config.processing,
      parallelProcessing: process.env.PARALLEL_PROCESSING.toLowerCase() === 'true'
    };
  }

  if (process.env.BATCH_SIZE) {
    const batchSize = parseInt(process.env.BATCH_SIZE, 10);
    if (!isNaN(batchSize) && batchSize > 0) {
      overrides.processing = {
        ...overrides.processing || config.processing,
        batchSize
      };
    }
  }

  // Logging configuration overrides
  if (process.env.LOG_LEVEL) {
    const level = process.env.LOG_LEVEL.toLowerCase();
    if (['debug', 'info', 'warn', 'error'].includes(level)) {
      overrides.logging = {
        ...config.logging,
        level: level as 'debug' | 'info' | 'warn' | 'error'
      };
    }
  }

  // ML configuration overrides
  if (process.env.ML_CONFIDENCE_THRESHOLD) {
    const threshold = parseFloat(process.env.ML_CONFIDENCE_THRESHOLD);
    if (!isNaN(threshold) && threshold >= 0 && threshold <= 1) {
      overrides.ml = {
        ...config.ml,
        confidenceThreshold: threshold
      };
    }
  }

  if (process.env.ENABLE_ML_PREDICTIONS) {
    overrides.ml = {
      ...config.ml,
      enablePredictions: process.env.ENABLE_ML_PREDICTIONS.toLowerCase() === 'true'
    };
  }

  // Enrichment configuration overrides
  if (process.env.ENABLE_ENRICHMENT) {
    overrides.enrichment = {
      ...config.enrichment,
      enabled: process.env.ENABLE_ENRICHMENT.toLowerCase() === 'true'
    };
  }

  // Apply all overrides
  return {
    ...config,
    ...overrides,
    processing: {
      ...config.processing,
      ...(overrides.processing || {})
    },
    logging: {
      ...config.logging,
      ...(overrides.logging || {})
    },
    ml: {
      ...config.ml,
      ...(overrides.ml || {})
    },
    enrichment: {
      ...config.enrichment,
      ...(overrides.enrichment || {})
    }
  };
}

/**
 * Create and validate the application configuration
 */
export async function createConfig(configPath?: string): Promise<AppConfig> {
  // Load base configuration
  const config = loadConfig(configPath);

  // Apply environment variable overrides
  const mergedConfig = applyEnvironmentOverrides(config);

  // Ensure required directories exist
  await ensureConfigDirectories(mergedConfig);

  return mergedConfig;
}