#!/usr/bin/env python3
"""
AH Scraper - Modified for FastAPI Integration
Now supports config files for job-specific settings
All original features preserved with minimal changes
"""

import subprocess
import sys
import asyncio
import json
import os
import logging
import time
import signal
import argparse
from datetime import datetime
from random import uniform

def install_package(package_name):
    """Install a package using pip"""
    subprocess.check_call([sys.executable, "-m", "pip", "install", package_name])

# Try to import external packages, install if not available
try:
    import aiohttp
except ImportError:
    print("aiohttp not found. Installing...")
    install_package("aiohttp")
    import aiohttp

# Import utility modules (create simplified versions if needed)
try:
    from progress_monitor import update_status, update_progress, ScraperStatus, get_amsterdam_time
    from config_utils import get_output_directory
except ImportError:
    # Simplified versions for container deployment
    class ScraperStatus:
        STARTING = "starting"
        RUNNING = "running"
        COMPLETED = "completed"
        FAILED = "failed"
        INTERRUPTED = "interrupted"
    
    def update_status(scraper_name, status, message=""):
        print(f"Status: {scraper_name} - {status} - {message}")
    
    def update_progress(scraper_name, **kwargs):
        print(f"Progress: {scraper_name} - {kwargs}")
    
    def get_amsterdam_time():
        return datetime.now()
    
    def get_output_directory():
        return "/app/results"

HEADERS = {
    'Host': 'api.ah.nl',
    'x-application': 'AHWEBSHOP',
    'user-agent': 'AHBot/1.0',
    'content-type': 'application/json; charset=UTF-8',
}

class AHScraper:
    def __init__(self, config_file=None):
        # Default configuration
        self.base_url = "https://api.ah.nl/mobile-services"
        self.auth_url = "https://api.ah.nl/mobile-auth/v1/auth/token/anonymous"
        self.access_token = None
        
        # Default paths and settings
        self.output_dir = get_output_directory()
        self.output_file = f"{self.output_dir}/ah_products.json"
        self.progress_file = "/app/jobs/ah_scrape_progress.json"
        self.session_file = "/app/jobs/ah_session.json"
        self.completed_flag = "/app/jobs/ah_scrape_complete.flag"
        
        # NEW: Load configuration from file if provided
        if config_file and os.path.exists(config_file):
            self.load_config(config_file)
        
        # Create directories
        os.makedirs(os.path.dirname(self.output_file), exist_ok=True)
        os.makedirs(os.path.dirname(self.progress_file), exist_ok=True)
        
        # Initialize tracking
        self.scraped_product_ids = set()
        self.scraped_categories = set()
        self.categories = {}
        self.total_scraped_items = 0
        self.max_retries = 3
        self.base_delay = 1.0
        self.timeout_config = aiohttp.ClientTimeout(total=30, connect=10)
        self.shutdown_requested = False
        
        # Categories to exclude (non-food items)
        self.excluded_categories = {
            "20603": "AH Voordeelshop"  # Hardware/non-food items
        }
        
        # Setup signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
        
        # Check if previous run completed
        self.scraping_completed = os.path.exists(self.completed_flag)
        if self.scraping_completed:
            logging.info("✅ Previous run completed successfully. Skipping scraping.")
            if os.path.exists(self.output_file):
                try:
                    with open(self.output_file, 'r') as f:
                        existing_products = json.load(f)
                        self.total_scraped_items = len(existing_products)
                        logging.info(f"📊 Found {self.total_scraped_items} products from completed run")
                except (json.JSONDecodeError, FileNotFoundError):
                    self.total_scraped_items = 0
        else:
            self.load_progress()
    
    def load_config(self, config_file):
        """NEW: Load job-specific configuration from file"""
        try:
            with open(config_file, 'r') as f:
                config = json.load(f)
            
            # Override paths with job-specific ones
            self.job_id = config.get('job_id', 'default')
            self.output_file = config.get('output_file', self.output_file)
            self.progress_file = config.get('progress_file', self.progress_file)
            self.completed_flag = config.get('complete_flag', self.completed_flag)
            
            # Apply scraping limits
            self.max_products_limit = config.get('max_products', None)
            self.categories_limit = config.get('categories_limit', None)
            
            # Webhook configuration
            self.webhook_url = config.get('webhook_url')
            
            logging.info(f"✅ Loaded configuration for job {self.job_id}")
            
        except Exception as e:
            logging.error(f"❌ Failed to load config file {config_file}: {e}")
            raise

    def signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully."""
        logging.info(f"🛑 Received signal {signum}, shutting down gracefully...")
        self.shutdown_requested = True
        update_status('ah', ScraperStatus.INTERRUPTED, "Shutdown requested")

    def load_progress(self):
        """Load previous scraping progress if it exists."""
        if os.path.exists(self.progress_file):
            try:
                with open(self.progress_file, 'r') as f:
                    progress = json.load(f)
                    self.scraped_product_ids = set(progress.get('scraped_product_ids', []))
                    self.scraped_categories = set(progress.get('scraped_categories', []))
                    self.total_scraped_items = progress.get('total_scraped_items', 0)
                logging.info(f"📂 Loaded progress: {len(self.scraped_product_ids)} products, {len(self.scraped_categories)} categories already scraped")
            except json.JSONDecodeError:
                logging.warning("⚠️ Progress file corrupted, starting fresh")

    def save_progress(self):
        """Save current scraping progress."""
        try:
            progress_data = {
                'scraped_product_ids': list(self.scraped_product_ids),
                'scraped_categories': list(self.scraped_categories),
                'total_scraped_items': self.total_scraped_items,
                'timestamp': time.time(),
                'timestamp_amsterdam': get_amsterdam_time().strftime('%Y-%m-%d %H:%M:%S CET'),
                'job_id': getattr(self, 'job_id', 'default')
            }
            
            with open(self.progress_file, "w") as f:
                json.dump(progress_data, f, indent=4)
            
            logging.info(f"📁 Progress saved: {len(self.scraped_product_ids)} product IDs, {len(self.scraped_categories)} category IDs, {self.total_scraped_items} total items")
        except Exception as e:
            logging.error(f"❌ Failed to save progress: {e}")

    async def make_request_with_retry(self, session, method, url, **kwargs):
        """Make HTTP request with retry logic and exponential backoff."""
        for attempt in range(self.max_retries):
            try:
                delay = self.base_delay * (2 ** attempt) + uniform(0, 1)
                
                if attempt > 0:
                    logging.info(f"🔄 Retry attempt {attempt + 1}/{self.max_retries} for {url}")
                    await asyncio.sleep(delay)
                
                if method.upper() == 'GET':
                    async with session.get(url, **kwargs) as response:
                        return await self._handle_response(response, url)
                else:
                    async with session.post(url, **kwargs) as response:
                        return await self._handle_response(response, url)
                        
            except asyncio.TimeoutError:
                logging.warning(f"⏰ Timeout on attempt {attempt + 1} for {url}")
                if attempt == self.max_retries - 1:
                    raise
            except aiohttp.ClientError as e:
                logging.warning(f"🌐 Network error on attempt {attempt + 1} for {url}: {e}")
                if attempt == self.max_retries - 1:
                    raise
            except Exception as e:
                logging.error(f"❌ Unexpected error on attempt {attempt + 1} for {url}: {e}")
                if attempt == self.max_retries - 1:
                    raise
        
        return None

    async def _handle_response(self, response, url):
        """Handle HTTP response with proper error checking."""
        if response.status == 200:
            try:
                data = await response.json()
                return data
            except json.JSONDecodeError:
                logging.error(f"❌ Invalid JSON response from {url}")
                return None
        elif response.status == 429:
            logging.warning(f"🚫 Rate limited by {url}")
            await asyncio.sleep(5)
            raise aiohttp.ClientError("Rate limited")
        elif response.status in [401, 403]:
            logging.error(f"🔒 Authentication failed for {url} (status: {response.status})")
            raise aiohttp.ClientError(f"Authentication failed: {response.status}")
        else:
            text = await response.text()
            logging.error(f"❌ HTTP {response.status} for {url}: {text[:200]}...")
            raise aiohttp.ClientError(f"HTTP {response.status}")

    async def authenticate(self, session):
        """Authenticate with AH API."""
        payload = {"clientId": "appie"}
        
        try:
            data = await self.make_request_with_retry(
                session, 'POST', self.auth_url, 
                headers=HEADERS, json=payload
            )
            
            if data:
                self.access_token = data.get("access_token")
                logging.info("✅ Authentication successful!")
                return True
            else:
                logging.error("❌ Authentication failed: No response data")
                return False
        except Exception as e:
            logging.error(f"❌ Authentication error: {e}")
            return False

    async def fetch_all_categories(self, session):
        """Fetch all categories dynamically from AH API."""
        categories_url = f"{self.base_url}/v1/product-shelves/categories"
        headers_with_auth = {**HEADERS, "Authorization": f"Bearer {self.access_token}"}
        
        try:
            data = await self.make_request_with_retry(
                session, 'GET', categories_url, 
                headers=headers_with_auth
            )
            
            if data:
                # Extract categories and exclude non-food items
                count = 0
                for category in data:
                    cat_id = str(category["id"])
                    cat_name = category["name"]
                    
                    if cat_id not in self.excluded_categories:
                        self.categories[cat_id] = cat_name
                        count += 1
                        
                        # NEW: Apply categories limit if configured
                        if hasattr(self, 'categories_limit') and self.categories_limit and count >= self.categories_limit:
                            break
                
                logging.info(f"✅ Fetched {len(self.categories)} supermarket categories (excluded {len(self.excluded_categories)} non-food)")
                return True
            else:
                logging.error("❌ Failed to fetch categories: No response data")
                return False
        except Exception as e:
            logging.error(f"❌ Error fetching categories: {e}")
            return False

    async def scrape_category_products(self, session, category_id, category_name):
        """Scrape all products from a category using real mobile API."""
        search_url = f"{self.base_url}/product/search/v2"
        headers_with_auth = {**HEADERS, "Authorization": f"Bearer {self.access_token}"}
        
        page = 0
        page_size = 750
        category_products = []
        
        while not self.shutdown_requested:
            # NEW: Check product limit
            if hasattr(self, 'max_products_limit') and self.max_products_limit:
                if self.total_scraped_items >= self.max_products_limit:
                    logging.info(f"🛑 Reached maximum products limit: {self.max_products_limit}")
                    break
            
            params = {
                "adType": "TAXONOMY",
                "taxonomyId": category_id,
                "page": page,
                "size": page_size,
                "sortOn": "RELEVANCE"
            }
            
            try:
                data = await self.make_request_with_retry(
                    session, 'GET', search_url,
                    headers=headers_with_auth, params=params
                )
                
                if not data:
                    break
                
                products = data.get("products", [])
                if not products:
                    break
                
                # Save RAW products exactly as returned from AH API
                new_products = 0
                for product in products:
                    product_id = product.get("webshopId")
                    if product_id and product_id not in self.scraped_product_ids:
                        self.scraped_product_ids.add(product_id)
                        category_products.append(product)
                        new_products += 1
                        self.total_scraped_items += 1
                        
                        # NEW: Check if we've hit the limit
                        if hasattr(self, 'max_products_limit') and self.max_products_limit:
                            if self.total_scraped_items >= self.max_products_limit:
                                break
                
                if new_products > 0:
                    logging.info(f"  📦 Page {page + 1}: +{new_products} new products")
                
                # Check if we got fewer products than requested (last page)
                if len(products) < page_size:
                    break
                
                page += 1
                await asyncio.sleep(uniform(0.2, 0.5))
                
            except Exception as e:
                logging.error(f"  ❌ Exception scraping {category_name} page {page}: {e}")
                break
        
        return category_products

    def write_products(self, products):
        """Append products to the output JSON file with deduplication."""
        if not products:
            return
        
        # Load existing products
        existing_products = []
        existing_ids = set()
        if os.path.exists(self.output_file):
            try:
                with open(self.output_file, "r") as f:
                    existing_products = json.load(f)
                    existing_ids = {p.get('webshopId') for p in existing_products if p.get('webshopId')}
            except (json.JSONDecodeError, FileNotFoundError):
                logging.warning("⚠️ Products file corrupted or missing, starting fresh")
                existing_products = []
                existing_ids = set()
        
        # Deduplicate new products
        new_products = []
        for product in products:
            webshop_id = product.get('webshopId')
            if webshop_id and webshop_id not in existing_ids:
                new_products.append(product)
                existing_ids.add(webshop_id)
        
        # Add only truly new products
        existing_products.extend(new_products)
        
        # Save updated product list
        with open(self.output_file, "w") as f:
            json.dump(existing_products, f, ensure_ascii=False, indent=4)
        
        logging.info(f"💾 Saved {len(new_products)} new products to {self.output_file} (total: {len(existing_products)}, {len(products) - len(new_products)} duplicates filtered)")

    async def scrape_complete_catalog(self, session):
        """Scrape complete AH catalog using real API for all categories."""
        logging.info(f"🚀 Starting complete AH catalog scraping...")
        logging.info(f"📊 Categories to scrape: {len(self.categories)}")
        
        # Update progress with category count
        estimated_total = getattr(self, 'max_products_limit', 23000)
        update_progress('ah', categories_total=len(self.categories), estimated_total=estimated_total)
        logging.info(f"📊 Progress tracking: {self.total_scraped_items} products scraped, estimated total: {estimated_total}")
        
        for i, (category_id, category_name) in enumerate(self.categories.items(), 1):
            if self.shutdown_requested:
                logging.info("🛑 Shutdown requested, stopping scraping")
                break
            
            # Check if we've hit the product limit
            if hasattr(self, 'max_products_limit') and self.max_products_limit:
                if self.total_scraped_items >= self.max_products_limit:
                    logging.info(f"🛑 Reached maximum products limit: {self.max_products_limit}")
                    break
            
            # Skip already completed categories
            if category_id in self.scraped_categories:
                logging.info(f"⏭️ Skipping already completed category {i}/{len(self.categories)}: {category_name} (ID: {category_id})")
                continue
                
            logging.info(f"🔍 Processing category {i}/{len(self.categories)}: {category_name} (ID: {category_id})")
            
            # Update current task
            update_status('ah', ScraperStatus.RUNNING, f"Processing {category_name}")
            
            try:
                category_products = await self.scrape_category_products(session, category_id, category_name)
                
                if category_products:
                    self.write_products(category_products)
                    logging.info(f"  ✅ {category_name}: {len(category_products)} new products")
                else:
                    logging.info(f"  ⚠️ {category_name}: No new products found")
                
                # Mark category as completed
                self.scraped_categories.add(category_id)
                logging.info(f"  📋 Category {category_name} marked as completed ({len(self.scraped_categories)}/{len(self.categories)} categories done)")
                
                # Progress update
                completed_categories = len(self.scraped_categories)
                progress_pct = (completed_categories / len(self.categories)) * 100
                logging.info(f"📊 Overall progress: {completed_categories}/{len(self.categories)} categories ({progress_pct:.1f}%) - Total products: {self.total_scraped_items}")
                
                # Update shared memory progress
                update_progress('ah',
                              progress_percent=progress_pct,
                              products_scraped=self.total_scraped_items,
                              categories_completed=completed_categories,
                              current_task=f"Completed {category_name}")
                
                # Save progress after each category
                self.save_progress()
                
            except Exception as e:
                logging.error(f"❌ Failed to process category {category_name}: {e}")
                continue
        
        return self.total_scraped_items

    async def scrape(self):
        """Main scraping method with improved error handling and progress tracking."""
        start_time = time.time()
        
        try:
            # Check if scraping already completed
            if self.scraping_completed:
                logging.info("✅ Scraping already completed, updating status and exiting")
                update_status('ah', ScraperStatus.COMPLETED, f"Completed: {self.total_scraped_items} products")
                update_progress('ah', progress_percent=100.0, products_scraped=self.total_scraped_items)
                return
            
            # Update shared memory status
            update_status('ah', ScraperStatus.STARTING, "Initializing AH scraper...")
            
            # Create session with timeout configuration
            connector = aiohttp.TCPConnector(limit=10, limit_per_host=5)
            async with aiohttp.ClientSession(
                timeout=self.timeout_config,
                connector=connector
            ) as session:
                logging.info("🚀 Starting AH scraper...")
                logging.info(f"⚙️ Configuration: max_retries={self.max_retries}, timeout={self.timeout_config.total}s")
                
                # Update status to running
                update_status('ah', ScraperStatus.RUNNING, "Authenticating...")
                if not await self.authenticate(session):
                    update_status('ah', ScraperStatus.FAILED, "Authentication failed")
                    return
                
                update_status('ah', ScraperStatus.RUNNING, "Fetching categories...")
                if not await self.fetch_all_categories(session):
                    logging.error("❌ No categories found, aborting scrape")
                    update_status('ah', ScraperStatus.FAILED, "No categories found")
                    return
                
                logging.info(f"📂 Found {len(self.categories)} main categories")
                
                # Scrape complete catalog
                total_products = await self.scrape_complete_catalog(session)
                
                self.save_progress()
                
                # Mark run as complete with detailed JSON metrics (matching Jumbo format)
                elapsed_time = time.time() - start_time
                products_per_second = self.total_scraped_items / elapsed_time if elapsed_time > 0 else 0
                
                completion_data = {
                    'completed_at': get_amsterdam_time().isoformat(),
                    'total_products': self.total_scraped_items,
                    'duration_seconds': elapsed_time,
                    'products_per_second': products_per_second,
                    'categories_processed': len(self.categories),
                    'total_categories': len(self.categories),
                    'max_products_limit': getattr(self, 'max_products_limit', None),
                    'scraper_version': 'ah_v2.0',
                    'job_id': getattr(self, 'job_id', 'default')
                }
                
                with open(self.completed_flag, "w") as f:
                    json.dump(completion_data, f, indent=4)
                
                logging.info(f"✅ Scraping completed! Total products scraped: {self.total_scraped_items} in {elapsed_time:.1f} seconds ({products_per_second:.1f} products/sec)")
                
                # Update shared memory status to completed
                update_status('ah', ScraperStatus.COMPLETED, f"Completed: {self.total_scraped_items} products")
                update_progress('ah', progress_percent=100.0, products_scraped=self.total_scraped_items)
                
        except Exception as e:
            elapsed_time = time.time() - start_time
            logging.error(f"❌ Scraping failed after {elapsed_time:.1f} seconds: {e}")
            # Update shared memory status to failed
            update_status('ah', ScraperStatus.FAILED, f"Failed: {str(e)}")
            raise

# Initialize logging
def initialize_logging(debug_level=logging.INFO, log_file=None):
    handlers = [logging.StreamHandler()]
    
    # Add file handler if specified
    if log_file:
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        handlers.append(logging.FileHandler(log_file))
    
    logging.basicConfig(
        level=debug_level,
        format="%(asctime)s - %(levelname)s - %(message)s",
        handlers=handlers
    )

def main():
    # NEW: Command line argument support for config files
    parser = argparse.ArgumentParser(description='AH Product Scraper')
    parser.add_argument('--config', help='Configuration file path', type=str)
    parser.add_argument('--debug', help='Enable debug logging', action='store_true')
    args = parser.parse_args()
    
    # Initialize logging with optional log file from config
    log_file = None
    if args.config and os.path.exists(args.config):
        try:
            with open(args.config, 'r') as f:
                config = json.load(f)
            log_file = config.get('log_file')
        except:
            pass
    
    debug_level = logging.DEBUG if args.debug else logging.INFO
    initialize_logging(debug_level, log_file)
    
    # Create scraper with optional config file
    scraper = AHScraper(config_file=args.config)
    asyncio.run(scraper.scrape())

if __name__ == "__main__":
    main()
