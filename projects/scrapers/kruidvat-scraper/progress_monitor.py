#!/usr/bin/env python3
"""
Progress Monitor - Simplified for Container Deployment
Provides basic progress tracking functionality for the AH scraper
"""

import json
import os
import time
from datetime import datetime, timezone
from enum import Enum

class ScraperStatus(Enum):
    """Enumeration of possible scraper statuses"""
    STARTING = "starting"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    INTERRUPTED = "interrupted"
    CANCELLED = "cancelled"

def get_amsterdam_time():
    """Get current time in Amsterdam timezone"""
    # Simplified - just return UTC time with CET label for container deployment
    return datetime.now(timezone.utc)

def update_status(scraper_name: str, status: ScraperStatus, message: str = ""):
    """Update the status of a scraper"""
    try:
        status_data = {
            "scraper_name": scraper_name,
            "status": status.value if isinstance(status, ScraperStatus) else str(status),
            "message": message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "timestamp_amsterdam": get_amsterdam_time().strftime('%Y-%m-%d %H:%M:%S CET')
        }
        
        # Write to status file for monitoring
        status_file = f"/app/jobs/{scraper_name}_status.json"
        os.makedirs(os.path.dirname(status_file), exist_ok=True)
        
        with open(status_file, "w") as f:
            json.dump(status_data, f, indent=2)
        
        # Also log to console
        print(f"[STATUS] {scraper_name}: {status_data['status']} - {message}")
        
    except Exception as e:
        print(f"Error updating status for {scraper_name}: {e}")

def update_progress(scraper_name: str, **kwargs):
    """Update the progress of a scraper with arbitrary progress data"""
    try:
        progress_data = {
            "scraper_name": scraper_name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "timestamp_amsterdam": get_amsterdam_time().strftime('%Y-%m-%d %H:%M:%S CET'),
            **kwargs  # Include all provided progress data
        }
        
        # Write to progress file for monitoring
        progress_file = f"/app/jobs/{scraper_name}_live_progress.json"
        os.makedirs(os.path.dirname(progress_file), exist_ok=True)
        
        with open(progress_file, "w") as f:
            json.dump(progress_data, f, indent=2)
        
        # Log key progress metrics
        if 'progress_percent' in kwargs:
            print(f"[PROGRESS] {scraper_name}: {kwargs['progress_percent']:.1f}% complete")
        
        if 'products_scraped' in kwargs:
            print(f"[PROGRESS] {scraper_name}: {kwargs['products_scraped']} products scraped")
        
    except Exception as e:
        print(f"Error updating progress for {scraper_name}: {e}")

def get_scraper_status(scraper_name: str):
    """Get the current status of a scraper"""
    try:
        status_file = f"/app/jobs/{scraper_name}_status.json"
        if os.path.exists(status_file):
            with open(status_file, "r") as f:
                return json.load(f)
        return None
    except Exception as e:
        print(f"Error getting status for {scraper_name}: {e}")
        return None

def get_scraper_progress(scraper_name: str):
    """Get the current progress of a scraper"""
    try:
        progress_file = f"/app/jobs/{scraper_name}_live_progress.json"
        if os.path.exists(progress_file):
            with open(progress_file, "r") as f:
                return json.load(f)
        return None
    except Exception as e:
        print(f"Error getting progress for {scraper_name}: {e}")
        return None

def cleanup_scraper_files(scraper_name: str):
    """Clean up status and progress files for a scraper"""
    try:
        status_file = f"/app/jobs/{scraper_name}_status.json"
        progress_file = f"/app/jobs/{scraper_name}_live_progress.json"
        
        for file_path in [status_file, progress_file]:
            if os.path.exists(file_path):
                os.remove(file_path)
                print(f"Cleaned up {file_path}")
        
    except Exception as e:
        print(f"Error cleaning up files for {scraper_name}: {e}")

# Legacy compatibility for existing scraper code
def initialize_monitoring():
    """Initialize monitoring system (placeholder for compatibility)"""
    print("Progress monitoring initialized")

def shutdown_monitoring():
    """Shutdown monitoring system (placeholder for compatibility)"""
    print("Progress monitoring shutdown")
