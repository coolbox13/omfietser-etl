// src/infrastructure/storage/writer.ts
import fs from 'fs-extra';
import path from 'path';
import { getLogger } from '../logging';
import { FileSystemError } from '../../utils/error';
import { UnifiedProduct } from '../../types';

export interface WriterOptions {
  outputDir?: string;
  createBackups?: boolean;
  prettyPrint?: boolean;
  encoding?: BufferEncoding;
  maxRetries?: number;
  retryDelay?: number;
}

export class StorageWriter {
  private static instance: StorageWriter | null = null;

  // Lazy-loaded logger to avoid initialization issues
  private get logger() {
    return getLogger();
  }
  private readonly defaultOptions: WriterOptions = {
    outputDir: 'processed_data',
    createBackups: true,
    prettyPrint: true,
    encoding: 'utf8',
    maxRetries: 3,
    retryDelay: 500
  };

  private constructor() {}

  public static getInstance(): StorageWriter {
    if (!StorageWriter.instance) {
      StorageWriter.instance = new StorageWriter();
    }
    return StorageWriter.instance;
  }

  /**
   * Write data to a file with error handling and retries
   */
  public async writeFile(
    filepath: string,
    data: string | Buffer,
    options: WriterOptions = {}
  ): Promise<void> {
    const {
      createBackups = this.defaultOptions.createBackups,
      encoding = this.defaultOptions.encoding,
      maxRetries = this.defaultOptions.maxRetries || 3,
      retryDelay = this.defaultOptions.retryDelay
    } = options;

    // Ensure the directory exists
    await fs.ensureDir(path.dirname(filepath));

    // Create backup if file exists and backups are enabled
    if (createBackups && await fs.pathExists(filepath)) {
      await this.createBackup(filepath);
    }

    let attempts = 0;

    while (attempts < maxRetries) {
      try {
        await fs.writeFile(filepath, data, { encoding });

        this.logger.debug(`Successfully wrote file: ${filepath}`, {
          context: {
            filepath,
            size: data instanceof Buffer ? data.length : data.length
          }
        });

        return;
      } catch (error) {
        attempts++;

        if (attempts >= maxRetries) {
          this.logger.error(`Failed to write file after ${maxRetries} attempts`, {
            context: {
              filepath,
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          });

          throw new FileSystemError(
            `Failed to write file: ${filepath}`,
            {
              filepath,
              operation: 'writeFile',
              originalError: error instanceof Error ? error.message : String(error)
            }
          );
        }

        this.logger.warn(`Error writing file, retrying (${attempts}/${maxRetries})`, {
          context: {
            filepath,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        });

        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  /**
   * Write JSON data to a file
   */
  public async writeJsonFile(
    filepath: string,
    data: any,
    options: WriterOptions = {}
  ): Promise<void> {
    const { prettyPrint = this.defaultOptions.prettyPrint, ...rest } = options;

    try {
      const jsonString = prettyPrint
        ? JSON.stringify(data, null, 2)
        : JSON.stringify(data);

      await this.writeFile(filepath, jsonString, rest);
    } catch (error) {
      if (error instanceof FileSystemError) {
        throw error;
      }

      throw new FileSystemError(
        `Failed to write JSON file: ${filepath}`,
        {
          filepath,
          operation: 'writeJsonFile',
          originalError: error instanceof Error ? error.message : String(error)
        }
      );
    }
  }

  /**
   * Write product data to a JSON file
   */
  public async writeProductData(
    shop: string,
    products: UnifiedProduct[],
    options: WriterOptions = {}
  ): Promise<void> {
    const outputDir = options.outputDir || this.defaultOptions.outputDir;
    if (!outputDir) {
      throw new Error('Output directory is undefined');
    }
    const outputFile = path.join(outputDir ?? 'default_output', `unified_${shop?.toLowerCase() ?? 'unknown'}_products.json`);

    try {
      await this.writeJsonFile(outputFile, products, options);

      this.logger.info(`Successfully wrote ${products.length} products for ${shop}`, {
        context: {
          shop,
          outputFile,
          productCount: products.length
        }
      });
    } catch (error) {
      this.logger.error(`Failed to write product data for ${shop}`, {
        context: {
          shop,
          outputFile,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });

      throw error;
    }
  }

  /**
   * Create a backup of an existing file
   */
  private async createBackup(filepath: string): Promise<void> {
    try {
      const backupDir = path.join(path.dirname(filepath), 'backups');
      await fs.ensureDir(backupDir);

      const filename = path.basename(filepath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(
        backupDir,
        `${path.parse(filename).name}_${timestamp}${path.parse(filename).ext}`
      );

      await fs.copy(filepath, backupFile);

      this.logger.debug(`Created backup of ${filename}`, {
        context: {
          sourcePath: filepath,
          backupPath: backupFile
        }
      });
    } catch (error) {
      this.logger.warn(`Failed to create backup of ${filepath}`, {
        context: {
          filepath,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
      // Don't throw - backups are optional and shouldn't block the main operation
    }
  }

  /**
   * Clean up old files based on retention policy
   */
  public async cleanupOldFiles(directory: string, retentionDays: number = 7): Promise<void> {
    try {
      if (!await fs.pathExists(directory)) {
        this.logger.debug(`Directory not found, skipping cleanup: ${directory}`);
        return;
      }

      const now = new Date().getTime();
      const files = await fs.readdir(directory);

      for (const file of files) {
        const filePath = path.join(directory, file);

        try {
          const stats = await fs.stat(filePath);

          // Skip directories unless they're in the backups folder
          if (stats.isDirectory() && path.basename(filePath) !== 'backups') {
            continue;
          }

          const fileAge = (now - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

          if (fileAge > retentionDays) {
            await fs.remove(filePath);

            this.logger.info(`Removed old file: ${file}`, {
              context: {
                file,
                age: Math.round(fileAge)
              }
            });
          }
        } catch (error) {
          this.logger.warn(`Failed to process file during cleanup: ${file}`, {
            context: {
              file,
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          });
        }
      }
    } catch (error) {
      this.logger.error(`Failed to clean up old files in ${directory}`, {
        context: {
          directory,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }
}

// Singleton accessor
export function getStorageWriter(): StorageWriter {
  return StorageWriter.getInstance();
}