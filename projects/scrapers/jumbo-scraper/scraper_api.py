#!/usr/bin/env python3
"""
FastAPI Jumbo Scraper Service - Production Ready
Wraps the sophisticated Jumbo scraper with a modern REST API
Designed for Docker container deployment with N8N integration
"""

from fastapi import FastAPI, BackgroundTasks, HTTPException, Query, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Any, Union
import asyncio
import json
import os
import subprocess
import time
import threading
import uuid
import logging
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from pathlib import Path

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("/app/logs/api.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Global state management
scraper_jobs: Dict[str, Dict] = {}
active_processes: Dict[str, subprocess.Popen] = {}
MAX_CONCURRENT_JOBS = int(os.getenv("MAX_CONCURRENT_JOBS", "3"))

# Pydantic models for API
class ScrapingRequest(BaseModel):
    max_products: Optional[int] = Field(default=None, ge=0)  # None = unlimited
    categories_limit: Optional[int] = Field(default=None, ge=0)  # None = unlimited
    webhook_url: Optional[str] = None
    notify_on_complete: bool = True
    priority: Optional[str] = Field(default="normal", pattern="^(low|normal|high)$")

class ScrapingStatus(BaseModel):
    job_id: str
    status: str  # 'queued', 'running', 'completed', 'failed', 'cancelled'
    progress: Dict[str, Any]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error: Optional[str]
    config: Optional[Dict[str, Any]]

class JobResponse(BaseModel):
    job_id: str
    status: str
    message: str

class HealthResponse(BaseModel):
    status: str
    version: str
    active_jobs: int
    total_jobs: int
    uptime_seconds: float

# Startup/shutdown event handlers
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🚀 Starting Jumbo Scraper API Service...")
    
    # Create necessary directories
    os.makedirs("/app/jobs", exist_ok=True)
    os.makedirs("/app/results", exist_ok=True)
    os.makedirs("/app/logs", exist_ok=True)
    os.makedirs("/app/shared-data", exist_ok=True)
    
    # Record startup time
    app.state.startup_time = time.time()
    
    logger.info("✅ Jumbo Scraper API Service started successfully")
    yield
    
    # Shutdown
    logger.info("🛑 Shutting down scraper service...")
    
    # Clean up any running processes
    for job_id, process in active_processes.items():
        try:
            process.terminate()
            logger.info(f"Terminated job {job_id}")
        except Exception as e:
            logger.error(f"Error terminating job {job_id}: {e}")
    
    logger.info("✅ Shutdown complete")

# Create FastAPI app
app = FastAPI(
    title="Jumbo Scraper API",
    description="Production-ready API for Jumbo supermarket scraping with N8N integration",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def run_scraper_subprocess(job_id: str, config: ScrapingRequest):
    """Run the Jumbo scraper as subprocess with job-specific config"""
    
    try:
        # Create job-specific config file
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
        
        config_file_path = f"/app/jobs/{job_id}_config.json"
        with open(config_file_path, "w") as f:
            json.dump(job_config, f, indent=2)
        
        # Update job status
        scraper_jobs[job_id].update({
            "status": "running",
            "started_at": datetime.now(timezone.utc),
            "config": config.dict(),
            "config_file": config_file_path
        })
        
        logger.info(f"Starting Jumbo scraper subprocess for job {job_id}")
        
        # Run the Jumbo scraper wrapper with job-specific parameters
        process = subprocess.Popen([
            "python", "/app/jumbo_scraper_wrapper.py", 
            "--config", config_file_path
        ], 
        cwd="/app", 
        stdout=subprocess.PIPE, 
        stderr=subprocess.STDOUT, 
        text=True,
        bufsize=1,
        universal_newlines=True
        )
        
        active_processes[job_id] = process
        
        # Monitor process output
        log_file_path = f"/app/logs/{job_id}.log"
        with open(log_file_path, "w") as log_file:
            for line in process.stdout:
                log_file.write(line)
                log_file.flush()
        
        # Wait for completion
        return_code = process.wait()
        
        if return_code == 0:
            # Success
            scraper_jobs[job_id].update({
                "status": "completed",
                "completed_at": datetime.now(timezone.utc),
                "output_file": f"/app/results/{job_id}_products.json"
            })
            
            logger.info(f"Job {job_id} completed successfully")
            
            # Send webhook notification if configured
            if config.webhook_url and config.notify_on_complete:
                asyncio.create_task(send_webhook_notification(job_id, config.webhook_url))
                
        else:
            # Failure
            scraper_jobs[job_id].update({
                "status": "failed",
                "completed_at": datetime.now(timezone.utc),
                "error": f"Process failed with return code {return_code}",
                "return_code": return_code
            })
            
            logger.error(f"Job {job_id} failed with return code {return_code}")
    
    except Exception as e:
        logger.error(f"Exception in job {job_id}: {e}")
        scraper_jobs[job_id].update({
            "status": "failed",
            "completed_at": datetime.now(timezone.utc),
            "error": str(e)
        })
    
    finally:
        # Clean up
        if job_id in active_processes:
            del active_processes[job_id]
        logger.info(f"Cleaned up job {job_id}")

async def send_webhook_notification(job_id: str, webhook_url: str):
    """Send completion notification to webhook"""
    import aiohttp
    
    try:
        job_data = scraper_jobs.get(job_id, {})
        
        # Prepare webhook payload
        payload = {
            "job_id": job_id,
            "status": job_data.get("status", "unknown"),
            "scraper": "jumbo",
            "completed_at": job_data.get("completed_at", datetime.now(timezone.utc)).isoformat() if job_data.get("completed_at") else None,
            "duration_seconds": None,
            "products_scraped": None,
            "webhook_sent_at": datetime.now(timezone.utc).isoformat()
        }
        
        # Calculate duration if both timestamps exist
        if job_data.get("started_at") and job_data.get("completed_at"):
            duration = (job_data["completed_at"] - job_data["started_at"]).total_seconds()
            payload["duration_seconds"] = duration
        
        # Try to get product count from results file
        try:
            results_file = job_data.get("output_file", f"/app/results/{job_id}_products.json")
            if os.path.exists(results_file):
                with open(results_file, 'r') as f:
                    results = json.load(f)
                    payload["products_scraped"] = len(results) if isinstance(results, list) else results.get("total_products", 0)
        except Exception as e:
            logger.warning(f"Could not determine product count for job {job_id}: {e}")
        
        # Send webhook
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(webhook_url, json=payload) as response:
                if response.status == 200:
                    logger.info(f"Webhook notification sent successfully for job {job_id}")
                else:
                    logger.warning(f"Webhook returned status {response.status} for job {job_id}")
                    
    except Exception as e:
        logger.error(f"Failed to send webhook notification for job {job_id}: {e}")

def get_running_job_count() -> int:
    """Get count of currently running jobs"""
    return sum(1 for job in scraper_jobs.values() if job.get("status") == "running")

def can_accept_new_job() -> bool:
    """Check if we can accept a new job based on concurrent limits"""
    return get_running_job_count() < MAX_CONCURRENT_JOBS

# API Routes

@app.get("/", response_model=Dict[str, Any])
async def root():
    """API information endpoint"""
    return {
        "message": "Jumbo Scraper API",
        "version": "2.0.0",
        "status": "ready",
        "scraper": "jumbo",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Service health check endpoint"""
    uptime = time.time() - getattr(app.state, 'startup_time', time.time())
    
    return HealthResponse(
        status="healthy",
        version="2.0.0", 
        active_jobs=get_running_job_count(),
        total_jobs=len(scraper_jobs),
        uptime_seconds=uptime
    )

@app.post("/scrape", response_model=JobResponse)
async def start_scraping_job(request: ScrapingRequest, background_tasks: BackgroundTasks):
    """Start a new Jumbo scraping job"""
    
    # Check concurrent job limit
    if not can_accept_new_job():
        raise HTTPException(
            status_code=503,
            detail=f"Maximum concurrent jobs ({MAX_CONCURRENT_JOBS}) exceeded. Currently running: {get_running_job_count()}"
        )
    
    # Generate job ID
    job_id = f"jumbo_scrape_{uuid.uuid4().hex[:8]}_{int(time.time())}"
    
    # Create job record
    scraper_jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": {},
        "created_at": datetime.now(timezone.utc),
        "started_at": None,
        "completed_at": None,
        "error": None,
        "config": request.dict()
    }
    
    # Start background task
    background_tasks.add_task(run_scraper_subprocess, job_id, request)
    
    logger.info(f"Queued new Jumbo scraping job: {job_id}")
    
    return JobResponse(
        job_id=job_id,
        status="queued",
        message=f"Jumbo scraping job {job_id} has been queued and will start shortly"
    )

@app.get("/jobs", response_model=List[Dict[str, Any]])
async def list_jobs(status: Optional[str] = Query(None, description="Filter jobs by status")):
    """List all scraping jobs"""
    jobs = list(scraper_jobs.values())
    
    if status:
        jobs = [job for job in jobs if job.get("status") == status]
    
    # Convert datetime objects to ISO strings for JSON serialization
    for job in jobs:
        for key in ["created_at", "started_at", "completed_at"]:
            if job.get(key) and isinstance(job[key], datetime):
                job[key] = job[key].isoformat()
    
    return jobs

@app.get("/jobs/{job_id}", response_model=Dict[str, Any])
async def get_job_status(job_id: str):
    """Get status of a specific job"""
    if job_id not in scraper_jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    job = scraper_jobs[job_id].copy()
    
    # Add real-time progress if available
    progress_file = f"/app/jobs/{job_id}_progress.json"
    if os.path.exists(progress_file):
        try:
            with open(progress_file, 'r') as f:
                progress_data = json.load(f)
                job["progress"] = progress_data
        except (json.JSONDecodeError, FileNotFoundError):
            pass
    
    # Convert datetime objects to ISO strings
    for key in ["created_at", "started_at", "completed_at"]:
        if job.get(key) and isinstance(job[key], datetime):
            job[key] = job[key].isoformat()
    
    return job

@app.get("/jobs/{job_id}/results")
async def get_job_results(
    job_id: str, 
    format: str = Query("full", description="Result format: 'full' or 'summary'"),
    limit: Optional[int] = Query(None, description="Limit number of products returned")
):
    """Get results from a completed job"""
    if job_id not in scraper_jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    job = scraper_jobs[job_id]
    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail=f"Job {job_id} is not completed (status: {job.get('status')})")
    
    results_file = f"/app/results/{job_id}_products.json"
    if not os.path.exists(results_file):
        raise HTTPException(status_code=404, detail=f"Results file not found for job {job_id}")
    
    try:
        with open(results_file, 'r') as f:
            results = json.load(f)
        
        if format == "summary":
            # Return summary statistics
            if isinstance(results, list):
                total_products = len(results)
                if limit:
                    results = results[:limit]
                
                return {
                    "job_id": job_id,
                    "total_products": total_products,
                    "returned_products": len(results),
                    "sample_products": results[:5] if results else [],
                    "format": "summary"
                }
            else:
                return {
                    "job_id": job_id,
                    "results": results,
                    "format": "summary"
                }
        
        # Full format
        if isinstance(results, list) and limit:
            results = results[:limit]
        
        return {
            "job_id": job_id,
            "results": results,
            "total_products": len(results) if isinstance(results, list) else None,
            "format": "full"
        }
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Invalid results file format")

@app.get("/jobs/{job_id}/logs")
async def get_job_logs(
    job_id: str,
    tail: Optional[int] = Query(None, description="Return last N lines")
):
    """Get logs from a job"""
    if job_id not in scraper_jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    log_file = f"/app/logs/{job_id}.log"
    if not os.path.exists(log_file):
        return {"job_id": job_id, "logs": "No logs available", "lines": 0}
    
    try:
        with open(log_file, 'r') as f:
            lines = f.readlines()
        
        if tail and len(lines) > tail:
            lines = lines[-tail:]
        
        return {
            "job_id": job_id,
            "logs": "".join(lines),
            "lines": len(lines),
            "total_lines": len(lines) if not tail else None
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading log file: {str(e)}")

@app.delete("/jobs/{job_id}")
async def cancel_job(job_id: str):
    """Cancel a running job"""
    if job_id not in scraper_jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    job = scraper_jobs[job_id]
    
    if job.get("status") not in ["queued", "running"]:
        raise HTTPException(status_code=400, detail=f"Job {job_id} cannot be cancelled (status: {job.get('status')})")
    
    # Terminate the process if it's running
    if job_id in active_processes:
        try:
            process = active_processes[job_id]
            process.terminate()
            
            # Wait up to 10 seconds for graceful termination
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            
            logger.info(f"Terminated job {job_id}")
            
        except Exception as e:
            logger.error(f"Error terminating job {job_id}: {e}")
    
    # Update job status
    scraper_jobs[job_id].update({
        "status": "cancelled",
        "completed_at": datetime.now(timezone.utc),
        "error": "Job cancelled by user"
    })
    
    return {"job_id": job_id, "status": "cancelled", "message": f"Job {job_id} has been cancelled"}

@app.get("/progress")
async def get_progress_summary():
    """Get clean progress summary for N8N monitoring (without product lists)"""
    # Check if there's a live progress file (updated by active scraper)
    live_progress_file = "/app/shared-data/jumbo_live_progress.json"
    if os.path.exists(live_progress_file):
        try:
            with open(live_progress_file, 'r') as f:
                live_progress = json.load(f)
            return live_progress
        except (json.JSONDecodeError, FileNotFoundError):
            pass
    
    # Fallback: find the most recent running job and get clean progress
    running_jobs = [job for job in scraper_jobs.values() if job.get("status") == "running"]
    if running_jobs:
        # Get the most recent running job
        latest_job = max(running_jobs, key=lambda x: x.get("created_at", datetime.min))
        job_id = latest_job.get("job_id")
        
        # Load progress data but return clean summary
        progress_file = f"/app/jobs/{job_id}_progress.json"
        if os.path.exists(progress_file):
            try:
                with open(progress_file, 'r') as f:
                    progress_data = json.load(f)
                
                return {
                    "scraper_name": "jumbo",
                    "job_id": job_id,
                    "status": "running",
                    "progress_percent": progress_data.get("estimated_progress_percent", 0),
                    "products_scraped": progress_data.get("total_scraped", 0),
                    "current_task": f"Processing at offset {progress_data.get('current_offset', 0)}",
                    "products_per_second": progress_data.get("products_per_second", 0),
                    "timestamp": progress_data.get("timestamp_amsterdam", ""),
                    "batch_size": progress_data.get("current_batch_size", 100),
                    "successful_requests": progress_data.get("successful_requests", 0),
                    "failed_requests": progress_data.get("failed_requests", 0)
                }
            except (json.JSONDecodeError, FileNotFoundError):
                pass
    
    # No running jobs
    return {
        "scraper_name": "jumbo",
        "status": "idle",
        "active_jobs": get_running_job_count(),
        "total_jobs": len(scraper_jobs),
        "message": "No scraping jobs currently running"
    }

@app.get("/stats")
async def get_service_stats():
    """Get service statistics"""
    stats = {
        "total_jobs": len(scraper_jobs),
        "active_jobs": get_running_job_count(),
        "max_concurrent_jobs": MAX_CONCURRENT_JOBS,
        "uptime_seconds": time.time() - getattr(app.state, 'startup_time', time.time()),
        "jobs_by_status": {}
    }
    
    # Count jobs by status
    for job in scraper_jobs.values():
        status = job.get("status", "unknown")
        stats["jobs_by_status"][status] = stats["jobs_by_status"].get(status, 0) + 1
    
    return stats

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)