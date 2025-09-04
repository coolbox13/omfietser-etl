// src/processors/index.ts
import { AHProcessor } from './ah';
import { JumboProcessor } from './jumbo';
import { AldiProcessor } from './aldi';
import { PlusProcessor } from './plus';
import { BaseProcessor, BaseProcessorConfig } from './base';

// Export main processor classes
export {
  AHProcessor,
  JumboProcessor,
  AldiProcessor,
  PlusProcessor,
  BaseProcessor
};

// Export types
export type { BaseProcessorConfig };

// Factory function to create a processor for a specific shop
export function createProcessor(shop: string, config: BaseProcessorConfig): BaseProcessor<any> {
  switch (shop.toLowerCase()) {
    case 'ah':
      return new AHProcessor(config);
    case 'jumbo':
      return new JumboProcessor(config);
    case 'aldi':
      return new AldiProcessor(config);
    case 'plus':
      return new PlusProcessor(config);
    default:
      throw new Error(`Unsupported shop type: ${shop}`);
  }
}

// Export standalone functions for testing
export { shouldSkipProduct as shouldSkipAHProduct, transformAHProduct } from './ah';
export { shouldSkipProduct as shouldSkipJumboProduct, transformJumboProduct } from './jumbo';
export { shouldSkipProduct as shouldSkipAldiProduct, transformAldiProduct } from './aldi';
export { shouldSkipProduct as shouldSkipPlusProduct, transformPlusProduct } from './plus';