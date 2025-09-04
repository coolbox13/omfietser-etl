#!/usr/bin/env python3
"""
Aldi Scraper API Service
========================
FastAPI wrapper for the optimized Aldi scraper.
Provides job management, progress monitoring, and result endpoints.
"""

import asyncio
import json
import os
import logging
import subprocess
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
import signal

from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
import requests
from contextlib import asynccontextmanager

# Progress monitoring imports
sys.path.append('/app')
try:
    from progress_monitor import update_status, update_progress, ScraperStatus, get_amsterdam_time
    from config_utils import get_output_directory
except ImportError:
    # Fallback implementations for container deployment
    class ScraperStatus:
        STARTING = "starting"
        RUNNING = "running" 
        COMPLETED = "completed"
        FAILED = "failed"
        INTERRUPTED = "interrupted"
    
    def update_status(scraper_name, status, message=""):
        logging.info(f"Status: {scraper_name} - {status} - {message}")
    
    def update_progress(scraper_name, **kwargs):
        logging.info(f"Progress: {scraper_name} - {kwargs}")
    
    def get_amsterdam_time():
        return datetime.now()
    
    def get_output_directory():
        return "/app/results"

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("/app/logs/api.log", mode='a'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("scraper_api")

# Startup/shutdown event handlers
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🚀 Starting Aldi Scraper API Service...")
    
    # Create necessary directories
    os.makedirs("/app/jobs", exist_ok=True)
    os.makedirs("/app/results", exist_ok=True)
    os.makedirs("/app/logs", exist_ok=True)
    os.makedirs("/app/shared-data", exist_ok=True)
    
    # Record startup time
    app.state.startup_time = time.time()
    
    update_status('aldi', ScraperStatus.STARTING, "API service initializing...")
    logger.info("✅ Aldi Scraper API Service started successfully")
    yield
    
    # Shutdown
    logger.info("🛑 Shutting down scraper service...")
    
    # Terminate any running jobs
    for job_id, process in job_processes.items():
        if process and process.poll() is None:
            logger.info(f"Terminating job {job_id}")
            try:
                process.terminate()
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
            except Exception as e:
                logger.error(f"Error terminating job {job_id}: {e}")
    
    logger.info("✅ Shutdown complete")

# Create FastAPI app
app = FastAPI(
    title="Aldi Scraper API",
    description="Ultra-optimized Aldi scraper with job management and progress monitoring",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Configuration
MAX_CONCURRENT_JOBS = int(os.getenv('MAX_CONCURRENT_JOBS', '3'))

# Global variables for job management
active_jobs: Dict[str, Dict] = {}
completed_jobs: Dict[str, Dict] = {}
job_processes: Dict[str, subprocess.Popen] = {}

class ScrapeConfig(BaseModel):
    max_products: Optional[int] = Field(None, description="Maximum number of products to scrape")
    categories_limit: Optional[int] = Field(None, description="Maximum number of categories to scrape")
    webhook_url: Optional[str] = Field(None, description="Webhook URL for completion notifications")
    priority: str = Field("normal", description="Job priority")
    notify_on_complete: bool = Field(True, description="Send notification when complete")

class JobResponse(BaseModel):
    job_id: str
    status: str
    message: str


@app.get("/", response_model=Dict[str, Any])
async def root():
    """API information endpoint"""
    return {
        "name": "Aldi Scraper API",
        "version": "2.0.0",
        "description": "Production-ready API for Aldi supermarket scraping with N8N integration",
        "docs_url": "/docs",
        "health_url": "/health",
        "endpoints": {
            "scrape": "POST /scrape - Start scraping job",
            "progress": "GET /progress - Get scraping progress",
            "jobs": "GET /jobs - List all jobs",
            "job_status": "GET /jobs/{id} - Get job status",
            "job_results": "GET /results/{id} - Get job results",
            "stats": "GET /stats - Get service statistics"
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "aldi-scraper-api",
        "version": "2.0.0",
        "timestamp": get_amsterdam_time().isoformat(),
        "active_jobs": len(active_jobs),
        "total_jobs": len(active_jobs) + len(completed_jobs)
    }

@app.get("/progress")
async def get_progress_summary():
    """Get clean progress summary for N8N monitoring (without product lists)"""
    try:
        if not active_jobs:
            return {
                "scraper_name": "aldi",
                "status": "idle",
                "active_jobs": 0,
                "total_jobs": len(completed_jobs),
                "message": "No scraping jobs currently running"
            }
        
        # Get status of most recent active job
        latest_job = list(active_jobs.values())[-1]
        job_id = latest_job['job_id']
        
        # Try to read progress from job progress file
        progress_file = f"/app/jobs/{job_id}_progress.json"
        current_progress = {}
        
        if os.path.exists(progress_file):
            try:
                with open(progress_file, 'r') as f:
                    progress_data = json.load(f)
                    current_progress = {
                        "products_scraped": progress_data.get('total_scraped_items', 0),
                        "categories_completed": progress_data.get('categories_completed', 0),
                        "progress_percent": progress_data.get('progress_percent', 0),
                        "current_task": progress_data.get('current_task', 'Processing...'),
                        "timestamp": progress_data.get('timestamp_amsterdam', get_amsterdam_time().strftime('%Y-%m-%d %H:%M:%S CET'))
                    }
            except (json.JSONDecodeError, KeyError) as e:
                logger.warning(f"Could not read progress for job {job_id}: {e}")
        
        return {
            "scraper_name": "aldi",
            "status": "running",
            "active_jobs": len(active_jobs),
            "total_jobs": len(active_jobs) + len(completed_jobs),
            "current_job": {
                "job_id": job_id,
                "started_at": latest_job.get('started_at'),
                **current_progress
            },
            "message": f"Aldi scraping in progress: {current_progress.get('products_scraped', 0)} products scraped"
        }
        
    except Exception as e:
        logger.error(f"Error getting progress summary: {e}")
        return {
            "scraper_name": "aldi",
            "status": "error",
            "active_jobs": len(active_jobs),
            "total_jobs": len(completed_jobs),
            "message": f"Error getting progress: {str(e)}"
        }

@app.post("/scrape", response_model=JobResponse)
async def start_scraping(config: ScrapeConfig, background_tasks: BackgroundTasks):
    """Start a new Aldi scraping job"""
    
    # Generate unique job ID
    job_id = f"aldi_scrape_{uuid.uuid4().hex[:8]}_{int(time.time())}"
    
    try:
        # Create job configuration
        job_config = {
            "job_id": job_id,
            "max_products": config.max_products,
            "categories_limit": config.categories_limit,
            "output_file": f"/app/results/{job_id}_products.json",
            "progress_file": f"/app/jobs/{job_id}_progress.json",
            "complete_flag": f"/app/jobs/{job_id}_complete.flag",
            "log_file": f"/app/logs/{job_id}.log",
            "webhook_url": config.webhook_url
        }
        
        # Save job configuration
        config_file = f"/app/jobs/{job_id}_config.json"
        with open(config_file, 'w') as f:
            json.dump(job_config, f, indent=4)
        
        # Add to active jobs
        active_jobs[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "created_at": get_amsterdam_time().isoformat(),
            "started_at": None,
            "config": job_config
        }
        
        logger.info(f"Created new scraping job: {job_id}")
        
        # Start background scraping task
        background_tasks.add_task(run_scraper_subprocess, job_id, config_file)
        
        return JobResponse(
            job_id=job_id,
            status="queued",
            message=f"Scraping job {job_id} started. Monitor progress at /progress"
        )
        
    except Exception as e:
        logger.error(f"Error starting scraping job: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start scraping job: {str(e)}")

async def run_scraper_subprocess(job_id: str, config_file: str):
    """Run the Plus scraper as a subprocess"""
    try:
        # Update job status
        if job_id in active_jobs:
            active_jobs[job_id]["status"] = "running"
            active_jobs[job_id]["started_at"] = get_amsterdam_time().isoformat()
        
        logger.info(f"Starting scraper subprocess for job {job_id}")
        
        # Run scraper subprocess
        cmd = [sys.executable, "/app/aldi_scraper.py", "--config", config_file]
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd="/app"
        )
        
        job_processes[job_id] = process
        
        # Wait for completion
        stdout, stderr = process.communicate()
        
        if process.returncode == 0:
            logger.info(f"Job {job_id} completed successfully")
            
            # Move to completed jobs
            if job_id in active_jobs:
                completed_job = active_jobs.pop(job_id)
                completed_job["status"] = "completed" 
                completed_job["completed_at"] = get_amsterdam_time().isoformat()
                completed_jobs[job_id] = completed_job
            
            # Send webhook notification if configured
            webhook_url = completed_jobs.get(job_id, {}).get("config", {}).get("webhook_url")
            if webhook_url:
                try:
                    # Prepare comprehensive webhook payload matching AH/Jumbo pattern
                    payload = {
                        "job_id": job_id,
                        "status": "completed",
                        "scraper": "aldi",
                        "completed_at": completed_jobs[job_id]["completed_at"],
                        "duration_seconds": None,
                        "products_scraped": None,
                        "webhook_sent_at": get_amsterdam_time().isoformat()
                    }
                    
                    # Calculate duration if both timestamps exist
                    job_data = completed_jobs.get(job_id, {})
                    if job_data.get("created_at"):
                        try:
                            from datetime import datetime
                            start_time = datetime.fromisoformat(job_data["created_at"].replace('Z', '+00:00'))
                            end_time = datetime.fromisoformat(job_data["completed_at"].replace('Z', '+00:00'))
                            payload["duration_seconds"] = (end_time - start_time).total_seconds()
                        except Exception as e:
                            logger.warning(f"Could not calculate duration for job {job_id}: {e}")
                    
                    # Try to get product count from results file
                    try:
                        results_file = f"/app/results/{job_id}_products.json"
                        if os.path.exists(results_file):
                            with open(results_file, 'r') as f:
                                results = json.load(f)
                                if isinstance(results, list):
                                    payload["products_scraped"] = len(results)
                                elif isinstance(results, dict):
                                    payload["products_scraped"] = results.get("total_products", 0)
                    except Exception as e:
                        logger.warning(f"Could not determine product count for job {job_id}: {e}")
                    
                    # Send webhook with proper timeout
                    response = requests.post(webhook_url, json=payload, timeout=30)
                    if response.status_code == 200:
                        logger.info(f"Webhook notification sent successfully for job {job_id}")
                    else:
                        logger.warning(f"Webhook returned status {response.status_code} for job {job_id}")
                        
                except Exception as e:
                    logger.error(f"Failed to send webhook for job {job_id}: {e}")
            
        else:
            logger.error(f"Job {job_id} failed with return code {process.returncode}")
            logger.error(f"STDERR: {stderr}")
            
            # Move to completed with failed status
            if job_id in active_jobs:
                failed_job = active_jobs.pop(job_id)
                failed_job["status"] = "failed"
                failed_job["error"] = stderr
                failed_job["completed_at"] = get_amsterdam_time().isoformat()
                completed_jobs[job_id] = failed_job
                
    except Exception as e:
        logger.error(f"Exception in job {job_id}: {e}")
        
        # Move to completed with error status
        if job_id in active_jobs:
            error_job = active_jobs.pop(job_id)
            error_job["status"] = "failed"
            error_job["error"] = str(e)
            error_job["completed_at"] = get_amsterdam_time().isoformat()  
            completed_jobs[job_id] = error_job
            
    finally:
        # Cleanup
        if job_id in job_processes:
            job_processes.pop(job_id)
        logger.info(f"Cleaned up job {job_id}")

@app.get("/jobs")
async def list_jobs():
    """List all jobs"""
    return {
        "active_jobs": active_jobs,
        "completed_jobs": completed_jobs,
        "total_active": len(active_jobs),
        "total_completed": len(completed_jobs)
    }

@app.get("/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Get specific job status"""
    
    # Check active jobs first
    if job_id in active_jobs:
        return active_jobs[job_id]
    
    # Check completed jobs
    if job_id in completed_jobs:
        return completed_jobs[job_id]
    
    raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

@app.delete("/jobs/{job_id}")
async def cancel_job(job_id: str):
    """Cancel a running job"""
    
    if job_id not in active_jobs:
        raise HTTPException(status_code=404, detail=f"Active job {job_id} not found")
    
    # Terminate process if exists
    if job_id in job_processes:
        process = job_processes[job_id]
        if process and process.poll() is None:
            try:
                process.terminate()
                process.wait(timeout=5)
                logger.info(f"Terminated job {job_id}")
            except subprocess.TimeoutExpired:
                process.kill()
                logger.info(f"Killed job {job_id}")
            except Exception as e:
                logger.error(f"Error terminating job {job_id}: {e}")
    
    # Move to completed with cancelled status
    if job_id in active_jobs:
        cancelled_job = active_jobs.pop(job_id)
        cancelled_job["status"] = "cancelled"
        cancelled_job["completed_at"] = get_amsterdam_time().isoformat()
        completed_jobs[job_id] = cancelled_job
    
    return {"message": f"Job {job_id} cancelled"}

@app.get("/results/{job_id}")
async def get_job_results(job_id: str):
    """Get results for a completed job"""
    
    # Check if job exists
    if job_id not in completed_jobs and job_id not in active_jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    # Check for results file
    results_file = f"/app/results/{job_id}_products.json"
    if not os.path.exists(results_file):
        raise HTTPException(status_code=404, detail=f"Results not found for job {job_id}")
    
    try:
        with open(results_file, 'r') as f:
            results = json.load(f)
        
        return {
            "job_id": job_id,
            "product_count": len(results) if isinstance(results, list) else 0,
            "products": results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading results: {str(e)}")

@app.get("/stats")
async def get_service_stats():
    """Get service statistics"""
    stats = {
        "total_jobs": len(active_jobs),
        "active_jobs": len([job for job in active_jobs.values() if job.get("status") == "running"]),
        "max_concurrent_jobs": MAX_CONCURRENT_JOBS,
        "uptime_seconds": time.time() - getattr(app.state, 'startup_time', time.time()),
        "jobs_by_status": {}
    }
    
    # Count jobs by status
    for job in active_jobs.values():
        status = job.get("status", "unknown")
        stats["jobs_by_status"][status] = stats["jobs_by_status"].get(status, 0) + 1
    
    return stats

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)