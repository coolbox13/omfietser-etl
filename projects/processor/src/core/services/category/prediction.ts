// src/core/services/category/prediction.ts
import fs from 'fs-extra';
import path from 'path';
import { getLogger } from '../../../infrastructure/logging';

export interface CategoryPrediction {
  category: string;
  confidence: number;
  all_probabilities?: Record<string, number>;
}

/**
 * Service for handling ML-based category predictions
 */
export class MLPredictionService {
  private static instance: MLPredictionService | null = null;
  private predictions: Record<string, CategoryPrediction> = {};
  private loaded: boolean = false;

  // Lazy-loaded logger to avoid initialization issues
  private get logger() {
    return getLogger();
  }

  private constructor() {
    // Don't auto-load predictions in constructor to avoid early logger calls
    // Predictions will be loaded lazily when first needed
  }

  public static getInstance(): MLPredictionService {
    if (!MLPredictionService.instance) {
      MLPredictionService.instance = new MLPredictionService();
    }
    return MLPredictionService.instance;
  }

  /**
   * Load ML predictions from the predictions file
   */
  private async loadPredictions(): Promise<void> {
    try {
      const predictionsPath = path.join(process.cwd(), 'processed_data', 'ml_predictions.json');

      if (fs.existsSync(predictionsPath)) {
        try {
          this.predictions = await fs.readJson(predictionsPath);
          this.loaded = true;
          this.logger.info(`Loaded ${Object.keys(this.predictions).length} ML predictions`);
        } catch (err) {
          this.logger.error('Failed to parse ML predictions file', {
            context: {
              error: err instanceof Error ? err.message : 'Unknown error'
            }
          });
        }
      } else {
        this.logger.warn('ML predictions file not found', { context: { path: predictionsPath } });
      }
    } catch (error) {
      this.logger.error('Failed to load ML predictions', {
        context: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }

  /**
   * Get a prediction for a given product title
   * @param title The product title to get a prediction for
   * @param confidenceThreshold The minimum confidence threshold (default: 0.65)
   * @returns The prediction if one exists with sufficient confidence, or null
   */
  public getPrediction(title: string, confidenceThreshold: number = 0.65): CategoryPrediction | null {
    // Lazy load predictions if not already loaded and not in test environment
    if (!this.loaded && process.env.NODE_ENV !== 'test') {
      this.loadPredictions(); // Fire and forget - async loading
    }

    if (!title || !this.loaded) return null;

    const prediction = this.predictions[title];
    if (prediction && prediction.confidence >= confidenceThreshold) {
      return prediction;
    }
    return null;
  }

  /**
   * Check if a prediction exists for a title
   * @param title The product title
   * @returns True if a prediction exists, false otherwise
   */
  public hasPredictionForTitle(title: string): boolean {
    return Boolean(this.predictions[title]);
  }

  /**
   * Get all available prediction titles
   * @returns A set of all titles that have predictions
   */
  public getAvailableTitles(): Set<string> {
    return new Set(Object.keys(this.predictions));
  }

  /**
   * Get the count of loaded predictions
   * @returns The number of loaded predictions
   */
  public getPredictionsCount(): number {
    return Object.keys(this.predictions).length;
  }

  /**
   * Check if predictions are loaded
   * @returns True if predictions are loaded, false otherwise
   */
  public isLoaded(): boolean {
    return this.loaded && Object.keys(this.predictions).length > 0;
  }

  /**
   * Clean up resources and reset the singleton instance
   * Used primarily for testing to prevent memory leaks
   */
  public static cleanup(): void {
    if (MLPredictionService.instance) {
      MLPredictionService.instance.predictions = {};
      MLPredictionService.instance.loaded = false;
      MLPredictionService.instance = null;
    }
  }

  /**
   * Generate predictions for a list of product titles
   * @param titles List of product titles to generate predictions for
   * @returns Promise that resolves when predictions are generated
   */
  public async generatePredictions(titles: string[]): Promise<void> {
    const inputFile = path.join(process.cwd(), 'processed_data', 'temp', 'titles_for_prediction.json');
    const outputFile = path.join(process.cwd(), 'processed_data', 'ml_predictions.json');

    // Ensure the temp directory exists
    await fs.ensureDir(path.dirname(inputFile));

    // Save titles to temporary file
    await fs.writeJson(inputFile, titles);

    try {
      // Launch the Python script that will generate predictions
      const { spawn } = require('child_process');
      const pythonScript = path.join(process.cwd(), 'src', 'scripts', 'ml', 'batch_categorize.py');

      this.logger.info(`Generating predictions using ${pythonScript}`);

      return new Promise<void>((resolve, reject) => {
        const process = spawn('python', [pythonScript, inputFile, outputFile]);

        process.stdout.on('data', (data: Buffer) => {
          this.logger.info(`ML Process: ${data.toString()}`);
        });

        process.stderr.on('data', (data: Buffer) => {
          this.logger.warn(`ML Process Error: ${data.toString()}`);
        });

        process.on('close', (code: number) => {
          if (code === 0) {
            this.logger.info('Successfully generated predictions');
            // Reload predictions
            this.loadPredictions().then(() => resolve());
          } else {
            this.logger.error(`ML prediction script failed with code ${code}`);
            reject(new Error(`Prediction script failed with code ${code}`));
          }
        });
      });
    } catch (error) {
      this.logger.error('Failed to generate predictions', {
        context: {
          error: error instanceof Error ? error.message : 'Unknown error',
          inputFile,
          outputFile
        }
      });
      throw error;
    }
  }
}

/**
 * Get the singleton instance of the MLPredictionService
 */
export const getMlPredictionService = (): MLPredictionService => {
  return MLPredictionService.getInstance();
};