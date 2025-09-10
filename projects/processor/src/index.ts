// src/index.ts
import dotenv from 'dotenv';
import { createConfig } from './config';

// Load environment variables from .env file
dotenv.config();
import { initializeLogger, getLogger } from './infrastructure/logging';
import { setupGlobalErrorHandlers, serializeError } from './utils/error';
import { AHProcessor } from './processors/ah';
import { JumboProcessor } from './processors/jumbo';
import { AldiProcessor } from './processors/aldi';
import { PlusProcessor } from './processors/plus';
import { createProcessor } from './processors';
import { initializeIssueTracker } from './infrastructure/logging/issue-tracker';
import { initializeProgressTracker } from './infrastructure/monitoring/progress-tracker';
import { initializeCLIDashboard, getCLIDashboard } from './infrastructure/monitoring/cli-dashboard';
import { getIssueReporter } from './core/services/monitoring/issue-reporter';
import { IssueDetectionConfig } from './types/monitoring';
import { MLFallbackTracker } from './core/services/category/ml-fallback-tracker';
import path from 'path';
import fs from 'fs-extra';
import { program } from 'commander';

/**
 * Determine which processors will run based on available input files
 */
async function getActiveProcessors(config: any): Promise<string[]> {
  const activeProcessors: string[] = [];

  for (const [shopName, shopConfig] of Object.entries(config.shops)) {
    const inputFile = path.join(config.directories.input, (shopConfig as any).inputFile);

    try {
      if (await fs.pathExists(inputFile)) {
        const stats = await fs.stat(inputFile);
        // Only include if file exists and has non-trivial content (>2 bytes avoids "[]")
        if (stats.size > 2) {
          activeProcessors.push(shopName.toUpperCase());
        }
      }
    } catch (error) {
      // Skip processors with missing or inaccessible input files
      console.log(`   Skipping ${shopName.toUpperCase()}: input file not accessible - ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return activeProcessors;
}

/**
 * Clean up old logs and reports for specific processors
 */
async function cleanupProcessorLogs(config: any, processors: string[]): Promise<void> {
  try {
    const retentionDays = config.logging.retentionDays || 7; // Keep logs for configured days
    const now = new Date().getTime();
    const cutoffTime = now - (retentionDays * 24 * 60 * 60 * 1000);

    console.log(`🧹 Cleaning up old logs for processors: ${processors.join(', ')}`);

    // 1. Clean up old processing summary reports
    await cleanupOldReports(config.directories.logs, cutoffTime);

    // 2. Clean up processor-specific quality reports
    for (const processor of processors) {
      const qualityReportPath = path.join(config.directories.intermediate, `quality-report-${processor.toLowerCase()}.md`);
      if (await fs.pathExists(qualityReportPath)) {
        await fs.remove(qualityReportPath);
        console.log(`   Removed old quality report: quality-report-${processor.toLowerCase()}.md`);
      }
    }

    // 3. Clean up old issue reports (they'll be regenerated)
    const issueReports = [
      'processing-issues-report.json',
      'edge-cases-detected.md'
    ];

    for (const reportFile of issueReports) {
      const reportPath = path.join(config.directories.intermediate, reportFile);
      if (await fs.pathExists(reportPath)) {
        await fs.remove(reportPath);
        console.log(`   Removed old issue report: ${reportFile}`);
      }
    }

    // 4. Clean up old backup files
    const backupDir = path.join(config.directories.intermediate, 'backups');
    if (await fs.pathExists(backupDir)) {
      await cleanupOldFiles(backupDir, cutoffTime);
    }

    // 5. Clean up old temp files
    const tempDir = path.join(config.directories.intermediate, 'temp');
    if (await fs.pathExists(tempDir)) {
      await cleanupOldFiles(tempDir, cutoffTime);
    }

    console.log(`✅ Log cleanup completed`);

  } catch (error) {
    console.warn(`⚠️  Warning: Failed to clean up old logs:`, error);
    // Don't throw - cleanup failures shouldn't stop the main process
  }
}

/**
 * Clean up old processing summary reports
 */
async function cleanupOldReports(logsDir: string, cutoffTime: number): Promise<void> {
  try {
    const files = await fs.readdir(logsDir);
    const reportFiles = files.filter(file => file.startsWith('processing-summary-') && file.endsWith('.json'));

    for (const file of reportFiles) {
      const filePath = path.join(logsDir, file);
      const stats = await fs.stat(filePath);

      if (stats.mtime.getTime() < cutoffTime) {
        await fs.remove(filePath);
        console.log(`   Removed old processing report: ${file}`);
      }
    }
  } catch (error) {
    console.warn(`   Warning: Failed to clean up reports in ${logsDir}:`, error);
  }
}

/**
 * Clean up old files in a directory
 */
async function cleanupOldFiles(directory: string, cutoffTime: number): Promise<void> {
  try {
    const files = await fs.readdir(directory);

    for (const file of files) {
      const filePath = path.join(directory, file);
      const stats = await fs.stat(filePath);

      if (stats.mtime.getTime() < cutoffTime) {
        await fs.remove(filePath);
        console.log(`   Removed old file: ${path.relative(process.cwd(), filePath)}`);
      }
    }
  } catch (error) {
    console.warn(`   Warning: Failed to clean up files in ${directory}:`, error);
  }
}

async function main() {
  const startTime = Date.now();
  console.log(`🚀 Starting product processor at ${new Date().toISOString()}`);
  
  try {
    // Setup global error handlers first
    console.log('📝 Setting up global error handlers...');
    setupGlobalErrorHandlers();

    // Load configuration
    console.log('⚙️  Loading configuration...');
    const config = await createConfig();
    console.log(`✅ Configuration loaded - processing enabled: ${config.processing.parallelProcessing ? 'parallel' : 'sequential'}, batch size: ${config.processing.batchSize}`);

    // Initialize logger
    console.log('🔍 Initializing logging system...');
    initializeLogger({
      logDir: config.directories.logs,
      level: config.logging.level as any,
      consoleOutput: config.logging.consoleOutput,
      fileOutput: config.logging.fileOutput,
      applicationName: 'product-processor'
    });

    const logger = getLogger();
    console.log(`✅ Logging system initialized - level: ${config.logging.level}, file output: ${config.logging.fileOutput}`);

    // Clean up old logs and reports for processors that will run (if enabled)
    if (config.logging.cleanupOnStartup) {
      const activeProcessors = await getActiveProcessors(config);
      if (activeProcessors.length > 0) {
        await cleanupProcessorLogs(config, activeProcessors);
      }
    }

    // CLI options: allow selecting specific shops to process
    program
      .name('product-processor')
      .description('Process supermarket product data')
      .option('-s, --shop <shops>', 'Comma-separated list of shops to process (ah,jumbo,aldi,plus)');
    program.parse(process.argv);
    const options = program.opts();
    const requestedShops: string[] | null = options.shop
      ? String(options.shop)
          .split(',')
          .map((s: string) => s.trim().toLowerCase())
          .filter((s: string) => !!s)
      : null;

    // Initialize monitoring systems
    const issueDetectionConfig: IssueDetectionConfig = {
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
        frequencyForMedium: 5,
        frequencyForHigh: 20,
        frequencyForCritical: 50
      },
      reportingConfig: {
        generateJsonReport: true,
        generateMarkdownReport: true,
        generateTrendReport: true,
        maxIssuesInReport: 100,
        includeRawData: true
      }
    };

    initializeIssueTracker(issueDetectionConfig);
    initializeProgressTracker();
    const dashboard = initializeCLIDashboard({
      refreshInterval: 1000,
      showMemoryUsage: true,
      showProcessingSpeed: true,
      showIssueCount: true,
      showProgressBars: true,
      compactMode: false,
      colorOutput: true
    });

    logger.info('Product processor starting', {
      context: {
        version: process.env.npm_package_version || '1.0.0',
        nodeEnv: process.env.NODE_ENV || 'development',
        configSettings: {
          parallelProcessing: config.processing.parallelProcessing,
          batchSize: config.processing.batchSize,
          mlEnabled: config.ml.enablePredictions
        }
      }
    });

    // Build processors for shops that are requested and have available input files
    const configuredShops = ['ah', 'jumbo', 'aldi', 'plus'];
    const shopsToConsider = requestedShops ? requestedShops : configuredShops;
    const processorEntries: Array<{ shop: string; processor: any }> = [];

    for (const shop of shopsToConsider) {
      const shopConfig = (config.shops as any)[shop];
      if (!shopConfig) {
        logger.warn(`Unknown shop specified, skipping: ${shop}`);
        continue;
      }

      const inputPath = path.join(config.directories.input, shopConfig.inputFile);
      let hasUsableInput = false;
      try {
        if (await fs.pathExists(inputPath)) {
          const stats = await fs.stat(inputPath);
          hasUsableInput = stats.size > 2; // avoid empty / [] files
        }
      } catch {
        hasUsableInput = false;
      }

      if (!hasUsableInput) {
        logger.info(`Skipping ${shop.toUpperCase()}: input file missing or empty (${inputPath})`);
        continue;
      }

      const baseConfig = {
        inputDir: config.directories.input,
        outputDir: config.directories.output,
        inputFile: shopConfig.inputFile,
        batchSize: config.processing.batchSize,
        parallelProcessing: config.processing.parallelProcessing
      };

      switch (shop) {
        case 'ah':
          processorEntries.push({ shop, processor: new AHProcessor(baseConfig) });
          break;
        case 'jumbo':
          processorEntries.push({ shop, processor: new JumboProcessor(baseConfig) });
          break;
        case 'aldi':
          processorEntries.push({ shop, processor: new AldiProcessor(baseConfig) });
          break;
        case 'plus':
          processorEntries.push({ shop, processor: new PlusProcessor(baseConfig) });
          break;
      }
    }

    if (processorEntries.length === 0) {
      logger.warn('No shops to process: no valid input files found for requested selection');
      return {
        success: 0,
        failed: 0,
        skipped: 0,
        deduped: 0
      } as any;
    }

    // Start the dashboard
    dashboard.start();

    // Start selected processors in parallel
    const processingStartTime = Date.now();
    console.log(`🏭 Starting product processing for ${processorEntries.length} shops: ${processorEntries.map(e => e.shop.toUpperCase()).join(', ')}`);
    
    logger.info(`Starting product processing for shops: ${processorEntries.map(e => e.shop).join(', ')}`, {
      context: {
        shopsToProcess: processorEntries.map(e => e.shop),
        processingMode: config.processing.parallelProcessing ? 'parallel' : 'sequential',
        batchSize: config.processing.batchSize,
        totalStartTime: Date.now()
      }
    });

    logger.debug('Launching processor promises...');
    const settled = await Promise.allSettled(
      processorEntries.map((e, index) => {
        logger.debug(`Starting ${e.shop} processor (${index + 1}/${processorEntries.length})`);
        return e.processor.process().then((result: any) => {
          logger.info(`${e.shop} processor completed`, {
            context: {
              shop: e.shop,
              results: {
                success: result.success,
                failed: result.failed,
                skipped: result.skipped,
                deduped: result.deduped
              }
            }
          });
          return result;
        }).catch((error: any) => {
          logger.error(`${e.shop} processor failed`, {
            context: {
              shop: e.shop,
              error: serializeError(error)
            }
          });
          throw error;
        });
      })
    );
    
    console.log('✅ All processors completed');

    // Stop the dashboard
    dashboard.stop();

    // Compile overall results
    const totalProcessingTime = Date.now() - processingStartTime;
    const totalApplicationTime = Date.now() - startTime;
    
    const totalResults = {
      success: settled.reduce((sum, s: any) => sum + (s.status === 'fulfilled' ? (s.value?.success || 0) : 0), 0),
      failed: settled.reduce((sum, s: any) => sum + (s.status === 'fulfilled' ? (s.value?.failed || 0) : 0), 0),
      skipped: settled.reduce((sum, s: any) => sum + (s.status === 'fulfilled' ? (s.value?.skipped || 0) : 0), 0),
      deduped: settled.reduce((sum, s: any) => sum + (s.status === 'fulfilled' ? (s.value?.deduped || 0) : 0), 0),
      duration: totalProcessingTime,
      totalApplicationDuration: totalApplicationTime
    };
    
    // Log processing completion with detailed breakdown
    const successfulShops = settled.filter(s => s.status === 'fulfilled').length;
    const failedShops = settled.filter(s => s.status === 'rejected').length;
    
    console.log(`📊 Processing completed: ${successfulShops}/${processorEntries.length} shops successful`);
    console.log(`   Total processed: ${totalResults.success + totalResults.failed + totalResults.skipped}`);
    console.log(`   Success: ${totalResults.success}, Failed: ${totalResults.failed}, Skipped: ${totalResults.skipped}, Deduped: ${totalResults.deduped}`);
    console.log(`   Processing time: ${(totalProcessingTime / 1000).toFixed(2)}s, Total time: ${(totalApplicationTime / 1000).toFixed(2)}s`);
    
    if (failedShops > 0) {
      console.log(`❌ Failed shops:`);
      settled.forEach((s, index) => {
        if (s.status === 'rejected') {
          const shopName = processorEntries[index].shop;
          console.log(`   ${shopName.toUpperCase()}: ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`);
        }
      });
    }

    // Generate overall summary report
    const summaryReport = {
      timestamp: new Date().toISOString(),
      duration: `${(totalResults.duration / 1000).toFixed(2)} seconds`,
      totalProducts: totalResults.success + totalResults.failed + totalResults.skipped,
      results: totalResults,
      shopResults: processorEntries.reduce((acc: any, entry, index) => {
        const s = settled[index] as any;
        if (s.status === 'fulfilled') {
          acc[entry.shop] = s.value;
        } else {
          acc[entry.shop] = { error: 'Processing failed' };
        }
        return acc;
      }, {})
    };

    // Write summary report
    const reportPath = await logger.writeReport('processing-summary', summaryReport);

    // Generate issue reports
    try {
      const issueReporter = getIssueReporter();
      await issueReporter.generateReports(config.directories.intermediate, {
        includeRawData: true,
        maxExamples: 50,
        groupBySeverity: true,
        groupByShop: true,
        includeTrends: false,
        includeFixSuggestions: true,
        outputFormat: 'BOTH'
      });

      logger.info('Issue reports generated successfully');
    } catch (error) {
      logger.warn('Failed to generate issue reports', { context: { error: serializeError(error) } });
    }

    // Generate ML fallback analysis report
    try {
      const mlFallbackTracker = MLFallbackTracker.getInstance();
      const fallbackCount = mlFallbackTracker.getFallbackCount();

      if (fallbackCount > 0) {
        // Save detailed JSON report
        const reportPath = await mlFallbackTracker.saveSummaryReport();

        // Display formatted report in console
        const formattedReport = mlFallbackTracker.generateFormattedReport();
        console.log(formattedReport);

        logger.info('ML fallback analysis completed', {
          context: {
            totalFallbacks: fallbackCount,
            reportPath
          }
        });
      } else {
        console.log('\n✅ Perfect! No ML fallbacks occurred - all categories mapped directly!\n');
        logger.info('ML fallback analysis: No fallbacks detected');
      }
    } catch (error) {
      logger.warn('Failed to generate ML fallback analysis', { context: { error: serializeError(error) } });
    }

    logger.info('Product processing completed', {
      context: {
        results: totalResults,
        reportPath,
        timing: {
          processingDuration: `${(totalResults.duration / 1000).toFixed(2)} seconds`,
          totalApplicationDuration: `${(totalApplicationTime / 1000).toFixed(2)} seconds`,
          setupTime: `${((processingStartTime - startTime) / 1000).toFixed(2)} seconds`
        },
        shopResults: {
          successful: successfulShops,
          failed: failedShops,
          total: processorEntries.length
        }
      }
    });
    
    console.log(`🎉 Application completed successfully at ${new Date().toISOString()}`);

    // Display completion summary
    console.log('\n'); // Add some space
    dashboard.displayCompletionSummary();

    return totalResults;
  } catch (error) {
    const errorTime = Date.now();
    const elapsedTime = errorTime - startTime;
    console.error(`💥 Fatal error after ${(elapsedTime / 1000).toFixed(2)}s at ${new Date().toISOString()}`);
    // If logger isn't initialized yet, log to console
    const serializedError = serializeError(error);
    if (!getLogger) {
      console.error('Fatal error during startup:', {
        error: serializedError,
        stack: serializedError.stack,
        timestamp: new Date().toISOString(),
        elapsedTime: `${(elapsedTime / 1000).toFixed(2)}s`
      });
    } else {
      getLogger().critical('Fatal error during execution', error, {
        timestamp: new Date().toISOString(),
        elapsedTime: `${(elapsedTime / 1000).toFixed(2)}s`,
        processInfo: {
          nodeVersion: process.version,
          platform: process.platform,
          memoryUsage: process.memoryUsage()
        }
      });
    }

    process.exit(1);
  }
}

/**
 * Clean up resources before exit
 */
async function cleanupResources(): Promise<void> {
  try {
    // Clean up singletons
    const { cleanupLogger } = await import('./infrastructure/logging/logger');
    const { CategoryNormalizer } = await import('./core/services/category/normalizer');
    const { MLPredictionService } = await import('./core/services/category/prediction');
    const { MLFallbackTracker } = await import('./core/services/category/ml-fallback-tracker');

    cleanupLogger();
    CategoryNormalizer.cleanup();
    MLPredictionService.cleanup();
    MLFallbackTracker.cleanup();
  } catch (error) {
    // Ignore cleanup errors during shutdown
    console.warn('Warning: Error during resource cleanup:', error);
  }
}

// Run if this script is called directly
if (require.main === module) {
  main()
    .then(async results => {
      console.log(`✨ Processing completed successfully - total processed: ${results.success + results.failed + results.skipped}`);
      
      // Brief pause for summary to be visible
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Clean up resources
      console.log('🧹 Cleaning up resources...');
      await cleanupResources();
      console.log('👋 Goodbye!');

      // Normal exit
      process.exit(0);
    })
    .catch(async error => {
      console.error('💀 Application failed - cleaning up and exiting...');
      
      // Wait a moment for error messages to be visible
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Clean up resources
      try {
        await cleanupResources();
      } catch (cleanupError) {
        console.warn('Warning: Cleanup failed:', cleanupError);
      }

      // Error already logged in main function
      process.exit(1);
    });
}

// Export for modular usage
export { main };