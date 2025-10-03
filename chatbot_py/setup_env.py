#!/usr/bin/env python3
"""
Environment Setup Script for Health Compass AI System

This script helps set up the required environment variables
and configuration for the Health Compass AI system.
"""

import os
import secrets
import string
from pathlib import Path

def generate_secret_key(length: int = 32) -> str:
    """Generate a secure secret key"""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def create_env_file():
    """Create a .env file with required environment variables"""
    env_file = Path(".env")
    
    if env_file.exists():
        print("⚠️  .env file already exists. Backing up to .env.backup")
        env_file.rename(".env.backup")
    
    # Generate a secure secret key
    secret_key = generate_secret_key()
    
    # Environment variables template
    env_content = f"""# Health Compass AI System Environment Configuration

# OpenAI Configuration
# Put your real key here locally; never commit it
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4

# MongoDB Configuration
# Example: mongodb+srv://<user>:<password>@<cluster>/<db-name>
MONGODB_URL=
MONGODB_DB=health-compass

# Redis Configuration (for rate limiting)
REDIS_URL=redis://localhost:6379

# Security
SECRET_KEY={secret_key}
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Rate Limiting
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=3600

# Logging
LOG_LEVEL=INFO

# Development Settings
DEBUG=true
RELOAD=true
"""
    
    # Write the .env file
    with open(env_file, 'w') as f:
        f.write(env_content)
    
    print(f" Created .env file with generated secret key placeholder")
    print(f" Add your OpenAI API key and MongoDB URL to .env (kept local; do not commit)")
    return env_file

def check_environment():
    """Check if required environment variables are set"""
    required_vars = ['OPENAI_API_KEY']
    missing_vars = []
    
    for var in required_vars:
        if not os.getenv(var) or os.getenv(var) == f"your_{var.lower()}_here":
            missing_vars.append(var)
    
    if missing_vars:
        print(f"Missing or invalid environment variables: {', '.join(missing_vars)}")
        return False
    
    print(" All required environment variables are set")
    return True

def create_directories():
    """Create necessary directories"""
    directories = ['logs', 'data', 'mongo-init']
    
    for directory in directories:
        Path(directory).mkdir(exist_ok=True)
        print(f"📁 Created directory: {directory}")

def create_mongo_init_script():
    """Create MongoDB initialization script"""
    mongo_init_dir = Path("mongo-init")
    init_script = mongo_init_dir / "init.js"
    
    if not init_script.exists():
        init_content = """// MongoDB initialization script for Health Compass AI System

// Create database
use health-compass;

// Create collections with proper indexes
db.createCollection("ai_query_logs");
db.createCollection("supplement_view_logs");

// New collections for expanded functionality
db.createCollection("supplement");
db.createCollection("medicine");
db.createCollection("vaccine");
db.createCollection("medicineschedule");
db.createCollection("vaccineschedule");

// Create indexes for better performance
db.ai_query_logs.createIndex({ "timestamp": -1 });
db.ai_query_logs.createIndex({ "supplement_id": 1 });
db.ai_query_logs.createIndex({ "medicine_id": 1 });
db.ai_query_logs.createIndex({ "vaccine_id": 1 });
db.ai_query_logs.createIndex({ "anon_token": 1 });
db.ai_query_logs.createIndex({ "success": 1 });

db.supplement_view_logs.createIndex({ "timestamp": -1 });
db.supplement_view_logs.createIndex({ "supplement_id": 1 });
db.supplement_view_logs.createIndex({ "anon_token": 1 });

// Indexes for new collections
db.supplement.createIndex({ "name": "text", "description": "text" });
db.supplement.createIndex({ "category": 1 });
db.supplement.createIndex({ "created_at": -1 });

db.medicine.createIndex({ "name": "text", "description": "text" });
db.medicine.createIndex({ "generic_name": "text" });
db.medicine.createIndex({ "created_at": -1 });

db.vaccine.createIndex({ "name": "text", "description": "text" });
db.vaccine.createIndex({ "target_disease": "text" });
db.vaccine.createIndex({ "created_at": -1 });

db.medicineschedule.createIndex({ "anon_token": 1 });
db.medicineschedule.createIndex({ "medicine_id": 1 });
db.medicineschedule.createIndex({ "start_date": 1 });
db.medicineschedule.createIndex({ "end_date": 1 });

db.vaccineschedule.createIndex({ "anon_token": 1 });
db.vaccineschedule.createIndex({ "vaccine_id": 1 });
db.vaccineschedule.createIndex({ "due_date": 1 });
db.vaccineschedule.createIndex({ "completed_date": 1 });

print("Health Compass AI System database initialized successfully!");
"""
        
        with open(init_script, 'w') as f:
            f.write(init_content)
        
        print("Created MongoDB initialization script")

def print_next_steps():
    """Print next steps for the user"""
    print("\n" + "="*60)
    print("🚀 NEXT STEPS TO GET STARTED:")
    print("="*60)
    print("1. Environment is already configured with your API key and MongoDB")
    print("2. Install dependencies: pip install -r requirements.txt")
    print("3. Start MongoDB and Redis (or use Docker)")
    print("4. Run the demo: python3 demo.py")
    print("5. Start the application: python3 start.py")
    print("\n For more information, see README.md")
    print(" For Docker deployment, use: docker-compose up -d")
    print("\n NEW FEATURES ADDED:")
    print("   • Supplement management (CRUD operations)")
    print("   • Medicine management (CRUD operations)")
    print("   • Vaccine management (CRUD operations)")
    print("   • Medicine scheduling system")
    print("   • Vaccine scheduling system")
    print("   • Enhanced AI chatbot with context injection")

def main():
    """Main setup function"""
    print("Health Compass AI System - Environment Setup")
    print("=" * 50)
    
    try:
        # Create .env file
        create_env_file()
        
        # Create directories
        create_directories()
        
        # Create MongoDB init script
        create_mongo_init_script()
        
        # Check environment
        check_environment()
        
        # Print next steps
        print_next_steps()
        
    except Exception as e:
        print(f"Setup failed: {str(e)}")
        return False
    
    return True

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
