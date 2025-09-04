// src/types/config.ts
export interface ShopConfig {
    inputFile: string;
    webshopId: number;
}

export interface ProcessingConfig {
    batchSize: number;
    parallelProcessing: boolean;
    retryAttempts: number;
}

export interface DirectoryConfig {
    input: string;        // data_in (raw scraped input files)
    output: string;       // data_out (final unified JSON output files)
    intermediate: string; // processed_data (intermediate processing files)
    logs: string;         // logs
}

export interface OutputConfig {
    createBackups: boolean;
    compressionEnabled: boolean;
    prettyPrint: boolean;
}

export interface MLConfig {
    modelDirectory?: string;
    confidenceThreshold?: number;
    enablePredictions?: boolean;
}

export interface EnrichmentConfig {
    enabled: boolean;
    calculatePricePerUnit?: boolean;
    calculateDiscounts?: boolean;
    calculateQualityScore?: boolean;
    categorizeProducts?: boolean;
    standardizeQuantities?: boolean;
}

export interface ProcessorConfig {
    directories: DirectoryConfig;
    shops: {
        ah: ShopConfig;
        jumbo: ShopConfig;
        aldi: ShopConfig;
        plus: ShopConfig;
    };
    processing: ProcessingConfig;
    output: OutputConfig;
    logging?: {
        level: 'debug' | 'info' | 'warn' | 'error';
        consoleOutput?: boolean;
        fileOutput?: boolean;
    };
    ml?: MLConfig;
    enrichment?: EnrichmentConfig;
}

export function validateConfig(config: unknown): asserts config is ProcessorConfig {
    if (!config || typeof config !== 'object') {
        throw new Error('Config must be an object');
    }

    const c = config as Record<string, unknown>;

    // Validate directories config
    if (!c.directories || typeof c.directories !== 'object') {
        throw new Error('directories configuration is required');
    }
    const dirs = c.directories as Record<string, unknown>;
    if (typeof dirs.input !== 'string') {
        throw new Error('directories.input must be a string');
    }
    if (typeof dirs.output !== 'string') {
        throw new Error('directories.output must be a string');
    }
    if (typeof dirs.intermediate !== 'string') {
        throw new Error('directories.intermediate must be a string');
    }
    if (typeof dirs.logs !== 'string') {
        throw new Error('directories.logs must be a string');
    }

    // Validate shops configuration
    if (!c.shops || typeof c.shops !== 'object') {
        throw new Error('shops configuration is required');
    }
    const shopObject = c.shops as Record<string, unknown>;
    const requiredShops = ['ah', 'jumbo', 'aldi', 'plus'] as const;
    for (const shop of requiredShops) {
        if (!validateShopConfig(shopObject[shop])) {
            throw new Error(`Invalid configuration for shop: ${shop}`);
        }
    }

    if (!validateProcessingConfig(c.processing)) {
        throw new Error('Invalid processing configuration');
    }

    if (!validateOutputConfig(c.output)) {
        throw new Error('Invalid output configuration');
    }
}

function validateShopConfig(config: unknown): config is ShopConfig {
    if (!config || typeof config !== 'object') {
        return false;
    }

    const c = config as Record<string, unknown>;
    return (
        typeof c.inputFile === 'string' &&
        typeof c.webshopId === 'number'
    );
}

function validateProcessingConfig(config: unknown): config is ProcessingConfig {
    if (!config || typeof config !== 'object') {
        return false;
    }

    const c = config as Record<string, unknown>;
    return (
        typeof c.batchSize === 'number' &&
        typeof c.parallelProcessing === 'boolean' &&
        typeof c.retryAttempts === 'number'
    );
}

function validateOutputConfig(config: unknown): config is OutputConfig {
    if (!config || typeof config !== 'object') {
        return false;
    }

    const c = config as Record<string, unknown>;
    return (
        typeof c.createBackups === 'boolean' &&
        typeof c.compressionEnabled === 'boolean' &&
        typeof c.prettyPrint === 'boolean'
    );
}