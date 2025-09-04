// src/__tests__/monitoring/issue-tracker.test.ts

import { IssueTracker, initializeIssueTracker } from '../../infrastructure/logging/issue-tracker';
import { IssueDetectionConfig, ShopType } from '../../types/monitoring';

describe('IssueTracker', () => {
  let issueTracker: IssueTracker;
  
  beforeEach(() => {
    const config: IssueDetectionConfig = {
      enabled: true,
      trackingEnabled: {
        'QUANTITY_PARSE_FALLBACK': true,
        'PROMOTION_UNKNOWN': true,
        'UNIT_MAPPING_FALLBACK': true,
        'PRICE_PARSE_FALLBACK': true,
        'CATEGORY_NORMALIZATION_FALLBACK': true,
        'VALIDATION_ERROR': true,
        'TRANSFORMATION_ERROR': true,
        'PERFORMANCE_WARNING': true
      },
      severityThresholds: {
        frequencyForMedium: 3,
        frequencyForHigh: 10,
        frequencyForCritical: 20
      },
      reportingConfig: {
        generateJsonReport: true,
        generateMarkdownReport: true,
        generateTrendReport: true,
        maxIssuesInReport: 100,
        includeRawData: true
      }
    };
    
    issueTracker = initializeIssueTracker(config);
    issueTracker.clearIssues(); // Start with clean slate
  });

  describe('trackQuantityParseFallback', () => {
    it('should track quantity parsing fallbacks', () => {
      issueTracker.trackQuantityParseFallback(
        {
          processingStep: 'quantity_parsing',
          shopType: 'AH',
          productId: 'test-product-1'
        },
        '250-g',
        1,
        'stuk'
      );

      const issues = issueTracker.getIssues();
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('QUANTITY_PARSE_FALLBACK');
      expect(issues[0].shopType).toBe('AH');
      expect(issues[0].rawInput).toBe('250-g');
      expect(issues[0].fallbackValue).toEqual({ amount: 1, unit: 'stuk' });
      expect(issues[0].frequency).toBe(1);
      expect(issues[0].severity).toBe('LOW');
    });

    it('should increment frequency for duplicate issues', () => {
      const context = {
        processingStep: 'quantity_parsing',
        shopType: 'AH' as ShopType,
        productId: 'test-product-1'
      };

      // Track the same issue multiple times
      issueTracker.trackQuantityParseFallback(context, '250-g', 1, 'stuk');
      issueTracker.trackQuantityParseFallback(context, '250-g', 1, 'stuk');
      issueTracker.trackQuantityParseFallback(context, '250-g', 1, 'stuk');

      const issues = issueTracker.getIssues();
      expect(issues).toHaveLength(1);
      expect(issues[0].frequency).toBe(3);
      expect(issues[0].severity).toBe('MEDIUM'); // Should escalate to MEDIUM
    });
  });

  describe('trackUnknownPromotion', () => {
    it('should track unknown promotion mechanisms', () => {
      issueTracker.trackUnknownPromotion(
        {
          processingStep: 'promotion_parsing',
          shopType: 'JUMBO',
          productId: 'test-product-2'
        },
        '3 voor €5.50',
        2.99
      );

      const issues = issueTracker.getIssues();
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('PROMOTION_UNKNOWN');
      expect(issues[0].shopType).toBe('JUMBO');
      expect(issues[0].rawInput).toBe('3 voor €5.50');
      expect(issues[0].fallbackValue).toEqual({ type: 'UNKNOWN', effectiveUnitPrice: 2.99 });
      expect(issues[0].suggestedFix).toContain('Add promotion pattern');
    });
  });

  describe('trackUnitMappingFallback', () => {
    it('should track unit mapping fallbacks', () => {
      issueTracker.trackUnitMappingFallback(
        {
          processingStep: 'unit_normalization',
          shopType: 'ALDI',
          productId: 'test-product-3'
        },
        'grammes',
        'stuk'
      );

      const issues = issueTracker.getIssues();
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('UNIT_MAPPING_FALLBACK');
      expect(issues[0].shopType).toBe('ALDI');
      expect(issues[0].rawInput).toBe('grammes');
      expect(issues[0].fallbackValue).toBe('stuk');
    });
  });

  describe('trackPerformanceWarning', () => {
    it('should track performance warnings', () => {
      issueTracker.trackPerformanceWarning(
        {
          processingStep: 'batch_processing',
          shopType: 'PLUS',
          productId: 'N/A'
        },
        'processing_speed',
        5.2,
        10.0
      );

      const issues = issueTracker.getIssues();
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('PERFORMANCE_WARNING');
      expect(issues[0].shopType).toBe('PLUS');
      expect(issues[0].rawInput).toBe('processing_speed: 5.2');
      expect(issues[0].fallbackValue).toEqual({
        metric: 'processing_speed',
        value: 5.2,
        threshold: 10.0
      });
    });
  });

  describe('getStatistics', () => {
    it('should provide comprehensive statistics', () => {
      // Add various issues
      issueTracker.trackQuantityParseFallback(
        { processingStep: 'test', shopType: 'AH', productId: 'p1' },
        'input1', 1, 'stuk'
      );
      issueTracker.trackUnknownPromotion(
        { processingStep: 'test', shopType: 'JUMBO', productId: 'p2' },
        'promo1', 2.99
      );
      issueTracker.trackUnitMappingFallback(
        { processingStep: 'test', shopType: 'AH', productId: 'p3' },
        'unit1', 'stuk'
      );

      const stats = issueTracker.getStatistics();
      
      expect(stats.totalIssues).toBe(3);
      expect(stats.issuesByType['QUANTITY_PARSE_FALLBACK']).toBe(1);
      expect(stats.issuesByType['PROMOTION_UNKNOWN']).toBe(1);
      expect(stats.issuesByType['UNIT_MAPPING_FALLBACK']).toBe(1);
      expect(stats.issuesByShop['AH']).toBe(2);
      expect(stats.issuesByShop['JUMBO']).toBe(1);
      expect(stats.topIssues).toHaveLength(3);
    });
  });

  describe('severity escalation', () => {
    it('should escalate severity based on frequency', () => {
      const context = {
        processingStep: 'test',
        shopType: 'AH' as ShopType,
        productId: 'test-product'
      };

      // Track same issue multiple times to test severity escalation
      for (let i = 0; i < 25; i++) {
        issueTracker.trackQuantityParseFallback(context, 'test-input', 1, 'stuk');
      }

      const issues = issueTracker.getIssues();
      expect(issues).toHaveLength(1);
      expect(issues[0].frequency).toBe(25);
      expect(issues[0].severity).toBe('CRITICAL'); // Should escalate to CRITICAL
    });
  });

  describe('filtering', () => {
    beforeEach(() => {
      // Add test data
      issueTracker.trackQuantityParseFallback(
        { processingStep: 'test', shopType: 'AH', productId: 'p1' },
        'input1', 1, 'stuk'
      );
      issueTracker.trackUnknownPromotion(
        { processingStep: 'test', shopType: 'JUMBO', productId: 'p2' },
        'promo1', 2.99
      );
      
      // Add high frequency issue
      for (let i = 0; i < 15; i++) {
        issueTracker.trackUnitMappingFallback(
          { processingStep: 'test', shopType: 'ALDI', productId: 'p3' },
          'unit1', 'stuk'
        );
      }
    });

    it('should filter issues by type', () => {
      const quantityIssues = issueTracker.getIssuesBy({ type: 'QUANTITY_PARSE_FALLBACK' });
      expect(quantityIssues).toHaveLength(1);
      expect(quantityIssues[0].type).toBe('QUANTITY_PARSE_FALLBACK');
    });

    it('should filter issues by shop', () => {
      const ahIssues = issueTracker.getIssuesBy({ shopType: 'AH' });
      expect(ahIssues).toHaveLength(1);
      expect(ahIssues[0].shopType).toBe('AH');
    });

    it('should filter issues by severity', () => {
      const highSeverityIssues = issueTracker.getIssuesBy({ severity: 'HIGH' });
      expect(highSeverityIssues).toHaveLength(1);
      expect(highSeverityIssues[0].severity).toBe('HIGH');
    });

    it('should filter issues by minimum frequency', () => {
      const frequentIssues = issueTracker.getIssuesBy({ minFrequency: 10 });
      expect(frequentIssues).toHaveLength(1);
      expect(frequentIssues[0].frequency).toBeGreaterThanOrEqual(10);
    });
  });
});
