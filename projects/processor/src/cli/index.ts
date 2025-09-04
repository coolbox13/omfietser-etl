// CLI interface for Supermarket Processor
import { Command } from 'commander';
import { initializeLogger, getLogger } from '../infrastructure/logging';
import { initializeDatabaseAdapter, closeDatabaseAdapter } from '../infrastructure/database';
import { initializeJobManager, getJobManager } from '../api/services/job-manager';
import { setupGlobalErrorHandlers } from '../utils/error';
import { createConfig } from '../config';

const program = new Command();

async function initializeCLI() {
  // Setup global error handlers
  setupGlobalErrorHandlers();

  // Load configuration
  const config = await createConfig();

  // Initialize logger
  initializeLogger({
    logDir: config.directories.logs,
    level: config.logging.level as any,
    consoleOutput: true, // Always enable console output for CLI
    fileOutput: config.logging.fileOutput,
    applicationName: 'supermarket-processor-cli'
  });

  const logger = getLogger();
  logger.info('CLI initialized successfully');

  return { config, logger };
}

async function processCommand(shopType: string, jobId?: string, batchSize?: number) {
  const { logger } = await initializeCLI();
  
  try {
    // Initialize database adapter
    await initializeDatabaseAdapter();
    logger.info('Database connection initialized');

    // Initialize job manager
    const jobManager = await initializeJobManager();
    logger.info('Job manager initialized');

    let job;
    
    if (jobId) {
      // Process existing job
      logger.info(`Processing existing job: ${jobId}`);
      
      const existingJob = await jobManager.getJobById(jobId);
      if (!existingJob) {
        throw new Error(`Job not found: ${jobId}`);
      }
      
      if (existingJob.status !== 'pending') {
        throw new Error(`Job ${jobId} is not in pending status (current: ${existingJob.status})`);
      }
      
      await jobManager.startJob(jobId);
      job = existingJob;
      
    } else {
      // Create and process new job
      logger.info(`Creating new job for shop type: ${shopType}`);
      
      job = await jobManager.createJob({
        shop_type: shopType,
        batch_size: batchSize,
        metadata: {
          triggered_by: 'cli',
          timestamp: new Date().toISOString()
        }
      });
      
      logger.info(`Job created with ID: ${job.job_id}`);
      
      // Start the job
      await jobManager.startJob(job.job_id);
    }

    // Monitor job progress
    const monitoringPromise = monitorJobProgress(job.job_id);

    // Wait for job completion or failure
    await monitoringPromise;

    logger.info('Processing completed successfully');

  } catch (error) {
    logger.critical('CLI processing failed', error);
    throw error;
  } finally {
    // Clean up
    await closeDatabaseAdapter();
  }
}

async function monitorJobProgress(jobId: string): Promise<void> {
  const logger = getLogger();
  const jobManager = getJobManager();

  let lastProgress = 0;
  let isJobComplete = false;

  // Set up event listeners
  jobManager.on('job:progress', (progress) => {
    if (progress.job_id === jobId) {
      const percentage = Math.round(progress.progress_percentage);
      if (percentage > lastProgress) {
        logger.info(`Job progress: ${percentage}% (${progress.processed_count}/${progress.total_products} products)`);
        lastProgress = percentage;
      }
    }
  });

  jobManager.on('job:completed', (result) => {
    if (result.job_id === jobId) {
      logger.info('Job completed successfully', {
        context: {
          totalProcessed: result.total_processed,
          successCount: result.success_count,
          failedCount: result.failed_count,
          skippedCount: result.skipped_count,
          dedupedCount: result.deduped_count,
          duration: `${(result.duration_ms / 1000).toFixed(2)}s`
        }
      });
      isJobComplete = true;
    }
  });

  jobManager.on('job:failed', (job, error) => {
    if (job.job_id === jobId) {
      logger.critical('Job failed', error);
      isJobComplete = true;
      throw error;
    }
  });

  jobManager.on('job:cancelled', (job) => {
    if (job.job_id === jobId) {
      logger.warn('Job was cancelled');
      isJobComplete = true;
    }
  });

  // Wait for job completion
  while (!isJobComplete) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second

    // Check if job is still running
    const currentJob = await jobManager.getJobById(jobId);
    if (!currentJob) {
      throw new Error(`Job ${jobId} not found during monitoring`);
    }

    if (currentJob.status === 'completed' || currentJob.status === 'failed' || currentJob.status === 'cancelled') {
      isJobComplete = true;
      
      if (currentJob.status === 'failed') {
        throw new Error(`Job failed: ${currentJob.error_message || 'Unknown error'}`);
      }
    }
  }
}

async function statusCommand(jobId?: string) {
  const { logger } = await initializeCLI();
  
  try {
    await initializeDatabaseAdapter();
    const jobManager = await initializeJobManager();

    if (jobId) {
      // Show specific job status
      const job = await jobManager.getJobById(jobId);
      if (!job) {
        logger.error(`Job not found: ${jobId}`);
        return;
      }

      const progress = await jobManager.getJobProgress(jobId);
      
      console.log('\nJob Status:');
      console.log(`  ID: ${job.job_id}`);
      console.log(`  Shop Type: ${job.shop_type}`);
      console.log(`  Status: ${job.status}`);
      console.log(`  Created: ${job.created_at?.toISOString()}`);
      if (job.started_at) console.log(`  Started: ${job.started_at.toISOString()}`);
      if (job.completed_at) console.log(`  Completed: ${job.completed_at.toISOString()}`);
      
      if (progress) {
        console.log(`  Progress: ${progress.progress_percentage.toFixed(1)}%`);
        console.log(`  Processed: ${progress.processed_count}/${progress.total_products}`);
        console.log(`  Success: ${progress.success_count}`);
        console.log(`  Failed: ${progress.failed_count}`);
        console.log(`  Skipped: ${progress.skipped_count}`);
      }
      
      if (job.error_message) {
        console.log(`  Error: ${job.error_message}`);
      }
      
    } else {
      // Show active jobs
      const activeJobs = await jobManager.getActiveJobs();
      
      if (activeJobs.length === 0) {
        console.log('No active jobs');
      } else {
        console.log('\nActive Jobs:');
        for (const job of activeJobs) {
          const progress = await jobManager.getJobProgress(job.job_id);
          console.log(`  ${job.job_id} | ${job.shop_type} | ${job.status} | ${progress ? progress.progress_percentage.toFixed(1) : '0'}%`);
        }
      }
    }

  } catch (error) {
    logger.critical('Status command failed', error);
    throw error;
  } finally {
    await closeDatabaseAdapter();
  }
}

async function cancelCommand(jobId: string, reason?: string) {
  const { logger } = await initializeCLI();
  
  try {
    await initializeDatabaseAdapter();
    const jobManager = await initializeJobManager();

    await jobManager.cancelJob(jobId, reason || 'Cancelled via CLI');
    logger.info(`Job ${jobId} cancelled successfully`);

  } catch (error) {
    logger.critical('Cancel command failed', error);
    throw error;
  } finally {
    await closeDatabaseAdapter();
  }
}

async function statsCommand() {
  const { logger } = await initializeCLI();
  
  try {
    await initializeDatabaseAdapter();
    const jobManager = await initializeJobManager();

    const stats = await jobManager.getJobStatistics();
    const instanceStats = jobManager.getInstanceStats();

    console.log('\nProcessor Statistics:');
    console.log(`  Active Jobs: ${instanceStats.activeJobs}`);
    console.log(`  Active Timers: ${instanceStats.activeTimers}`);
    
    // Group stats by shop type and status
    const statsByShop = new Map<string, any>();
    const statsByStatus = new Map<string, number>();
    
    for (const stat of stats) {
      if (!statsByShop.has(stat.shop_type)) {
        statsByShop.set(stat.shop_type, { total: 0, completed: 0, failed: 0, running: 0 });
      }
      
      const shopStats = statsByShop.get(stat.shop_type)!;
      shopStats.total++;
      
      if (stat.status) {
        shopStats[stat.status] = (shopStats[stat.status] || 0) + 1;
        statsByStatus.set(stat.status, (statsByStatus.get(stat.status) || 0) + 1);
      }
    }

    console.log('\nJobs by Shop Type:');
    for (const [shopType, shopStats] of statsByShop.entries()) {
      console.log(`  ${shopType.toUpperCase()}: ${shopStats.total} total (${shopStats.completed || 0} completed, ${shopStats.failed || 0} failed, ${shopStats.running || 0} running)`);
    }

    console.log('\nJobs by Status:');
    for (const [status, count] of statsByStatus.entries()) {
      console.log(`  ${status}: ${count}`);
    }

  } catch (error) {
    logger.critical('Stats command failed', error);
    throw error;
  } finally {
    await closeDatabaseAdapter();
  }
}

// Configure CLI commands
program
  .name('supermarket-processor')
  .description('Supermarket Processor CLI for debugging and manual execution')
  .version(process.env.npm_package_version || '1.0.0');

program
  .command('process')
  .description('Process products for a specific shop type')
  .requiredOption('-s, --shop-type <type>', 'Shop type to process (ah, jumbo, aldi, plus)')
  .option('-j, --job-id <id>', 'Process existing job by ID')
  .option('-b, --batch-size <size>', 'Batch size for processing', '100')
  .action(async (options) => {
    try {
      const batchSize = parseInt(options.batchSize);
      await processCommand(options.shopType, options.jobId, batchSize);
    } catch (error) {
      console.error('Processing failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show job status')
  .option('-j, --job-id <id>', 'Show status for specific job')
  .action(async (options) => {
    try {
      await statusCommand(options.jobId);
    } catch (error) {
      console.error('Status command failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('cancel')
  .description('Cancel a running job')
  .requiredOption('-j, --job-id <id>', 'Job ID to cancel')
  .option('-r, --reason <reason>', 'Reason for cancellation')
  .action(async (options) => {
    try {
      await cancelCommand(options.jobId, options.reason);
    } catch (error) {
      console.error('Cancel command failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('stats')
  .description('Show processor statistics')
  .action(async () => {
    try {
      await statsCommand();
    } catch (error) {
      console.error('Stats command failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Parse command line arguments
if (require.main === module) {
  program.parse();
}

export { program };