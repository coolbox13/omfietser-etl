import fs from 'fs-extra';
import path from 'path';
import { getLogger } from '../infrastructure/logging';

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
  private readonly logger = getLogger();
  private predictions: Record<string, CategoryPrediction> = {};
  private loaded: boolean = false;

  private constructor() {
    this.loadPredictions();
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
            error: err instanceof Error ? err.message : 'Unknown error'
          });
        }
      } else {
        this.logger.warn('ML predictions file not found', { path: predictionsPath });
      }
    } catch (error) {
      this.logger.error('Failed to load ML predictions', {
        error: error instanceof Error ? error.message : 'Unknown error'
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

// Export the function to get the MLPredictionService instance
export const getMlPredictionService = (): MLPredictionService => {
  return MLPredictionService.getInstance();
};