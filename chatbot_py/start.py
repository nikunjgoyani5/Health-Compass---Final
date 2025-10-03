#!/usr/bin/env python3
"""
Health Compass AI System Startup Script

This script provides an easy way to start the Health Compass AI system
with proper configuration and error handling.
"""

import os
import sys
import logging
import asyncio
from pathlib import Path

# Configure logging with lazy % formatting
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def check_environment():
    """Check if required environment variables are set"""
    # Import config to ensure .env file is loaded
    try:
        from config import settings
        if not settings.openai_api_key:
            logger.error("Missing required environment variable: OPENAI_API_KEY")
            logger.error("Please set this variable in the .env file")
            return False
        logger.info("Environment variables loaded successfully")
        return True
    except Exception as e:
        logger.error("Failed to load environment variables: %s", str(e))
        return False

def check_dependencies():
    """Check if required dependencies are available"""
    try:
        import fastapi
        import openai
        import motor
        import redis
        logger.info("All required dependencies are available")
        return True
    except ImportError as e:
        logger.error("Missing required dependency: %s", str(e))
        logger.error("Please install dependencies with: pip install -r requirements.txt")
        return False

def create_directories():
    """Create necessary directories if they don't exist"""
    directories = ['logs', 'data']
    
    for directory in directories:
        Path(directory).mkdir(exist_ok=True)
        logger.info("Ensured directory exists: %s", directory)

async def start_application():
    """Start the Health Compass AI application"""
    try:
        from main import app
        import uvicorn
        from config import settings
        
        logger.info("Starting Health Compass AI System...")
        logger.info("Configuration loaded successfully")
        
        # Start the server
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=8000,
            reload=True,
            log_level=settings.log_level.lower()
        )
        
    except Exception as e:
        logger.error("Failed to start application: %s", str(e))
        sys.exit(1)

def main():
    """Main startup function"""
    logger.info("Health Compass AI System Startup")
    logger.info("=" * 50)
    
    # Check environment
    if not check_environment():
        sys.exit(1)
    
    # Check dependencies
    if not check_dependencies():
        sys.exit(1)
    
    # Create directories
    create_directories()
    
    # Start application
    try:
        asyncio.run(start_application())
    except KeyboardInterrupt:
        logger.info("Application stopped by user")
    except Exception as e:
        logger.error("Application failed to start: %s", str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()
