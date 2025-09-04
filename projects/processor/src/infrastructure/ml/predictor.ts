// src/infrastructure/ml/predictor.ts
import fs from 'fs-extra';
import path from 'path';
import { getLogger } from '../logging';

export interface CategoryPrediction {
  category: string;
  confidence: number;
  all_probabilities?: Record<string, number>;
}

/**
 * Service for handling ML-based category predictions
 */
export class MLPredictor {
  private static instance: MLPredictor | null = null;
  private predictions: Record<string, CategoryPrediction> = {};
  private loaded: boolean = false;

  // Lazy-loaded logger to avoid initialization issues
  private get logger() {
    return getLogger();
  }

  private constructor() {
    this.loadPredictions();
  }

  public static getInstance(): MLPredictor {
    if (!MLPredictor.instance) {
      MLPredictor.instance = new MLPredictor();
    }
    return MLPredictor.instance;
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
}

// Export accessor function
export const getMlPredictor = (): MLPredictor => {
  return MLPredictor.getInstance();
};