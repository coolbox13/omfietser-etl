// src/core/services/output.ts
import fs from 'fs-extra';
import path from 'path';
import { getLogger } from '../../infrastructure/logging';
import { UnifiedProduct } from '../../types'; // Fix the import path

/**
 * Service responsible for handling output operations
 */
export class OutputService {
  private static instance: OutputService | null = null;
  private readonly logger = getLogger();
  private readonly outputDir: string;
  private readonly createBackups: boolean;
  private readonly prettyPrint: boolean;

  private constructor(outputDir: string, options: OutputOptions = {}) {
    this.outputDir = outputDir;
    this.createBackups = options.createBackups ?? true;
    this.prettyPrint = options.prettyPrint ?? true;
    this.logger.info('Output Service initialized', {
      context: {
        outputDir,
        options
      }
    });
  }

  /**
   * Get the singleton instance of the OutputService
   */
  public static getInstance(outputDir?: string, options?: OutputOptions): OutputService {
    if (!OutputService.instance && outputDir) {
      OutputService.instance = new OutputService(outputDir, options);
    } else if (!OutputService.instance && !outputDir) {
      throw new Error('Output directory must be provided when initializing OutputService');
    }
    return OutputService.instance!;
  }

  /**
   * Write product data to a file
   * @param shop Shop identifier (e.g., 'ah', 'jumbo')
   * @param products The unified products to write
   * @returns Promise that resolves when the write is complete
   */
  public async writeProductData(shop: string, products: UnifiedProduct[]): Promise<void> {
    const outputFile = path.join(this.outputDir, `unified_${shop.toLowerCase()}_products.json`);
    
    // Create backup if file exists and backups are enabled
    if (this.createBackups && await fs.pathExists(outputFile)) {
      await this.createBackup(outputFile);
    }
    
    try {
      await fs.ensureDir(path.dirname(outputFile));
      await fs.writeJson(outputFile, products, { spaces: this.prettyPrint ? 2 : 0 });
      
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
  public async cleanupOldFiles(retentionDays: number = 7): Promise<void> {
    try {
      const backupDir = path.join(this.outputDir, 'backups');
      if (!await fs.pathExists(backupDir)) {
        return;
      }
      
      const now = new Date().getTime();
      const files = await fs.readdir(backupDir);
      
      for (const file of files) {
        const filePath = path.join(backupDir, file);
        
        try {
          const stats = await fs.stat(filePath);
          const fileAge = (now - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
          
          if (fileAge > retentionDays) {
            await fs.remove(filePath);
            
            this.logger.info(`Removed old backup file: ${file}`, {
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
      this.logger.error(`Failed to clean up old files`, {
        context: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }
}

export interface OutputOptions {
  createBackups?: boolean;
  prettyPrint?: boolean;
}

/**
 * Initialize the OutputService
 */
export function initializeOutputService(outputDir: string, options?: OutputOptions): OutputService {
  return OutputService.getInstance(outputDir, options);
}

/**
 * Get the OutputService instance
 */
export function getOutputService(): OutputService {
  return OutputService.getInstance();
}