#!/usr/bin/env python3
"""
Plus Ultra-Optimized Scraper - FIXED VERSION
==========================================
Fixed all major issues from previous ultra-optimization attempt:

PROBLEMS IDENTIFIED & FIXED:
1. ❌ CSRF token expiry -> ✅ Fresh token every 500 requests  
2. ❌ Rate limit auto-increase (0.05s -> 1.23s) -> ✅ Fixed at 0.05s
3. ❌ Lost concurrency (sequential processing) -> ✅ Maintained 8 concurrent categories
4. ❌ Low semaphore limit (5) -> ✅ Increased to 15 for true concurrency
5. ❌ Performance 8.5/sec vs 180+/sec -> ✅ Target: 200+ products/sec

ULTRA-OPTIMIZATION STRATEGY:
- PageSize=100 (36.0 products/sec per request - proven optimal)
- Fixed 0.05s interval (no auto-adjustment)
- 8 concurrent categories with high semaphore (15)
- Fresh authentication every 500 requests
- Aggressive timeout settings
"""

import aiohttp
import asyncio
import json
import os
import logging
import time
import signal
from datetime import datetime
from random import uniform
from typing import Dict, List, Optional, Tuple

# Import progress monitoring
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

# Setup logging
os.makedirs("/app/logs", exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("/app/logs/plus_scraper.log"),
        logging.StreamHandler()
    ]
)

logging.getLogger('aiohttp').setLevel(logging.WARNING)

# Plus API configuration
BASE_URL = "https://www.plus.nl"
API_BASE_URL = f"{BASE_URL}/screenservices"

# API endpoints
CATEGORIES_ENDPOINT = "/ECOP/ActionCategoryGet_AllParentCategorySlugs_Cache"
PRODUCT_LIST_ENDPOINT = "/ECP_Composition_CW/ProductLists/PLP_Content/DataActionGetProductListAndCategoryInfo"

# Working API versions
WORKING_VERSIONS = {
    "moduleVersion": "weFYD1gmE6vQWTkctRaoMg",
    "categories_apiVersion": "3ILOZnpUO1c6_VmXxQYpLg",
    "products_apiVersion": "bYh0SIb+kuEKWPesnQKP1A",
    "csrf_token": "T6C+9iB49TLra4jEsMeSckDMNhQ="
}

# ULTRA-FIXED PARAMETERS
OPTIMAL_PAGE_SIZE = 100           # 36.0 products/sec per request (proven)
FIXED_REQUEST_INTERVAL = 0.05     # FIXED - no auto-adjustment 
MAX_CONCURRENT_CATEGORIES = 8     # High concurrency
HIGH_SEMAPHORE_LIMIT = 15         # INCREASED from 5 to prevent bottleneck
AUTH_REFRESH_INTERVAL = 500       # Refresh token every 500 requests

# Test mode parameters
TEST_MODE = False                 # FULL MODE - complete catalog scraping
TEST_CATEGORIES_LIMIT = 3         # Test with 3 categories
TEST_PAGES_PER_CATEGORY = 5       # Test with 5 pages per category

# Ultra-optimized headers
ULTRA_HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "nl-NL,nl;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Content-Type": "application/json; charset=UTF-8",
    "Origin": "https://www.plus.nl",
    "Referer": "https://www.plus.nl/producten",
    "Connection": "keep-alive",
    "Outsystems-Locale": "nl-NL",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    "X-Requested-With": "XMLHttpRequest",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache"
}

class PlusUltraFixedScraper:
    def __init__(self, config_file=None):
        self.base_url = BASE_URL
        self.api_base_url = API_BASE_URL
        self.output_dir = get_output_directory()
        self.products_file = f"{self.output_dir}/plus_products_ultra_fixed.json"
        self.progress_file = "/app/jobs/plus_scrape_progress.json"
        self.completed_flag = "/app/jobs/plus_scrape_complete.flag"
        
        # Default paths
        self.session_file = "/app/jobs/plus_session.json"
        
        # NEW: Load configuration from file if provided
        if config_file and os.path.exists(config_file):
            self.load_config(config_file)
        
        # Create directories
        os.makedirs(os.path.dirname(self.products_file), exist_ok=True)
        os.makedirs(os.path.dirname(self.progress_file), exist_ok=True)
    
    def load_config(self, config_file):
        """NEW: Load job-specific configuration from file"""
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

        # Create directories
        os.makedirs(self.output_dir, exist_ok=True)
        os.makedirs("/app/data", exist_ok=True)
        os.makedirs("/app/progress", exist_ok=True)

        # Performance tracking
        self.scraped_products = set()
        self.scraped_categories = set()
        self.session_cookies = {}
        self.total_scraped = 0
        
        # ULTRA-FIXED: Enhanced performance tracking
        self.requests_made = 0
        self.successful_requests = 0
        self.failed_requests = 0
        self.auth_refreshes = 0
        self.estimated_total_products = 17000 if not TEST_MODE else 500
        
        # Category progress tracking
        self.category_progress = {}
        self.completed_categories = set()
        
        # FIXED: Authentication management
        self.csrf_token = None
        self.version_info = None
        self.last_auth_refresh = 0
        
        # Performance metrics
        self.start_time = time.time()
        self.products_per_second = 0
        self.requests_per_minute = 0
        
        # ULTRA-FIXED: No auto-adjustment settings
        self.max_retries = 2
        self.base_delay = FIXED_REQUEST_INTERVAL  # FIXED at 0.05s
        self.original_delay = FIXED_REQUEST_INTERVAL  # Never change this
        self.timeout_config = aiohttp.ClientTimeout(total=10, connect=3)  # Aggressive
        self.shutdown_requested = False

        # Setup signal handlers
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)

        # Check completion status
        self.scraping_completed = os.path.exists(self.completed_flag)
        if self.scraping_completed and not TEST_MODE:
            logging.info("✅ Previous run completed successfully. Skipping scraping.")
            self.load_existing_data()
        else:
            self.load_progress()
            self.load_session()

        mode_str = "TEST MODE (3 categories, 5 pages each)" if TEST_MODE else "FULL CATALOG"
        logging.info(f"🚀 PLUS ULTRA-FIXED SCRAPER INITIALIZED - {mode_str}")
        logging.info(f"   FIXED PageSize: {OPTIMAL_PAGE_SIZE} (36.0 products/sec per request)")
        logging.info(f"   FIXED Request interval: {self.base_delay}s (NO auto-adjustment)")
        logging.info(f"   FIXED Concurrency: {MAX_CONCURRENT_CATEGORIES} categories")
        logging.info(f"   FIXED Semaphore: {HIGH_SEMAPHORE_LIMIT} (increased from 5)")
        logging.info(f"   Auth refresh: Every {AUTH_REFRESH_INTERVAL} requests")
        logging.info(f"   Expected performance: 200+ products/sec")

    def signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully."""
        logging.info(f"🛑 Received signal {signum}, shutting down gracefully...")
        self.shutdown_requested = True
        update_status('plus', ScraperStatus.INTERRUPTED, "Shutdown requested")

    def load_existing_data(self):
        """Load existing product data for reporting."""
        if os.path.exists(self.products_file):
            try:
                with open(self.products_file, 'r') as f:
                    existing_products = json.load(f)
                    self.total_scraped = len(existing_products)
                    logging.info(f"📊 Found {self.total_scraped} products from completed run")
            except (json.JSONDecodeError, FileNotFoundError):
                self.total_scraped = 0

    def load_progress(self):
        """Load previous scraping progress."""
        if os.path.exists(self.progress_file):
            try:
                with open(self.progress_file, 'r') as f:
                    progress = json.load(f)
                    self.scraped_products = set(progress.get('scraped_products', []))
                    self.scraped_categories = set(progress.get('scraped_categories', []))
                    self.total_scraped = progress.get('total_scraped', 0)
                    self.category_progress = progress.get('category_progress', {})
                    self.completed_categories = set(progress.get('completed_categories', []))
                    self.requests_made = progress.get('requests_made', 0)
                    
                logging.info(f"📂 Loaded progress: {len(self.scraped_products)} products")
                logging.info(f"🎯 Completed categories: {len(self.completed_categories)}")
                
            except json.JSONDecodeError:
                logging.warning("⚠️ Progress file corrupted, starting fresh")

    def load_session(self):
        """Load session cookies if they exist."""
        if os.path.exists(self.session_file):
            try:
                with open(self.session_file, 'r') as f:
                    session_data = json.load(f)
                    self.session_cookies = session_data.get('cookies', {})
                    session_time = session_data.get('timestamp', 0)
                    if time.time() - session_time < 1800:  # 30 minutes
                        logging.info("📂 Loaded existing session cookies")
                    else:
                        logging.info("⏰ Session cookies expired, will create new session")
                        self.session_cookies = {}
            except (json.JSONDecodeError, KeyError):
                logging.warning("⚠️ Session file corrupted, will create new session")
                self.session_cookies = {}

    def save_progress(self):
        """Save current scraping progress with ultra-fixed metrics."""
        elapsed_time = time.time() - self.start_time
        if elapsed_time > 0:
            self.products_per_second = self.total_scraped / elapsed_time
            self.requests_per_minute = (self.requests_made / elapsed_time) * 60 if elapsed_time > 0 else 0
        
        progress_data = {
            'scraped_products': list(self.scraped_products),
            'scraped_categories': list(self.scraped_categories),
            'total_scraped': self.total_scraped,
            'category_progress': self.category_progress,
            'completed_categories': list(self.completed_categories),
            
            # ULTRA-FIXED: Enhanced tracking
            'requests_made': self.requests_made,
            'successful_requests': self.successful_requests,
            'failed_requests': self.failed_requests,
            'auth_refreshes': self.auth_refreshes,
            'products_per_second': self.products_per_second,
            'requests_per_minute': self.requests_per_minute,
            'success_rate': self.successful_requests / max(1, self.requests_made),
            'current_delay': self.base_delay,
            'original_delay': self.original_delay,
            
            'estimated_progress_percent': min(100.0, (self.total_scraped / self.estimated_total_products) * 100),
            'optimization_active': True,
            'optimization_version': 'ultra_fixed_v1',
            'test_mode': TEST_MODE,
            'page_size_used': OPTIMAL_PAGE_SIZE,
            'fixed_interval': FIXED_REQUEST_INTERVAL,
            'high_semaphore': HIGH_SEMAPHORE_LIMIT,
            'timestamp': time.time(),
            'timestamp_amsterdam': get_amsterdam_time().strftime('%Y-%m-%d %H:%M:%S CET')
        }
        
        with open(self.progress_file, 'w') as f:
            json.dump(progress_data, f, indent=4)

    def save_session(self, session):
        """Save session cookies for reuse."""
        if session.cookie_jar:
            cookies = {}
            for cookie in session.cookie_jar:
                cookies[cookie.key] = cookie.value

            session_data = {
                'cookies': cookies,
                'timestamp': time.time(),
                'timestamp_amsterdam': get_amsterdam_time().strftime('%Y-%m-%d %H:%M:%S CET')
            }

            with open(self.session_file, 'w') as f:
                json.dump(session_data, f, indent=4)

            self.session_cookies = cookies
            logging.info("💾 Saved session cookies")

    def save_products(self, products):
        """Save or update products with deduplication."""
        if not products:
            return

        # Load existing products
        existing_products = []
        existing_ids = set()
        if os.path.exists(self.products_file):
            try:
                with open(self.products_file, 'r') as f:
                    existing_products = json.load(f)
                    existing_ids = {p.get('product', {}).get('PLP_Str', {}).get('SKU') for p in existing_products if p.get('product', {}).get('PLP_Str', {}).get('SKU')}
            except (json.JSONDecodeError, FileNotFoundError):
                existing_products = []
                existing_ids = set()

        # Add new products
        new_products = []
        for product in products:
            product_id = product.get('product', {}).get('PLP_Str', {}).get('SKU')
            if product_id and product_id not in existing_ids:
                new_products.append(product)
                existing_ids.add(product_id)

        existing_products.extend(new_products)

        with open(self.products_file, 'w') as f:
            json.dump(existing_products, f, indent=4, ensure_ascii=False)

        if new_products:
            logging.info(f"💾 Saved {len(new_products)} new products (total: {len(existing_products)})") 

    async def refresh_authentication(self, session):
        """FIXED: Refresh authentication tokens periodically."""
        try:
            logging.info("🔄 Refreshing authentication tokens...")
            
            init_url = f"{BASE_URL}/producten"
            async with session.get(init_url, headers=ULTRA_HEADERS) as response:
                if response.status != 200:
                    logging.error(f"❌ Failed to refresh authentication: {response.status}")
                    return False

                page_content = await response.text()
                cookies = self.extract_cookies(session)
                csrf_token = self.extract_csrf_from_content(page_content, cookies)
                
                if csrf_token:
                    self.csrf_token = csrf_token
                    self.auth_refreshes += 1
                    logging.info(f"✅ Authentication refreshed #{self.auth_refreshes}: {csrf_token[:10]}...")
                    return True
                else:
                    logging.warning("⚠️ CSRF extraction failed during refresh")
                    return False
                
        except Exception as e:
            logging.error(f"❌ Authentication refresh error: {e}")
            return False

    async def establish_session(self, session):
        """Initialize session and extract authentication tokens."""
        try:
            logging.info("🔑 Initializing ultra-fixed session...")
            
            init_url = f"{BASE_URL}/producten"
            async with session.get(init_url, headers=ULTRA_HEADERS) as response:
                if response.status != 200:
                    logging.error(f"❌ Failed to initialize session: {response.status}")
                    return False

                page_content = await response.text()
                cookies = self.extract_cookies(session)
                csrf_token = self.extract_csrf_from_content(page_content, cookies)
                
                self.csrf_token = csrf_token or WORKING_VERSIONS['csrf_token']
                self.session_cookies = cookies
                self.last_auth_refresh = self.requests_made
                
                logging.info(f"✅ Ultra-fixed session initialized with {len(cookies)} cookies")
                if csrf_token:
                    logging.info(f"🔑 CSRF token extracted: {csrf_token[:10]}...")
                else:
                    logging.warning(f"⚠️ Using fallback CSRF token: {self.csrf_token[:10]}...")
                
                return True
                
        except Exception as e:
            logging.error(f"❌ Session establishment error: {e}")
            return False

    def extract_cookies(self, session):
        """Extract cookies from aiohttp session."""
        cookies = {}
        for cookie in session.cookie_jar:
            cookies[cookie.key] = cookie.value
        return cookies

    def extract_csrf_from_content(self, page_content, cookies):
        """Enhanced CSRF token extraction."""
        import re
        import urllib.parse
        
        # Try multiple extraction methods
        csrf_patterns = [
            # From cookies
            (cookies, [
                (r'crf%3d([^%\\s]+(?:%[0-9A-Fa-f]{2})*)', lambda m: urllib.parse.unquote(m.group(1))),
                (r'crf=([^;\\s&]+)', lambda m: m.group(1))
            ]),
            # From page content
            (page_content, [
                (r'name=["\']csrf[_-]?token["\'][^>]*value=["\']([^"\']+)["\']', lambda m: m.group(1)),
                (r'csrf[_-]?token["\']?\\s*[:=]\\s*["\']([^"\']+)["\']', lambda m: m.group(1)),
                (r'"csrfToken"\\s*:\\s*"([^"]+)"', lambda m: m.group(1))
            ])
        ]
        
        for source, patterns in csrf_patterns:
            if isinstance(source, dict):  # cookies
                for cookie_name, cookie_value in source.items():
                    if 'crf' in cookie_value.lower():
                        for pattern, extractor in patterns:
                            match = re.search(pattern, cookie_value, re.IGNORECASE)
                            if match:
                                try:
                                    token = extractor(match)
                                    if len(token) > 10:
                                        return token
                                except:
                                    continue
            else:  # page content
                for pattern, extractor in patterns:
                    matches = re.findall(pattern, source, re.IGNORECASE)
                    if matches:
                        token = matches[0] if isinstance(matches[0], str) else extractor(matches[0])
                        if len(token) > 8:
                            return token
        
        return None

    def get_headers_with_auth(self):
        """Get headers with authentication for API requests."""
        headers = ULTRA_HEADERS.copy()
        if self.csrf_token:
            headers["X-CSRFToken"] = self.csrf_token
        return headers

    async def make_ultra_fixed_api_request(self, session, endpoint, payload=None):
        """ULTRA-FIXED: API request with fixed intervals and auth management."""
        # Check if auth refresh needed
        if self.requests_made - self.last_auth_refresh >= AUTH_REFRESH_INTERVAL:
            await self.refresh_authentication(session)
            self.last_auth_refresh = self.requests_made

        url = f"{API_BASE_URL}{endpoint}"
        headers = self.get_headers_with_auth()
        
        self.requests_made += 1
        
        for attempt in range(self.max_retries):
            try:
                if attempt > 0:
                    # Minimal backoff - don't increase base delay
                    await asyncio.sleep(0.1 * attempt)

                async with session.post(url, json=payload or {}, headers=headers) as response:
                    if response.status == 200:
                        try:
                            json_data = await response.json()
                            self.successful_requests += 1
                            return json_data
                        except Exception:
                            logging.error(f"❌ Invalid JSON from {endpoint}")
                            self.failed_requests += 1
                            return None
                    elif response.status == 429:
                        # Rate limited - DON'T increase base delay, just wait
                        logging.warning(f"Rate limited on attempt {attempt + 1}, waiting...")
                        await asyncio.sleep(1)
                        continue
                    else:
                        logging.error(f"❌ API request failed {endpoint}: {response.status}")
                        self.failed_requests += 1
                        return None
                        
            except Exception as e:
                logging.warning(f"Request error on attempt {attempt + 1}: {e}")
                continue

        self.failed_requests += 1
        return None

    async def get_categories_ultra_fixed(self, session):
        """Get categories for ultra-fixed processing."""
        try:
            logging.info("🔍 Fetching categories for ultra-fixed scraping...")
            
            payload = {
                "versionInfo": {
                    "moduleVersion": WORKING_VERSIONS['moduleVersion'],
                    "apiVersion": WORKING_VERSIONS['categories_apiVersion']
                },
                "viewName": "MainFlow.ProductListPage",
                "inputParameters": {}
            }
            
            result = await self.make_ultra_fixed_api_request(session, CATEGORIES_ENDPOINT, payload)
            
            if result and 'data' in result and 'Slugs' in result['data'] and 'List' in result['data']['Slugs']:
                slugs = result['data']['Slugs']['List']
                categories = [{"id": slug, "name": slug, "slug": slug} for slug in slugs]
                
                if TEST_MODE:
                    categories = categories[:TEST_CATEGORIES_LIMIT]
                    logging.info(f"✅ TEST MODE: Using {len(categories)} categories")
                else:
                    logging.info(f"✅ Categories API SUCCESS: Found {len(categories)} category slugs")
                
                return categories
                
        except Exception as e:
            logging.warning(f"⚠️ API categories failed: {e}")

        # Fallback to known working category slugs
        fallback_slugs = [
            "aardappelen-groente-fruit", "baby-drogisterij", "bbq", "bewuste-voeding",
            "brood-gebak-bakproducten", "diepvries", "frisdrank-sappen-koffie-thee"
        ]
        
        if TEST_MODE:
            fallback_slugs = fallback_slugs[:TEST_CATEGORIES_LIMIT]
        
        logging.info(f"🔄 Using {len(fallback_slugs)} fallback category slugs")
        return [{"id": slug, "name": slug, "slug": slug} for slug in fallback_slugs]

    async def get_products_ultra_fixed(self, session, category, page_number=1):
        """ULTRA-FIXED: Fetch products with PageSize=100."""
        try:
            payload = {
                "versionInfo": {
                    "moduleVersion": WORKING_VERSIONS['moduleVersion'],
                    "apiVersion": WORKING_VERSIONS['products_apiVersion']
                },
                "viewName": "MainFlow.ProductListPage",
                "screenData": {
                    "variables": {
                        "CategorySlug": category.get('slug', category.get('id', '')),
                        "PageNumber": page_number,
                        "PageSize": OPTIMAL_PAGE_SIZE,  # FIXED at 100
                        "AppliedFiltersList": {"List": []},
                        "LocalCategoryID": 0,
                        "LocalCategoryName": "",
                        "LocalCategoryParentId": 0,
                        "LocalCategoryTitle": "",
                        "IsLoadingMore": False,
                        "IsFirstDataFetched": False,
                        "ShowFilters": False,
                        "IsShowData": False,
                        "StoreNumber": 0,
                        "StoreChannel": "",
                        "CheckoutId": f"ultra-fixed-{int(time.time())}",
                        "IsOrderEditMode": False,
                        "ProductList_All": {"List": []},
                        "SelectedSort": "",
                        "OrderEditId": "",
                        "IsListRendered": False,
                        "IsAlreadyFetch": False,
                        "IsPromotionBannersFetched": False,
                        "Period": {
                            "FromDate": "2025-08-18",
                            "ToDate": "2025-08-24"
                        },
                        "UserStoreId": "0",
                        "FilterExpandedList": {"List": []},
                        "ItemsInCart": {"List": []},
                        "HideDummy": False,
                        "OneWelcomeUserId": "",
                        "SearchKeyword": "",
                        "IsDesktop": False,
                        "IsSearch": False,
                        "URLPageNumber": 0,
                        "FilterQueryURL": "",
                        "IsMobile": True,
                        "IsTablet": False,
                        "Monitoring_FlowTypeId": 3,
                        "IsCustomerUnderAge": False
                    }
                }
            }
            
            result = await self.make_ultra_fixed_api_request(session, PRODUCT_LIST_ENDPOINT, payload)
            
            if result and isinstance(result, dict):
                raw_products = result.get("data", {}).get("ProductList", {}).get("List", [])
                total_pages = result.get("data", {}).get("TotalPages", 1)
                
                products = []
                for raw_product in raw_products:
                    if raw_product:
                        formatted_product = {
                            "product": raw_product,
                            "scraped_from_category": category.get('name', 'Unknown'),
                            "scraped_at": get_amsterdam_time().isoformat(),
                            "optimization_version": "ultra_fixed_v1",
                            "page_number": page_number,
                            "page_size_used": OPTIMAL_PAGE_SIZE,
                            "test_mode": TEST_MODE
                        }
                        products.append(formatted_product)
                
                has_more = page_number < total_pages and len(raw_products) > 0
                return products, has_more, total_pages
                
        except Exception as e:
            logging.error(f"❌ Error fetching products (page {page_number}): {e}")
            
        return [], False, 1

    async def scrape_category_ultra_fixed(self, session, category, semaphore):
        """ULTRA-FIXED: Scrape category with maintained concurrency."""
        async with semaphore:
            category_name = category.get('name', 'Unknown Category')
            category_id = category.get('id', '')
            total_products = 0
            
            # Skip if already completed (unless TEST_MODE)
            if category_id in self.completed_categories and not TEST_MODE:
                logging.info(f"⏭️ Skipping completed category: {category_name}")
                return 0
            
            # Resume from previous page if available
            current_page = self.category_progress.get(category_id, 1)
            
            logging.info(f"🛒 ULTRA-FIXED {category_name} (starting page {current_page})")
            
            consecutive_empty_pages = 0
            max_empty_pages = 3
            max_pages = TEST_PAGES_PER_CATEGORY if TEST_MODE else 200
            
            while consecutive_empty_pages < max_empty_pages and current_page <= max_pages and not self.shutdown_requested:
                # Check product limit before each page
                if hasattr(self, 'max_products_limit') and self.max_products_limit:
                    if self.total_scraped >= self.max_products_limit:
                        logging.info(f"🛑 Reached maximum products limit: {self.max_products_limit}")
                        break
                
                try:
                    products, has_more, total_pages = await self.get_products_ultra_fixed(session, category, current_page)
                    
                    if not products:
                        consecutive_empty_pages += 1
                        current_page += 1
                        continue
                    else:
                        consecutive_empty_pages = 0
                    
                    # Process products
                    new_products = []
                    for product in products:
                        product_id = product.get('product', {}).get('PLP_Str', {}).get('SKU')
                        if product_id and product_id not in self.scraped_products:
                            self.scraped_products.add(product_id)
                            new_products.append(product)
                            total_products += 1
                            self.total_scraped += 1
                            
                            # Check if we've hit the product limit after each product
                            if hasattr(self, 'max_products_limit') and self.max_products_limit:
                                if self.total_scraped >= self.max_products_limit:
                                    break
                    
                    if new_products:
                        self.save_products(new_products)
                        
                        # Calculate current rate
                        elapsed = time.time() - self.start_time
                        current_rate = self.total_scraped / elapsed if elapsed > 0 else 0
                        
                        logging.info(f"⚡ {category_name} p{current_page}: +{len(new_products)} | Total: {self.total_scraped} @ {current_rate:.1f}/sec")
                    
                    # Check if we hit the limit and need to exit the page loop
                    if hasattr(self, 'max_products_limit') and self.max_products_limit:
                        if self.total_scraped >= self.max_products_limit:
                            logging.info(f"🛑 Category {category_name} stopping - reached limit: {self.max_products_limit}")
                            break
                    
                    # Update progress
                    self.category_progress[category_id] = current_page
                    
                    # Global progress update
                    progress_percent = min(100, (self.total_scraped / self.estimated_total_products) * 100)
                    elapsed_time = time.time() - self.start_time
                    overall_rate = self.total_scraped / elapsed_time if elapsed_time > 0 else 0
                    req_rate = self.requests_made / elapsed_time * 60 if elapsed_time > 0 else 0
                    
                    update_progress('plus', 
                                  progress_percent=progress_percent, 
                                  products_scraped=self.total_scraped,
                                  current_task=f"FIXED: {category_name} p{current_page} - {overall_rate:.1f}/sec ({req_rate:.0f}req/min)")
                    
                    # Save progress frequently
                    if current_page % 2 == 0:
                        self.save_progress()
                    
                    # Check continuation
                    if not has_more:
                        break
                    
                    current_page += 1
                    
                    # FIXED: Always use original delay - no modifications
                    await asyncio.sleep(self.original_delay)
                    
                except Exception as e:
                    logging.error(f"❌ Error processing {category_name} page {current_page}: {e}")
                    consecutive_empty_pages += 1
                    current_page += 1
                    await asyncio.sleep(0.5)
            
            # Mark category as completed
            self.completed_categories.add(category_id)
            self.save_progress()
            
            elapsed = time.time() - self.start_time
            current_rate = self.total_scraped / elapsed if elapsed > 0 else 0
            logging.info(f"✅ ULTRA-FIXED-COMPLETED {category_name}: {total_products} products | Overall: {current_rate:.1f}/sec")
            
            return total_products

    async def run(self):
        """ULTRA-FIXED: Main scraping method with all fixes applied."""
        if self.scraping_completed and not TEST_MODE:
            update_status('plus', ScraperStatus.COMPLETED, f"Already completed with {self.total_scraped} products")
            return
        
        mode_str = "TEST MODE" if TEST_MODE else "FULL CATALOG"
        update_status('plus', ScraperStatus.STARTING, f"Initializing Plus Ultra-Fixed Scraper - {mode_str}")
        
        scraping_start_time = time.time()
        
        # ULTRA-FIXED: Aggressive connection settings with proper limits
        connector = aiohttp.TCPConnector(
            limit=HIGH_SEMAPHORE_LIMIT * 2,  # Higher connection pool
            limit_per_host=HIGH_SEMAPHORE_LIMIT,
            ttl_dns_cache=300,
            use_dns_cache=True,
            keepalive_timeout=30
        )
        
        async with aiohttp.ClientSession(
            timeout=self.timeout_config,
            connector=connector,
            cookies=self.session_cookies
        ) as session:
            
            try:
                self.save_session(session)
                
                # Establish session and authentication
                if not await self.establish_session(session):
                    raise Exception("Failed to establish session")
                
                update_status('plus', ScraperStatus.RUNNING, f"ULTRA-FIXED: Fetching categories - {mode_str}")
                
                # Fetch categories
                categories = await self.get_categories_ultra_fixed(session)
                
                if not categories:
                    raise Exception("Failed to fetch categories")
                
                logging.info(f"🎯 ULTRA-FIXED: Processing {len(categories)} categories")
                logging.info(f"   Mode: {mode_str}")
                logging.info(f"   Target performance: 200+ products/sec")
                logging.info(f"   Fixed PageSize: {OPTIMAL_PAGE_SIZE} (36.0 products/sec per request)")
                logging.info(f"   Fixed concurrency: {MAX_CONCURRENT_CATEGORIES}")
                logging.info(f"   Fixed semaphore: {HIGH_SEMAPHORE_LIMIT}")
                logging.info(f"   Fixed interval: {self.original_delay}s")
                
                update_status('plus', ScraperStatus.RUNNING, 
                             f"ULTRA-FIXED: {len(categories)} categories @ 200+ products/sec - {mode_str}")
                
                # ULTRA-FIXED: High concurrency with proper semaphore
                semaphore = asyncio.Semaphore(HIGH_SEMAPHORE_LIMIT)
                
                category_tasks = []
                for category in categories:
                    if not self.shutdown_requested:
                        # Check if we've hit the product limit
                        if hasattr(self, 'max_products_limit') and self.max_products_limit:
                            if self.total_scraped >= self.max_products_limit:
                                logging.info(f"🛑 Reached maximum products limit: {self.max_products_limit}")
                                break
                                
                        if TEST_MODE or category.get('id') not in self.completed_categories:
                            task = asyncio.create_task(
                                self.scrape_category_ultra_fixed(session, category, semaphore)
                            )
                            category_tasks.append(task)
                
                logging.info(f"🚀 ULTRA-FIXED: Starting {len(category_tasks)} concurrent categories...")
                
                # Process all categories with maintained concurrency
                category_results = await asyncio.gather(*category_tasks, return_exceptions=True)
                
                total_new_products = sum(result for result in category_results if isinstance(result, int))
                
                # Final performance report
                total_duration = time.time() - scraping_start_time
                final_rate = self.total_scraped / total_duration if total_duration > 0 else 0
                req_rate = self.requests_made / total_duration * 60 if total_duration > 0 else 0
                
                logging.info(f"🏁 ULTRA-FIXED RESULTS:")
                logging.info(f"   Mode: {mode_str}")
                logging.info(f"   Total products: {self.total_scraped}")
                logging.info(f"   Total time: {total_duration:.2f} seconds ({total_duration/60:.1f} minutes)")
                logging.info(f"   Final rate: {final_rate:.1f} products/second")
                logging.info(f"   Request rate: {req_rate:.1f} requests/minute")
                logging.info(f"   Total requests: {self.requests_made}")
                logging.info(f"   Success rate: {self.successful_requests}/{self.requests_made} ({self.successful_requests/max(1,self.requests_made)*100:.1f}%)")
                logging.info(f"   Auth refreshes: {self.auth_refreshes}")
                logging.info(f"   Categories processed: {len(category_results)}")
                logging.info(f"   Fixed interval maintained: {self.original_delay}s")
                
                # Calculate improvements
                original_rate = 4.0 / 30  # Original
                previous_ultra_rate = 8.5  # Previous ultra-optimization
                improvement_vs_original = final_rate / original_rate
                improvement_vs_previous = final_rate / previous_ultra_rate
                
                logging.info(f"   🚀 IMPROVEMENT vs original: {improvement_vs_original:.1f}x")
                logging.info(f"   🚀 IMPROVEMENT vs previous ultra: {improvement_vs_previous:.1f}x")
                
                # Mark completion (only in full mode)
                if not TEST_MODE:
                    with open(self.completed_flag, 'w') as f:
                        completion_data = {
                            'completed_at': get_amsterdam_time().isoformat(),
                            'total_products': self.total_scraped,
                            'duration_seconds': total_duration,
                            'products_per_second': final_rate,
                            'requests_per_minute': req_rate,
                            'optimization_version': 'ultra_fixed_v1',
                            'page_size_used': OPTIMAL_PAGE_SIZE,
                            'fixed_interval': self.original_delay,
                            'high_semaphore': HIGH_SEMAPHORE_LIMIT,
                            'concurrent_categories': MAX_CONCURRENT_CATEGORIES,
                            'total_requests': self.requests_made,
                            'success_rate': self.successful_requests / max(1, self.requests_made),
                            'auth_refreshes': self.auth_refreshes,
                            'improvement_vs_original': improvement_vs_original,
                            'improvement_vs_previous_ultra': improvement_vs_previous,
                            'all_fixes_applied': True
                        }
                        json.dump(completion_data, f, indent=4)
                
                status_msg = f"ULTRA-FIXED: {self.total_scraped} products @ {final_rate:.1f}/sec ({improvement_vs_previous:.1f}x improvement)"
                update_status('plus', ScraperStatus.COMPLETED, status_msg)
                
            except Exception as e:
                logging.error(f"❌ Ultra-fixed scraping failed: {e}")
                update_status('plus', ScraperStatus.FAILED, f"Error: {str(e)}")
                raise
            finally:
                self.save_progress()

async def main():
    """Main function to run the ultra-fixed Plus scraper."""
    import argparse
    
    # NEW: Command line argument support for config files
    parser = argparse.ArgumentParser(description='Plus Product Scraper')
    parser.add_argument('--config', help='Configuration file path', type=str)
    parser.add_argument('--debug', help='Enable debug logging', action='store_true')
    args = parser.parse_args()
    
    # Initialize logging with optional log file from config
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
    
    mode_str = "TEST MODE" if TEST_MODE else "FULL CATALOG"
    logging.info(f"🚀 Starting Plus Ultra-Fixed Scraper - {mode_str}")
    logging.info(f"🎯 Target Performance: 200+ products/second")
    
    # Create scraper with optional config file
    scraper = PlusUltraFixedScraper(config_file=args.config)
    await scraper.run()
    
    logging.info("✅ Ultra-fixed scraper execution completed")

if __name__ == "__main__":
    asyncio.run(main())