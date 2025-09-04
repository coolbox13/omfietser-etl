#!/usr/bin/env python3
"""
FastAPI AH Scraper Service - Production Ready
Wraps the sophisticated AH scraper with a modern REST API
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
    logger.info("🚀 Starting AH Scraper API Service...")
    
    # Create necessary directories
    os.makedirs("/app/jobs", exist_ok=True)
    os.makedirs("/app/results", exist_ok=True)
    os.makedirs("/app/logs", exist_ok=True)
    os.makedirs("/app/shared-data", exist_ok=True)
    
    # Record startup time
    app.state.startup_time = time.time()
    
    logger.info("✅ AH Scraper API Service started successfully")
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
    title="AH Scraper API",
    description="Production-ready API for Albert Heijn product scraping with N8N integration",
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
    """Run the original scraper as subprocess with job-specific config"""
    
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
        
        logger.info(f"Starting scraper subprocess for job {job_id}")
        
        # Run the original scraper with job-specific parameters
        process = subprocess.Popen([
            "python", "/app/ah_scraper.py", 
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
                try:
                    # Use requests for synchronous webhook call from subprocess
                    import requests
                    
                    # Prepare webhook payload
                    payload = {
                        "job_id": job_id,
                        "status": "completed",
                        "scraper": "ah",
                        "completed_at": datetime.now(timezone.utc).isoformat(),
                        "duration_seconds": None,
                        "products_scraped": None,
                        "webhook_sent_at": datetime.now(timezone.utc).isoformat()
                    }
                    
                    # Calculate duration if both timestamps exist
                    job_data = scraper_jobs.get(job_id, {})
                    if job_data.get("started_at"):
                        duration = (datetime.now(timezone.utc) - job_data["started_at"]).total_seconds()
                        payload["duration_seconds"] = duration
                    
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
                    
                    # Send webhook with timeout
                    response = requests.post(config.webhook_url, json=payload, timeout=30)
                    if response.status_code == 200:
                        logger.info(f"Webhook notification sent successfully for job {job_id}")
                    else:
                        logger.warning(f"Webhook returned status {response.status_code} for job {job_id}")
                        
                except Exception as e:
                    logger.error(f"Failed to send webhook notification for job {job_id}: {e}")
                
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
        payload = {
            "job_id": job_id,
            "status": job_data.get("status"),
            "completed_at": job_data.get("completed_at").isoformat() if job_data.get("completed_at") else None,
            "results_url": f"/jobs/{job_id}/results",
            "api_base": os.getenv("WEBHOOK_BASE_URL", "http://localhost:8000"),
            "total_products": job_data.get("progress", {}).get("total_scraped_items", 0)
        }
        
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(webhook_url, json=payload) as response:
                logger.info(f"Webhook sent for job {job_id}: {response.status}")
                
    except Exception as e:
        logger.error(f"Failed to send webhook for job {job_id}: {e}")

# API Endpoints

@app.get("/", response_model=Dict[str, Any])
async def root():
    """API health check and info"""
    return {
        "service": "AH Scraper API",
        "version": "2.0.0",
        "status": "running",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "active_jobs": len([j for j in scraper_jobs.values() if j.get("status") == "running"]),
        "endpoints": {
            "health": "GET /health",
            "start_scraping": "POST /scrape",
            "job_status": "GET /jobs/{job_id}",
            "job_results": "GET /jobs/{job_id}/results",
            "list_jobs": "GET /jobs",
            "cancel_job": "DELETE /jobs/{job_id}",
            "job_logs": "GET /jobs/{job_id}/logs"
        }
    }

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Detailed health check endpoint"""
    uptime = time.time() - getattr(app.state, 'startup_time', time.time())
    active_jobs = len([j for j in scraper_jobs.values() if j.get("status") == "running"])
    
    return HealthResponse(
        status="healthy",
        version="2.0.0",
        active_jobs=active_jobs,
        total_jobs=len(scraper_jobs),
        uptime_seconds=uptime
    )

@app.post("/scrape", response_model=JobResponse)
async def start_scraping(
    request: ScrapingRequest,
    background_tasks: BackgroundTasks
):
    """Start a new scraping job"""
    
    # Check if we've reached the maximum concurrent jobs
    active_count = len([j for j in scraper_jobs.values() if j.get("status") in ["queued", "running"]])
    if active_count >= MAX_CONCURRENT_JOBS:
        raise HTTPException(
            status_code=429, 
            detail=f"Maximum concurrent jobs ({MAX_CONCURRENT_JOBS}) reached. Please wait for a job to complete."
        )
    
    job_id = f"ah_scrape_{uuid.uuid4().hex[:8]}_{int(time.time())}"
    
    # Initialize job tracking
    scraper_jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "created_at": datetime.now(timezone.utc),
        "progress": {},
        "config": request.dict()
    }
    
    logger.info(f"Created new scraping job: {job_id}")
    
    # Start scraping in background
    background_tasks.add_task(run_scraper_subprocess, job_id, request)
    
    return JobResponse(
        job_id=job_id,
        status="queued",
        message=f"Scraping job {job_id} started. Monitor progress at /jobs/{job_id}"
    )

@app.get("/jobs", response_model=List[ScrapingStatus])
async def list_jobs(
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(20, description="Number of jobs to return", ge=1, le=100)
):
    """List all scraping jobs with optional filtering"""
    
    jobs = list(scraper_jobs.values())
    
    # Filter by status if provided
    if status:
        jobs = [job for job in jobs if job.get("status") == status]
    
    # Sort by creation time (newest first)
    jobs.sort(key=lambda x: x.get("created_at", datetime.min), reverse=True)
    
    # Apply limit
    jobs = jobs[:limit]
    
    return [
        ScrapingStatus(
            job_id=job["job_id"],
            status=job["status"],
            progress=job.get("progress", {}),
            started_at=job.get("started_at"),
            completed_at=job.get("completed_at"),
            error=job.get("error"),
            config=job.get("config")
        )
        for job in jobs
    ]

@app.get("/jobs/{job_id}", response_model=ScrapingStatus)
async def get_job_status(job_id: str):
    """Get detailed status of a specific job"""
    
    if job_id not in scraper_jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    job = scraper_jobs[job_id]
    
    # If job is running, try to read live progress
    if job["status"] == "running":
        progress_file = f"/app/jobs/{job_id}_progress.json"
        try:
            if os.path.exists(progress_file):
                with open(progress_file, "r") as f:
                    live_progress = json.load(f)
                job["progress"] = live_progress
        except Exception as e:
            logger.warning(f"Could not read progress file for {job_id}: {e}")
    
    return ScrapingStatus(
        job_id=job["job_id"],
        status=job["status"],
        progress=job.get("progress", {}),
        started_at=job.get("started_at"),
        completed_at=job.get("completed_at"),
        error=job.get("error"),
        config=job.get("config")
    )

@app.get("/jobs/{job_id}/results")
async def get_job_results(
    job_id: str,
    format: str = Query("json", description="Response format: json, summary"),
    limit: Optional[int] = Query(None, description="Limit number of products returned"),
    offset: Optional[int] = Query(0, description="Offset for pagination")
):
    """Get results from a completed scraping job"""
    
    if job_id not in scraper_jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    job = scraper_jobs[job_id]
    
    if job["status"] != "completed":
        raise HTTPException(
            status_code=400, 
            detail=f"Job {job_id} is not completed (status: {job['status']})"
        )
    
    # Read results file
    results_file = f"/app/results/{job_id}_products.json"
    if not os.path.exists(results_file):
        raise HTTPException(status_code=404, detail="Results file not found")
    
    try:
        with open(results_file, "r") as f:
            products = json.load(f)
        
        # Apply offset and limit for pagination
        if offset:
            products = products[offset:]
        if limit:
            products = products[:limit]
        
        if format == "summary":
            # Return summary statistics
            categories = list(set(p.get("scraped_category_name", "Unknown") for p in products))
            prices = [p.get("price", {}).get("now", 0) for p in products if p.get("price", {}).get("now")]
            avg_price = sum(prices) / len(prices) if prices else 0
            
            return {
                "job_id": job_id,
                "total_products": len(products),
                "categories_found": len(categories),
                "categories": categories,
                "average_price": round(avg_price, 2),
                "price_range": {
                    "min": min(prices) if prices else 0,
                    "max": max(prices) if prices else 0
                },
                "completed_at": job["completed_at"].isoformat() if job.get("completed_at") else None
            }
        
        else:
            # Return full data
            return {
                "job_id": job_id,
                "total_products": len(products),
                "products": products,
                "completed_at": job["completed_at"].isoformat() if job.get("completed_at") else None,
                "pagination": {
                    "offset": offset or 0,
                    "limit": limit,
                    "has_more": len(products) == limit if limit else False
                }
            }
    
    except Exception as e:
        logger.error(f"Error reading results for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error reading results: {str(e)}")

@app.delete("/jobs/{job_id}", response_model=JobResponse)
async def cancel_job(job_id: str):
    """Cancel a running scraping job"""
    
    if job_id not in scraper_jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    job = scraper_jobs[job_id]
    
    if job["status"] not in ["queued", "running"]:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot cancel job {job_id} with status: {job['status']}"
        )
    
    # Terminate the process if running
    if job_id in active_processes:
        try:
            process = active_processes[job_id]
            process.terminate()
            # Give it a moment to terminate gracefully
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()  # Force kill if it doesn't terminate
            del active_processes[job_id]
            logger.info(f"Terminated process for job {job_id}")
        except Exception as e:
            logger.error(f"Error terminating job {job_id}: {e}")
    
    # Update job status
    scraper_jobs[job_id].update({
        "status": "cancelled",
        "completed_at": datetime.now(timezone.utc),
        "error": "Job cancelled by user"
    })
    
    logger.info(f"Job {job_id} cancelled by user")
    
    return JobResponse(
        job_id=job_id,
        status="cancelled",
        message=f"Job {job_id} has been cancelled"
    )

@app.get("/jobs/{job_id}/logs")
async def get_job_logs(
    job_id: str,
    lines: Optional[int] = Query(None, description="Number of lines to return (tail)")
):
    """Get logs for a specific job"""
    
    if job_id not in scraper_jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    log_file = f"/app/logs/{job_id}.log"
    if not os.path.exists(log_file):
        return {"job_id": job_id, "logs": "No logs available", "lines": 0}
    
    try:
        with open(log_file, "r") as f:
            log_lines = f.readlines()
        
        # Return last N lines if specified
        if lines:
            log_lines = log_lines[-lines:]
        
        logs_content = "".join(log_lines)
        
        return {
            "job_id": job_id, 
            "logs": logs_content,
            "lines": len(log_lines),
            "file_size": os.path.getsize(log_file)
        }
    except Exception as e:
        logger.error(f"Error reading logs for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error reading logs: {str(e)}")

@app.get("/progress")
async def get_progress_summary():
    """Get clean progress summary for N8N monitoring (without product lists)"""
    # Check if there's a live progress file (updated by active scraper)
    live_progress_file = "/app/shared-data/ah_live_progress.json"
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
                    "scraper_name": "ah",
                    "job_id": job_id,
                    "status": "running",
                    "progress_percent": progress_data.get("progress_percent", 0),
                    "products_scraped": progress_data.get("total_scraped_items", 0),
                    "current_task": f"Processing categories... ({progress_data.get('current_category', 'Unknown')})",
                    "categories_completed": progress_data.get("categories_completed", 0),
                    "total_categories": progress_data.get("total_categories", 0),
                    "timestamp": progress_data.get("timestamp", ""),
                    "successful_requests": progress_data.get("successful_requests", 0),
                    "failed_requests": progress_data.get("failed_requests", 0)
                }
            except (json.JSONDecodeError, FileNotFoundError):
                pass
    
    # No running jobs
    return {
        "scraper_name": "ah",
        "status": "idle",
        "active_jobs": len([job for job in scraper_jobs.values() if job.get("status") == "running"]),
        "total_jobs": len(scraper_jobs),
        "message": "No scraping jobs currently running"
    }

# Optional: WebSocket endpoint for real-time updates
@app.websocket("/jobs/{job_id}/live")
async def websocket_job_progress(websocket, job_id: str):
    """WebSocket endpoint for real-time job progress updates"""
    await websocket.accept()
    
    try:
        while True:
            if job_id in scraper_jobs:
                job = scraper_jobs[job_id]
                
                # Read latest progress if job is running
                if job["status"] == "running":
                    progress_file = f"/app/jobs/{job_id}_progress.json"
                    try:
                        if os.path.exists(progress_file):
                            with open(progress_file, "r") as f:
                                job["progress"] = json.load(f)
                    except:
                        pass
                
                # Send current status
                await websocket.send_json({
                    "job_id": job_id,
                    "status": job["status"],
                    "progress": job.get("progress", {}),
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
                
                # Exit if job is completed
                if job["status"] in ["completed", "failed", "cancelled"]:
                    break
            else:
                await websocket.send_json({
                    "error": f"Job {job_id} not found"
                })
                break
            
            await asyncio.sleep(5)  # Update every 5 seconds
            
    except Exception as e:
        logger.error(f"WebSocket error for job {job_id}: {e}")
    finally:
        await websocket.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "scraper_api:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info"
    )
