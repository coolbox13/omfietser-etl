#!/usr/bin/env python3
"""
Kruidvat Optimized Scraper
==========================
Production-ready optimized version with improved rate limiting and page size.

Key optimizations while respecting Akamai protection:
1. Increased page size from 20 to 50 products per request
2. Reduced request delays from 0.1-0.3s to 0.05-0.2s  
3. Reduced page delays from 0.8-1.5s to 0.3-0.8s
4. Reduced category delays from 2.0-4.0s to 1.0-2.0s
5. Improved category completion tracking
6. Better error handling and recovery

Expected: 2-3x performance improvement while maintaining reliability
"""

import requests
import json
import os
import logging
import time
from datetime import datetime
from random import uniform
from progress_monitor import update_status, update_progress, ScraperStatus, get_amsterdam_time
from config_utils import get_output_directory

# Setup logging
os.makedirs("logs", exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("logs/kruidvat_optimized_scraper.log"),
        logging.StreamHandler()
    ]
)

# Kruidvat API configuration
BASE_URL = "https://app.kruidvat.nl"
API_BASE_URL = f"{BASE_URL}/api/v2/kvn"
TOKEN_URL = f"{BASE_URL}/authorizationserver/oauth/token"

# Optimized headers
HEADERS = {
    'User-Agent': 'Kruidvat/5.6.1 (iOS/18.3.1)',
    'Accept': 'application/json',
    'Accept-Language': 'nl-NL,nl;q=0.9',
    'Connection': 'keep-alive'
}

class OptimizedKruidvatScraper:
    def __init__(self, config_file=None):
        self.base_url = API_BASE_URL

        # Get output directory from configuration
        self.output_dir = get_output_directory()
        
        # Initialize config attributes with defaults
        self.job_id = "default"
        self.max_products_limit = None
        self.categories_limit = None
        self.webhook_url = None
        
        # Default file paths (will be overridden by config if provided)
        self.products_file = f"{self.output_dir}/kruidvat_products_{self.job_id}.json"
        self.progress_file = f"/app/jobs/kruidvat_scrape_progress_{self.job_id}.json"
        self.session_file = f"/app/jobs/kruidvat_session_{self.job_id}.json"
        self.completed_flag = f"/app/jobs/kruidvat_scrape_complete_{self.job_id}.flag"
        
        # Load configuration from file if provided (BEFORE checking completion)
        if config_file and os.path.exists(config_file):
            self.load_config(config_file)

        # Create output directories
        os.makedirs(self.output_dir, exist_ok=True)
        os.makedirs(os.path.dirname(self.progress_file), exist_ok=True)
        os.makedirs(os.path.dirname(self.session_file), exist_ok=True)
        os.makedirs(os.path.dirname(self.completed_flag), exist_ok=True)

        # Initialize progress tracking
        self.scraped_products = set()
        self.scraped_categories = set()
        self.session_token = None
        self.total_scraped = 0
        self.start_time = time.time()

        # OPTIMIZED Configuration
        self.max_retries = 3
        self.base_delay = 0.8          # Reduced from 1.0
        self.timeout = 25              # Reduced from 30
        self.connect_timeout = 8       # Reduced from 10

        # Check if previous run completed - if so, skip scraping
        self.scraping_completed = os.path.exists(self.completed_flag)
        if self.scraping_completed:
            logging.info("✅ Previous optimized run completed successfully. Skipping scraping.")
            # Load existing data for reporting
            if os.path.exists(self.products_file):
                try:
                    with open(self.products_file, 'r') as f:
                        existing_products = json.load(f)
                        self.total_scraped = len(existing_products)
                        logging.info(f"📊 Found {self.total_scraped} products from completed optimized run")
                except (json.JSONDecodeError, FileNotFoundError):
                    self.total_scraped = 0
        else:
            self.load_progress()
            self.load_session()

        logging.info("🚀 KRUIDVAT OPTIMIZED SCRAPER INITIALIZED")
        logging.info("⚡ Optimizations: Page size 50, faster rate limits, improved category tracking")

    def load_config(self, config_file):
        """Load job-specific configuration from file"""
        try:
            with open(config_file, 'r') as f:
                config = json.load(f)
            
            # Override paths with job-specific ones
            self.job_id = config.get('job_id', 'default')
            self.products_file = config.get('output_file', self.products_file)
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

    def load_progress(self):
        """Load previous scraping progress if it exists."""
        if os.path.exists(self.progress_file):
            try:
                with open(self.progress_file, 'r') as f:
                    progress = json.load(f)
                    self.scraped_products = set(progress.get('scraped_products', []))
                    self.scraped_categories = set(progress.get('scraped_categories', []))
                    self.total_scraped = progress.get('total_scraped', 0)
                logging.info(f"📂 Loaded optimized progress: {len(self.scraped_products)} products, {len(self.scraped_categories)} categories already scraped")
            except json.JSONDecodeError:
                logging.warning("⚠️ Progress file corrupted, starting fresh")

    def load_session(self):
        """Load session token if it exists and is valid."""
        if os.path.exists(self.session_file):
            try:
                with open(self.session_file, 'r') as f:
                    session_data = json.load(f)
                    token_data = session_data.get('token', {})

                    # Check if token is still valid
                    expires_at = token_data.get('expires_at', 0)
                    if time.time() < expires_at:
                        self.session_token = token_data
                        logging.info("📂 Loaded existing valid optimized session token")
                    else:
                        logging.info("⏰ Session token expired, will authenticate again")
                        self.session_token = None
            except (json.JSONDecodeError, KeyError):
                logging.warning("⚠️ Session file corrupted, will authenticate again")
                self.session_token = None

    def save_progress(self):
        """Save current scraping progress."""
        elapsed_time = time.time() - self.start_time
        products_per_second = self.total_scraped / elapsed_time if elapsed_time > 0 else 0
        
        progress_data = {
            'scraped_products': list(self.scraped_products),
            'scraped_categories': list(self.scraped_categories),
            'total_scraped': self.total_scraped,
            'products_per_second': products_per_second,
            'optimization_version': 'optimized_v1',
            'timestamp': time.time(),
            'timestamp_amsterdam': get_amsterdam_time().strftime('%Y-%m-%d %H:%M:%S CET')
        }
        with open(self.progress_file, 'w') as f:
            json.dump(progress_data, f, indent=4)

    def save_session(self, token_data):
        """Save session token for reuse."""
        session_data = {
            'token': token_data,
            'timestamp': time.time(),
            'timestamp_amsterdam': get_amsterdam_time().strftime('%Y-%m-%d %H:%M:%S CET'),
            'optimization_version': 'optimized_v1'
        }

        with open(self.session_file, 'w') as f:
            json.dump(session_data, f, indent=4)

        self.session_token = token_data
        logging.info("💾 Saved optimized session token")

    def authenticate(self):
        """Authenticate with Kruidvat API using working configuration from file."""
        if self.session_token:
            logging.info("🔑 Using existing session token")
            return True

        logging.info("🔑 Starting optimized Kruidvat authentication using working config...")

        try:
            # Load working authentication configuration
            auth_config = self._load_auth_config()
            if not auth_config:
                logging.error("❌ Failed to load authentication configuration")
                return False

            # Use the working authentication directly
            logging.info("🔑 Using working authentication data...")
            token_data = self._authenticate_with_config(auth_config)
            if not token_data:
                logging.error("❌ Failed to authenticate with working config")
                return False

            # Save the session
            expires_in = token_data.get('expires_in', 3600)
            token_data['expires_at'] = time.time() + expires_in
            self.save_session(token_data)

            logging.info("✅ Optimized Kruidvat authentication successful")
            return True

        except Exception as e:
            logging.error(f"❌ Authentication error: {e}")
            return False

    def _load_auth_config(self):
        """Load working authentication configuration from file."""
        try:
            config_file = 'kruidvat_auth_config.json'
            if not os.path.exists(config_file):
                logging.error(f"❌ Authentication config file not found: {config_file}")
                return None

            with open(config_file, 'r') as f:
                config = json.load(f)

            logging.info("✅ Loaded authentication configuration from file")
            return config

        except Exception as e:
            logging.error(f"❌ Error loading auth config: {e}")
            return None

    def _authenticate_with_config(self, auth_config):
        """Authenticate using the working configuration data."""
        try:
            url = "https://app.kruidvat.nl/authorizationserver/oauth/token?lang=nl"

            # Use the working headers and data from config
            headers = auth_config['auth_headers'].copy()
            headers['cookie'] = auth_config['working_cookies']
            headers['x-acf-sensor-data'] = auth_config['working_sensor_data']

            payload = auth_config['oauth_payload']

            logging.info("🔑 Making OAuth request with working configuration...")
            response = requests.post(url, headers=headers, data=payload, timeout=(8, 25))

            if response.status_code == 200:
                try:
                    token_data = response.json()
                    logging.info("✅ OAuth authentication successful")
                    return token_data
                except json.JSONDecodeError:
                    logging.error(f"❌ Invalid JSON response: {response.text}")
                    return None
            else:
                logging.error(f"❌ OAuth request failed: HTTP {response.status_code} - {response.text}")
                return None

        except Exception as e:
            logging.error(f"❌ Error in authentication with config: {e}")
            return None

    def get_headers(self):
        """Get headers with authorization token."""
        headers = HEADERS.copy()
        if self.session_token:
            token_type = self.session_token.get('token_type', 'Bearer')
            access_token = self.session_token.get('access_token', '')
            headers['Authorization'] = f"{token_type} {access_token}"
        return headers

    def make_request_with_retry(self, method, endpoint, params=None, data=None):
        """Make HTTP request with optimized retry logic and reduced delays."""
        url = f"{self.base_url}/{endpoint}" if not endpoint.startswith('http') else endpoint
        headers = self.get_headers()

        # OPTIMIZED: Reduced random delay for better performance
        time.sleep(uniform(0.05, 0.2))  # vs original 0.1-0.3

        for attempt in range(self.max_retries):
            try:
                # OPTIMIZED: Reduced delay multiplier
                delay = self.base_delay * (1.5 ** attempt) + uniform(0, 0.5)  # vs original 2**attempt

                if attempt > 0:
                    logging.info(f"🔄 Optimized retry {attempt + 1}/{self.max_retries} for {endpoint}")
                    time.sleep(delay)

                # Make request with optimized timeout
                if method.upper() == 'GET':
                    response = requests.get(url, headers=headers, params=params,
                                          timeout=(self.connect_timeout, self.timeout))
                elif method.upper() == 'POST':
                    response = requests.post(url, headers=headers, params=params, json=data,
                                           timeout=(self.connect_timeout, self.timeout))
                else:
                    raise ValueError(f"Unsupported method: {method}")

                return self._handle_response(response, endpoint)

            except requests.exceptions.Timeout:
                logging.warning(f"⏰ Optimized timeout on attempt {attempt + 1} for {endpoint}")
                if attempt == self.max_retries - 1:
                    raise
            except requests.exceptions.RequestException as e:
                logging.warning(f"🌐 Network error on attempt {attempt + 1} for {endpoint}: {e}")
                if attempt == self.max_retries - 1:
                    raise
            except Exception as e:
                logging.error(f"❌ Unexpected error on attempt {attempt + 1} for {endpoint}: {e}")
                if attempt == self.max_retries - 1:
                    raise

        return None

    def _handle_response(self, response, endpoint):
        """Handle HTTP response with proper error checking."""
        if response.status_code == 200:
            try:
                return response.json()
            except json.JSONDecodeError:
                logging.error(f"❌ Invalid JSON response from {endpoint}")
                return None
        elif response.status_code == 401:
            logging.warning(f"🔒 Authentication failed for {endpoint}, re-authenticating...")
            self.session_token = None
            if self.authenticate():
                # Retry the request once with new token
                headers = self.get_headers()
                response = requests.get(f"{self.base_url}/{endpoint}", headers=headers,
                                      timeout=(self.connect_timeout, self.timeout))
                if response.status_code == 200:
                    return response.json()
            raise requests.exceptions.RequestException(f"Authentication failed: {response.status_code}")
        elif response.status_code == 429:
            logging.warning(f"🚫 Rate limited by {endpoint}, respecting Akamai")
            time.sleep(5)  # Wait longer for rate limits
            raise requests.exceptions.RequestException("Rate limited")
        else:
            logging.error(f"❌ HTTP {response.status_code} for {endpoint}: {response.text[:200]}...")
            raise requests.exceptions.RequestException(f"HTTP {response.status_code}")

    def get_categories(self):
        """Load categories from categories.txt file with optimized processing."""
        try:
            logging.info("🔍 Loading categories for optimized scraping...")

            if not os.path.exists('categories.txt'):
                logging.error("❌ categories.txt file not found")
                return []

            categories = []

            with open('categories.txt', 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and "Category:" in line:
                        # Parse line format: "Category: Beauty            29536077"
                        parts = line.split()
                        if len(parts) >= 3:
                            category_name = parts[1]  # e.g., "Beauty"
                            category_id = parts[-1]   # e.g., "29536077"

                            try:
                                # Always fetch category details from API, but mark if already scraped
                                result = self.make_request_with_retry('GET', f'categories/{category_id}',
                                                                    params={'fields': 'FULL', 'lang': 'nl'})

                                if result:
                                    category = {
                                        'id': result.get('id', category_id),
                                        'code': result.get('code', category_id),
                                        'name': result.get('name', category_name),
                                        'url': result.get('url', ''),
                                        'subcategories': result.get('subcategories', []),
                                        'already_scraped': category_id in self.scraped_categories
                                    }
                                    categories.append(category)
                                    
                                    if category_id in self.scraped_categories:
                                        logging.info(f"✅ Loaded category (already scraped): {category['name']} (ID: {category_id})")
                                    else:
                                        logging.info(f"✅ Loaded category: {category['name']} (ID: {category_id})")

                                    # Process subcategories if they exist
                                    for subcat in category.get('subcategories', []):
                                        if subcat.get('id'):
                                            sub_category = {
                                                'id': subcat.get('id', ''),
                                                'code': subcat.get('code', ''),
                                                'name': subcat.get('name', ''),
                                                'url': subcat.get('url', ''),
                                                'subcategories': subcat.get('subcategories', []),
                                                'already_scraped': subcat.get('id') in self.scraped_categories
                                            }
                                            categories.append(sub_category)
                                            
                                            if subcat.get('id') in self.scraped_categories:
                                                logging.info(f"✅ Loaded subcategory (already scraped): {sub_category['name']}")
                                            else:
                                                logging.info(f"✅ Loaded subcategory: {sub_category['name']}")
                                else:
                                    # If API call fails, create basic category entry
                                    category = {
                                        'id': category_id,
                                        'code': category_id,
                                        'name': category_name,
                                        'url': '',
                                        'subcategories': [],
                                        'already_scraped': category_id in self.scraped_categories
                                    }
                                    categories.append(category)
                                    
                                    if category_id in self.scraped_categories:
                                        logging.info(f"✅ Created basic category (already scraped): {category_name} (ID: {category_id})")
                                    else:
                                        logging.info(f"✅ Created basic category: {category_name} (ID: {category_id})")

                                # OPTIMIZED: Reduced delay between category requests
                                time.sleep(uniform(0.1, 0.3))  # vs original 0.2-0.5

                            except Exception as e:
                                logging.warning(f"⚠️ Failed to load category {category_name} (ID: {category_id}): {e}")
                                continue

            # Check if all categories are already scraped (completion detection)
            unscraped_categories = [cat for cat in categories if not cat.get('already_scraped', False)]
            
            if len(unscraped_categories) == 0 and len(categories) > 0:
                logging.info(f"🎉 All {len(categories)} categories have been scraped! Optimized scraping is complete.")
                # Return special marker to indicate completion
                return "COMPLETED"

            logging.info(f"✅ Found {len(categories)} categories for optimized processing")
            return categories

        except Exception as e:
            logging.error(f"❌ Error loading categories from file: {e}")
            return []

    def scrape_category_products(self, category):
        """Scrape products for a specific category with optimizations."""
        category_name = category.get('name', 'Unknown Category')
        category_code = category.get('code', '')

        logging.info(f"🔍 Starting optimized scraping for category: {category_name} (Code: {category_code})")

        page = 0
        page_size = 50  # OPTIMIZED: Increased from 20 to 50
        total_scraped = 0
        consecutive_empty_pages = 0
        max_empty_pages = 3

        while consecutive_empty_pages < max_empty_pages:
            try:
                params = {
                    'categoryCode': category_code,
                    'currentPage': page,
                    'pageSize': page_size,  # OPTIMIZED: 50 vs 20
                    'fields': 'FULL',
                    'lang': 'nl',
                    'query': '::',
                    'sort': 'score'
                }

                # Log progress every 3 pages (since pages are bigger)
                if page % 3 == 0 and page > 0:
                    logging.info(f"📊 Optimized progress for {category_name}: page {page}, {total_scraped} new products found")

                search_results = self.make_request_with_retry('GET', 'search', params=params)

                if not search_results:
                    logging.warning(f"⚠️ No response for category {category_name} at page {page}")
                    consecutive_empty_pages += 1
                    page += 1
                    continue

                products = search_results.get('products', [])
                pagination = search_results.get('pagination', {})
                total_pages = pagination.get('totalPages', 0)

                if not products:
                    consecutive_empty_pages += 1
                    logging.info(f"⚠️ No products found for category {category_name} at page {page} (empty page {consecutive_empty_pages}/{max_empty_pages})")

                    # Check if we've reached the end based on pagination
                    if page >= total_pages and total_pages > 0:
                        logging.info(f"✅ Reached end of category {category_name} (page {page}/{total_pages})")
                        break

                    page += 1
                    continue
                else:
                    consecutive_empty_pages = 0  # Reset counter when we find products

                detailed_products = []
                for product in products:
                    # Check max_products limit before processing (using hasattr for safety)
                    if hasattr(self, 'max_products_limit') and self.max_products_limit and self.total_scraped >= self.max_products_limit:
                        logging.info(f"🎯 Max products limit reached ({self.max_products_limit}). Stopping category: {category_name}")
                        return total_scraped
                    
                    product_id = product.get('id') or product.get('code')
                    if product_id and product_id not in self.scraped_products:
                        product_entry = {
                            'product': product
                        }
                        detailed_products.append(product_entry)
                        self.scraped_products.add(product_id)
                        total_scraped += 1
                        self.total_scraped += 1
                        
                        # Check if we've reached the limit after adding this product
                        if hasattr(self, 'max_products_limit') and self.max_products_limit and self.total_scraped >= self.max_products_limit:
                            logging.info(f"🎯 Max products limit reached ({self.max_products_limit}). Total products: {self.total_scraped}")
                            break

                if detailed_products:
                    self.save_data(detailed_products, 'products_file', 'products')
                    self.save_progress()
                    logging.info(f"💾 Saved {len(detailed_products)} optimized products from {category_name}")
                    
                    # Check if max_products limit reached after saving
                    if hasattr(self, 'max_products_limit') and self.max_products_limit and self.total_scraped >= self.max_products_limit:
                        logging.info(f"🎯 Max products limit reached ({self.max_products_limit}). Stopping category: {category_name}")
                        break

                page += 1

                # Check pagination limits
                if total_pages > 0 and page >= total_pages:
                    logging.info(f"✅ Completed all pages for category {category_name} ({page}/{total_pages})")
                    break

                # OPTIMIZED: Reduced delays with random component
                time.sleep(uniform(0.3, 0.8))  # vs original 0.8-1.5

            except Exception as e:
                logging.error(f"❌ Error scraping category {category_name} at page {page}: {e}")
                consecutive_empty_pages += 1
                if consecutive_empty_pages >= max_empty_pages:
                    break
                page += 1
                time.sleep(1.5)  # Wait shorter after errors

        logging.info(f"✅ Finished optimized {category_name}: {total_scraped} new products scraped (Total scraped so far: {self.total_scraped})")
        return total_scraped

    def save_data(self, data, filename, data_type):
        """Save or update data in the output file with deduplication."""
        if not data:
            return

        filepath = getattr(self, filename)
        existing_data = []
        existing_ids = set()

        if os.path.exists(filepath):
            try:
                with open(filepath, 'r') as f:
                    existing_data = json.load(f)
                    # Extract IDs for deduplication (handle both product and other data types)
                    if data_type == 'products':
                        existing_ids = {item.get('product', {}).get('id') or item.get('product', {}).get('code')
                                      for item in existing_data
                                      if item.get('product', {}).get('id') or item.get('product', {}).get('code')}
                    else:
                        # For non-product data, use a simple approach
                        existing_ids = {str(item) for item in existing_data}
            except (json.JSONDecodeError, FileNotFoundError):
                logging.warning(f"⚠️ {data_type} file corrupted or missing, starting fresh")
                existing_data = []
                existing_ids = set()

        # Deduplicate new data against existing file content
        if isinstance(data, list):
            new_data = []
            for item in data:
                if data_type == 'products':
                    item_id = item.get('product', {}).get('id') or item.get('product', {}).get('code')
                    if item_id and item_id not in existing_ids:
                        new_data.append(item)
                        existing_ids.add(item_id)
                else:
                    # For non-product data, use simple string comparison
                    item_str = str(item)
                    if item_str not in existing_ids:
                        new_data.append(item)
                        existing_ids.add(item_str)

            # Add only truly new data
            existing_data.extend(new_data)
            items_saved = len(new_data)
            duplicates_filtered = len(data) - len(new_data)
        else:
            # Single item
            if data_type == 'products':
                item_id = data.get('product', {}).get('id') or data.get('product', {}).get('code')
                if item_id and item_id not in existing_ids:
                    existing_data.append(data)
                    items_saved = 1
                    duplicates_filtered = 0
                else:
                    items_saved = 0
                    duplicates_filtered = 1
            else:
                item_str = str(data)
                if item_str not in existing_ids:
                    existing_data.append(data)
                    items_saved = 1
                    duplicates_filtered = 0
                else:
                    items_saved = 0
                    duplicates_filtered = 1

        # Save updated data
        with open(filepath, 'w') as f:
            json.dump(existing_data, f, indent=4, ensure_ascii=False)

        if duplicates_filtered > 0:
            logging.info(f"💾 Saved {items_saved} optimized {data_type} items to {filepath} (total: {len(existing_data)}, {duplicates_filtered} duplicates filtered)")
        else:
            logging.info(f"💾 Saved {items_saved} optimized {data_type} items to {filepath} (total: {len(existing_data)})")

    def scrape_all_products(self):
        """Scrape all products across all categories with optimizations."""
        # Authenticate first
        if not self.authenticate():
            logging.error("❌ Failed to authenticate, aborting optimized scrape")
            update_status('kruidvat', ScraperStatus.FAILED, "Authentication failed")
            return 0

        # Get categories
        update_status('kruidvat', ScraperStatus.RUNNING, "Fetching categories for optimization...")
        categories = self.get_categories()

        # Handle completion case
        if categories == "COMPLETED":
            logging.info("🎉 All categories already scraped! Finalizing optimized results...")
            update_status('kruidvat', ScraperStatus.RUNNING, "Finalizing completed optimized scrape...")

            # Create completion flag
            with open(self.completed_flag, "w") as f:
                f.write(f"Optimized scrape completed on {get_amsterdam_time().strftime('%Y-%m-%d %H:%M:%S CET')}")

            logging.info(f"✅ Optimized scraping finalization complete! Total products: {self.total_scraped}")
            update_status('kruidvat', ScraperStatus.COMPLETED, f"Optimized completed: {self.total_scraped} products")
            update_progress('kruidvat', progress_percent=100.0, products_scraped=self.total_scraped)
            return self.total_scraped

        if not categories:
            logging.error("❌ No categories found, aborting optimized scrape")
            update_status('kruidvat', ScraperStatus.FAILED, "No categories found")
            return 0

        unscraped_categories = [cat for cat in categories if not cat.get('already_scraped', False)]
        logging.info(f"📂 Found {len(categories)} total categories ({len(unscraped_categories)} remaining for optimized scraping)")
        
        # Debug: Show all categories that will be processed
        for cat in categories:
            status = "✅ COMPLETED" if cat.get('already_scraped', False) else "⚡ OPTIMIZING" 
            logging.info(f"   {status}: {cat.get('name')} (ID: {cat.get('id')}, Code: {cat.get('code')})")

        # Update progress with category count
        update_progress('kruidvat', categories_total=len(categories), estimated_total=8000)

        total_processed = 0
        for i, category in enumerate(categories, 1):
            category_name = category.get('name', 'Unknown')
            category_id = category.get('id', '')
            
            # Check if category is already scraped
            if category.get('already_scraped', False):
                logging.info(f"⏭️ Skipping already scraped category {i}/{len(categories)}: {category_name}")
                continue

            logging.info(f"⚡ Optimized processing category {i}/{len(categories)}: {category_name}")

            # Update current task
            update_status('kruidvat', ScraperStatus.RUNNING, f"Optimizing {category_name}")

            try:
                category_count = self.scrape_category_products(category)
                total_processed += category_count
                
                # Mark category as scraped after successful completion (use both id and code for compatibility)
                self.scraped_categories.add(category_id)
                if category.get('code') and category.get('code') != category_id:
                    self.scraped_categories.add(category.get('code'))
                logging.info(f"✅ Optimized completion: {category_name} (ID: {category_id})")

                # Progress update
                progress_pct = (i / len(categories)) * 100
                logging.info(f"📊 Overall optimized progress: {i}/{len(categories)} categories ({progress_pct:.1f}%) - Total products: {self.total_scraped}")

                # Update shared memory progress
                update_progress('kruidvat',
                              progress_percent=progress_pct,
                              products_scraped=self.total_scraped,
                              categories_completed=i,
                              current_task=f"Optimized {category_name}")

                # OPTIMIZED: Reduced delay between categories
                time.sleep(uniform(1.0, 2.0))  # vs original 2.0-4.0

            except Exception as e:
                logging.error(f"❌ Failed to scrape category {category_name}: {e}")
                continue

        logging.info(f"✅ Total new products processed with optimizations: {total_processed}")
        return total_processed

    def scrape(self):
        """Main optimized scraping method with improved error handling and session management."""
        start_time = time.time()

        try:
            # Check if scraping already completed
            if self.scraping_completed:
                logging.info("✅ Optimized scraping already completed, updating status and exiting")
                update_status('kruidvat', ScraperStatus.COMPLETED, f"Optimized completed: {self.total_scraped} products")
                update_progress('kruidvat', progress_percent=100.0, products_scraped=self.total_scraped)
                return

            # Update shared memory status
            update_status('kruidvat', ScraperStatus.STARTING, "Initializing optimized Kruidvat scraper...")

            logging.info("🚀 Starting optimized Kruidvat scraper...")
            logging.info(f"⚙️ Optimized configuration: max_retries={self.max_retries}, timeout={self.timeout}s, page_size=50")

            # Update status to running
            update_status('kruidvat', ScraperStatus.RUNNING, "Optimized authentication...")
            total_processed = self.scrape_all_products()

            # Mark run as complete
            with open(self.completed_flag, "w") as f:
                completion_data = {
                    'completed_at': get_amsterdam_time().isoformat(),
                    'total_products': self.total_scraped,
                    'duration_seconds': time.time() - start_time,
                    'products_per_second': self.total_scraped / (time.time() - start_time) if (time.time() - start_time) > 0 else 0,
                    'optimization_version': 'optimized_v1',
                    'page_size_used': 50,
                    'optimizations_applied': [
                        'Page size increased from 20 to 50',
                        'Request delays reduced from 0.1-0.3s to 0.05-0.2s',
                        'Page delays reduced from 0.8-1.5s to 0.3-0.8s', 
                        'Category delays reduced from 2.0-4.0s to 1.0-2.0s',
                        'Improved category completion tracking',
                        'Better error handling and recovery'
                    ]
                }
                json.dump(completion_data, f, indent=4)

            elapsed_time = time.time() - start_time
            final_rate = self.total_scraped / elapsed_time if elapsed_time > 0 else 0
            logging.info(f"✅ Optimized scraping completed! Processed {total_processed} new products in {elapsed_time:.1f} seconds")
            logging.info(f"📊 Final optimized stats: Total products scraped: {self.total_scraped} @ {final_rate:.1f} products/second")

            # Update shared memory status to completed
            update_status('kruidvat', ScraperStatus.COMPLETED, f"Optimized completed: {self.total_scraped} products @ {final_rate:.1f}/sec")
            update_progress('kruidvat', progress_percent=100.0, products_scraped=self.total_scraped)

        except Exception as e:
            elapsed_time = time.time() - start_time
            logging.error(f"❌ Optimized scraping failed after {elapsed_time:.1f} seconds: {e}")
            # Update shared memory status to failed
            update_status('kruidvat', ScraperStatus.FAILED, f"Optimized failed: {str(e)}")
            raise

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Kruidvat Optimized Scraper')
    parser.add_argument('--config', type=str, help='Configuration file path')
    args = parser.parse_args()
    
    logging.info("🟢 Optimized Kruidvat Scraper Started")
    logging.info("⚡ Optimization features: 50 products/page, reduced delays, better tracking")
    scraper = OptimizedKruidvatScraper(config_file=args.config)
    scraper.scrape()

if __name__ == "__main__":
    main()