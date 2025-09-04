#!/usr/bin/env python3
"""
Configuration Utilities - Simplified for Container Deployment
Provides configuration management for the AH scraper service
"""

import os
import json
from pathlib import Path

def get_output_directory():
    """Get the configured output directory for scraper results"""
    # Environment-aware path selection
    if os.path.exists('/app'):
        # Container environment
        output_dir = os.getenv("OUTPUT_DIR", "/app/results")
    else:
        # Local environment
        base_dir = os.path.dirname(os.path.abspath(__file__))
        output_dir = os.getenv("OUTPUT_DIR", os.path.join(base_dir, "results"))
    
    # Ensure directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    return output_dir

def get_jobs_directory():
    """Get the directory for job files"""
    # Environment-aware path selection
    if os.path.exists('/app'):
        jobs_dir = os.getenv("JOBS_DIR", "/app/jobs")
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        jobs_dir = os.getenv("JOBS_DIR", os.path.join(base_dir, "jobs"))
    
    # Ensure directory exists
    os.makedirs(jobs_dir, exist_ok=True)
    
    return jobs_dir

def get_logs_directory():
    """Get the directory for log files"""
    # Environment-aware path selection
    if os.path.exists('/app'):
        logs_dir = os.getenv("LOGS_DIR", "/app/logs")
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        logs_dir = os.getenv("LOGS_DIR", os.path.join(base_dir, "logs"))
    
    # Ensure directory exists
    os.makedirs(logs_dir, exist_ok=True)
    
    return logs_dir

def load_scraper_config(config_file_path=None):
    """Load scraper configuration from file or environment"""
    config = {
        # Default configuration
        "max_retries": 3,
        "base_delay": 1.0,
        "timeout_seconds": 30,
        "page_size": 750,
        "rate_limit_delay": 0.2,
        
        # Paths
        "output_directory": get_output_directory(),
        "jobs_directory": get_jobs_directory(),
        "logs_directory": get_logs_directory(),
        
        # API settings
        "api_base_url": "https://api.ah.nl/mobile-services",
        "auth_url": "https://api.ah.nl/mobile-auth/v1/auth/token/anonymous",
        
        # Headers
        "headers": {
            'Host': 'api.ah.nl',
            'x-application': 'AHWEBSHOP',
            'user-agent': 'AHBot/1.0',
            'content-type': 'application/json; charset=UTF-8',
        },
        
        # Excluded categories
        "excluded_categories": {
            "20603": "AH Voordeelshop"  # Hardware/non-food items
        }
    }
    
    # Override with environment variables
    if os.getenv("MAX_RETRIES"):
        config["max_retries"] = int(os.getenv("MAX_RETRIES"))
    
    if os.getenv("TIMEOUT_SECONDS"):
        config["timeout_seconds"] = int(os.getenv("TIMEOUT_SECONDS"))
    
    # Load from config file if provided
    if config_file_path and os.path.exists(config_file_path):
        try:
            with open(config_file_path, 'r') as f:
                file_config = json.load(f)
            
            # Merge file config with defaults
            config.update(file_config)
            
        except Exception as e:
            print(f"Warning: Could not load config file {config_file_path}: {e}")
    
    return config

def save_job_config(job_id, config_data, jobs_dir=None):
    """Save job-specific configuration"""
    if not jobs_dir:
        jobs_dir = get_jobs_directory()
    
    config_file = os.path.join(jobs_dir, f"{job_id}_config.json")
    
    try:
        with open(config_file, 'w') as f:
            json.dump(config_data, f, indent=2)
        
        return config_file
    
    except Exception as e:
        print(f"Error saving job config for {job_id}: {e}")
        return None

def load_job_config(job_id, jobs_dir=None):
    """Load job-specific configuration"""
    if not jobs_dir:
        jobs_dir = get_jobs_directory()
    
    config_file = os.path.join(jobs_dir, f"{job_id}_config.json")
    
    try:
        if os.path.exists(config_file):
            with open(config_file, 'r') as f:
                return json.load(f)
        return None
    
    except Exception as e:
        print(f"Error loading job config for {job_id}: {e}")
        return None

def get_data_paths(job_id=None):
    """Get standard data paths for a job or general use"""
    base_paths = {
        "output_dir": get_output_directory(),
        "jobs_dir": get_jobs_directory(),
        "logs_dir": get_logs_directory()
    }
    
    if job_id:
        # Job-specific paths
        base_paths.update({
            "output_file": os.path.join(base_paths["output_dir"], f"{job_id}_products.json"),
            "progress_file": os.path.join(base_paths["jobs_dir"], f"{job_id}_progress.json"),
            "config_file": os.path.join(base_paths["jobs_dir"], f"{job_id}_config.json"),
            "complete_flag": os.path.join(base_paths["jobs_dir"], f"{job_id}_complete.flag"),
            "log_file": os.path.join(base_paths["logs_dir"], f"{job_id}.log")
        })
    
    return base_paths

def ensure_directories():
    """Ensure all required directories exist"""
    directories = [
        get_output_directory(),
        get_jobs_directory(),
        get_logs_directory()
    ]
    
    for directory in directories:
        os.makedirs(directory, exist_ok=True)
        print(f"Ensured directory exists: {directory}")

def cleanup_old_jobs(max_age_days=7):
    """Clean up old job files"""
    import time
    
    jobs_dir = get_jobs_directory()
    logs_dir = get_logs_directory()
    current_time = time.time()
    max_age_seconds = max_age_days * 24 * 60 * 60
    
    cleaned_files = 0
    
    for directory in [jobs_dir, logs_dir]:
        if not os.path.exists(directory):
            continue
        
        for filename in os.listdir(directory):
            file_path = os.path.join(directory, filename)
            
            if os.path.isfile(file_path):
                file_age = current_time - os.path.getmtime(file_path)
                
                if file_age > max_age_seconds:
                    try:
                        os.remove(file_path)
                        cleaned_files += 1
                        print(f"Cleaned up old file: {file_path}")
                    except Exception as e:
                        print(f"Error cleaning up {file_path}: {e}")
    
    print(f"Cleaned up {cleaned_files} old files")
    return cleaned_files

# Environment detection
def is_docker_environment():
    """Detect if running in Docker container"""
    return os.path.exists('/.dockerenv') or os.getenv('DOCKER_CONTAINER') == 'true'

def is_development_mode():
    """Detect if running in development mode"""
    return os.getenv('DEV_MODE', 'false').lower() == 'true'

# Legacy compatibility
def get_config():
    """Legacy function for backward compatibility"""
    return load_scraper_config()
