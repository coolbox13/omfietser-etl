// src/testing/config-helper.ts
/**
 * Helper module to import configuration for testing
 */
import path from 'path';
import fs from 'fs-extra';

// Define the basic config structure needed for the tests
interface ShopConfig {
  inputFile: string;
  webshopId: number;
}

interface DirectoryConfig {
  input: string;
  output: string;
  intermediate: string;
  logs: string;
}

interface Config {
  directories: DirectoryConfig;
  shops: {
    ah: ShopConfig;
    jumbo: ShopConfig;
    aldi: ShopConfig;
    plus: ShopConfig;
  };
}

/**
 * Load configuration for testing
 */
export async function loadTestConfig(): Promise<Config> {
  try {
    // Try to import the config
    const configPath = path.resolve(process.cwd(), 'src/config/default.json');

    if (await fs.pathExists(configPath)) {
      // If config file exists, load it
      const configData = await fs.readJson(configPath);
      return configData as Config;
    } else {
      // Fallback to hardcoded defaults if config file doesn't exist
      return {
        directories: {
          input: 'data_in',
          output: 'data_out',
          intermediate: 'processed_data',
          logs: 'logs'
        },
        shops: {
          ah: {
            inputFile: 'ah_products.json',
            webshopId: 1
          },
          jumbo: {
            inputFile: 'jumbo_products.json',
            webshopId: 2
          },
          aldi: {
            inputFile: 'aldi_products.json',
            webshopId: 3
          },
          plus: {
            inputFile: 'plus_products.json',
            webshopId: 4
          }
        }
      };
    }
  } catch (error) {
    console.error('Error loading config:', error);
    throw error;
  }
}