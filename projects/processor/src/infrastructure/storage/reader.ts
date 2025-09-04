// src/infrastructure/storage/reader.ts
import fs from 'fs-extra';
import path from 'path';
import { getLogger } from '../logging';
import { FileSystemError } from '../../utils/error';

export interface ReaderOptions {
  encoding?: BufferEncoding;
  maxRetries?: number;
  retryDelay?: number;
}

export class StorageReader {
  private static instance: StorageReader | null = null;

  // Lazy-loaded logger to avoid initialization issues
  private get logger() {
    return getLogger();
  }

  private constructor() {}

  public static getInstance(): StorageReader {
    if (!StorageReader.instance) {
      StorageReader.instance = new StorageReader();
    }
    return StorageReader.instance;
  }

  /**
   * Read a file with error handling and retries
   */
  public async readFile(
    filepath: string,
    options: ReaderOptions = {}
  ): Promise<Buffer | string> {
    const {
      encoding,
      maxRetries = 3,
      retryDelay = 500
    } = options;

    let attempts = 0;

    while (attempts < maxRetries) {
      try {
        if (!fs.existsSync(filepath)) {
          throw new FileSystemError(`File not found: ${filepath}`, {
            filepath,
            operation: 'readFile'
          });
        }

        const data = await fs.readFile(filepath, encoding);

        this.logger.debug(`Successfully read file: ${filepath}`, {
          context: {
            filepath,
            size: data instanceof Buffer ? data.length : data.length,
            encoding
          }
        });

        return data;
      } catch (error) {
        attempts++;

        if (attempts >= maxRetries) {
          this.logger.error(`Failed to read file after ${maxRetries} attempts`, {
            context: {
              filepath,
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          });

          throw new FileSystemError(
            `Failed to read file: ${filepath}`,
            {
              filepath,
              operation: 'readFile',
              originalError: error instanceof Error ? error.message : String(error)
            }
          );
        }

        this.logger.warn(`Error reading file, retrying (${attempts}/${maxRetries})`, {
          context: {
            filepath,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        });

        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    // This should never be reached due to the throw in the catch block
    throw new Error('Unexpected end of readFile method');
  }

  /**
   * Read and parse a JSON file
   */
  public async readJsonFile<T = any>(
    filepath: string,
    options: ReaderOptions = {}
  ): Promise<T> {
    try {
      const content = await this.readFile(filepath, { ...options, encoding: 'utf8' });

      try {
        return JSON.parse(content as string) as T;
      } catch (error) {
        this.logger.error(`Failed to parse JSON file: ${filepath}`, {
          context: {
            filepath,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        });

        throw new FileSystemError(
          `Invalid JSON in file: ${filepath}`,
          {
            filepath,
            operation: 'readJsonFile',
            originalError: error instanceof Error ? error.message : String(error)
          }
        );
      }
    } catch (error) {
      if (error instanceof FileSystemError) {
        throw error;
      }

      throw new FileSystemError(
        `Failed to read JSON file: ${filepath}`,
        {
          filepath,
          operation: 'readJsonFile',
          originalError: error instanceof Error ? error.message : String(error)
        }
      );
    }
  }

  /**
   * Check if a file exists
   */
  public async fileExists(filepath: string): Promise<boolean> {
    try {
      return await fs.pathExists(filepath);
    } catch (error) {
      this.logger.error(`Error checking if file exists: ${filepath}`, {
        context: {
          filepath,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });

      return false;
    }
  }

  /**
   * List files in a directory
   */
  public async listFiles(
    dirpath: string,
    options: {
      filter?: RegExp | string,
      recursive?: boolean
    } = {}
  ): Promise<string[]> {
    try {
      if (!await this.fileExists(dirpath)) {
        throw new FileSystemError(`Directory not found: ${dirpath}`, {
          dirpath,
          operation: 'listFiles'
        });
      }

      const { filter, recursive = false } = options;

      let files: string[] = [];

      if (recursive) {
        // Read directory recursively
        const allFiles = await this.listFilesRecursively(dirpath);
        files = allFiles;
      } else {
        // Read only the top level files
        const entries = await fs.readdir(dirpath, { withFileTypes: true });
        files = entries
          .filter(entry => entry.isFile())
          .map(entry => path.join(dirpath, entry.name));
      }

      // Apply filter if specified
      if (filter) {
        if (filter instanceof RegExp) {
          files = files.filter(file => filter.test(file));
        } else if (typeof filter === 'string') {
          files = files.filter(file => file.includes(filter));
        }
      }

      return files;

    } catch (error) {
      if (error instanceof FileSystemError) {
        throw error;
      }

      throw new FileSystemError(
        `Failed to list files in directory: ${dirpath}`,
        {
          dirpath,
          operation: 'listFiles',
          originalError: error instanceof Error ? error.message : String(error)
        }
      );
    }
  }

  /**
   * Helper method to recursively list files
   */
  private async listFilesRecursively(dirpath: string): Promise<string[]> {
    const entries = await fs.readdir(dirpath, { withFileTypes: true });

    const files = entries
      .filter(entry => entry.isFile())
      .map(entry => path.join(dirpath, entry.name));

    const folders = entries
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(dirpath, entry.name));

    const subFiles = await Promise.all(
      folders.map(folder => this.listFilesRecursively(folder))
    );

    return [...files, ...subFiles.flat()];
  }
}

// Singleton accessor
export function getStorageReader(): StorageReader {
  return StorageReader.getInstance();
}