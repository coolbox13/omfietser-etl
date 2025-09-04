#!/usr/bin/env python3
"""
Jumbo Scraper Wrapper - Infrastructure Integration
Minimal wrapper to integrate existing jumbo_scraper.py with the infrastructure
WITHOUT modifying the core scraping logic
"""

import json
import sys
import os
import argparse
import logging
from pathlib import Path

# Add current directory to Python path for imports
sys.path.insert(0, '/app')

# Set up compatibility for the original scraper's imports
# The original scraper expects these modules to be available
sys.path.append('/app')

# Mock the external imports that the original scraper expects
# We'll use our own progress_monitor and config_utils
try:
    from progress_monitor import update_status, update_progress, ScraperStatus, get_amsterdam_time
    from config_utils import get_output_directory
except ImportError:
    # If imports fail, provide minimal compatibility
    from datetime import datetime
    import pytz
    
    class ScraperStatus:
        STARTING = 'starting'
        RUNNING = 'running'
        COMPLETED = 'completed'
        FAILED = 'failed'
        INTERRUPTED = 'interrupted'
    
    def update_status(scraper_name, status, message):
        print(f"Status update for {scraper_name}: {status} - {message}")
    
    def update_progress(scraper_name, progress_percent=0, products_scraped=0, current_task=""):
        print(f"Progress update for {scraper_name}: {progress_percent:.1f}% - {products_scraped} products - {current_task}")
    
    def get_amsterdam_time():
        tz = pytz.timezone('Europe/Amsterdam')
        return datetime.now(tz)
    
    def get_output_directory():
        return "/app/results"

# Import the original scraper
from jumbo_scraper import JumboGraphQLOptimizedScraper

# Override the hardcoded paths in the scraper to work with our infrastructure
def patch_scraper_for_infrastructure(scraper_instance, job_config):
    """
    Patch the scraper instance to use infrastructure paths instead of hardcoded ones
    This maintains the core logic while adapting to container environment
    """
    job_id = job_config["job_id"]
    
    # Update file paths to match infrastructure expectations
    scraper_instance.output_dir = "/app/results"
    scraper_instance.products_file = job_config["output_file"]
    scraper_instance.progress_file = job_config["progress_file"] 
    scraper_instance.completed_flag = job_config["complete_flag"]
    
    # Update session and data directories to work in container
    scraper_instance.session_file = f"/app/shared-data/{job_id}_session.json"
    
    # Create necessary directories
    os.makedirs("/app/results", exist_ok=True)
    os.makedirs("/app/jobs", exist_ok=True)
    os.makedirs("/app/logs", exist_ok=True)
    os.makedirs("/app/shared-data", exist_ok=True)
    
    # Override the hardcoded log configuration to use job-specific log
    log_file = job_config["log_file"]
    
    # Clear existing handlers and set up new ones
    logger = logging.getLogger()
    logger.handlers.clear()
    
    # Add file handler for this specific job
    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(logging.INFO)
    
    # Add console handler  
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    
    # Set format
    formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)
    
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    logger.setLevel(logging.INFO)
    
    # Job-specific parameters are now passed via constructor
    # No need to patch them here anymore
    
    return scraper_instance

async def main():
    """
    Main wrapper function that loads job config and runs the scraper
    """
    parser = argparse.ArgumentParser(description="Jumbo Scraper Infrastructure Wrapper")
    parser.add_argument("--config", required=True, help="Path to job configuration JSON file")
    args = parser.parse_args()
    
    try:
        # Load job configuration
        with open(args.config, 'r') as f:
            job_config = json.load(f)
        
        print(f"🚀 Starting Jumbo scraper for job {job_config['job_id']}")
        
        # Create and patch the scraper instance with job parameters
        scraper = JumboGraphQLOptimizedScraper(
            max_products=job_config.get('max_products'),
            categories_limit=job_config.get('categories_limit')
        )
        scraper = patch_scraper_for_infrastructure(scraper, job_config)
        
        # Run the scraper
        await scraper.run()
        
        print(f"✅ Jumbo scraper completed for job {job_config['job_id']}")
        
    except Exception as e:
        print(f"❌ Jumbo scraper failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())