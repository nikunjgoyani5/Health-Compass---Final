import os
from typing import Optional
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    # OpenAI Configuration
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    
    # Validate and set OpenAI model with fallback
    _openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4")
    
    @property
    def openai_model(self) -> str:
        """Get OpenAI model with validation and fallback"""
        # List of currently available OpenAI models
        available_models = [
            "gpt-4", "gpt-4-turbo-preview", "gpt-4-32k",
            "gpt-3.5-turbo", "gpt-3.5-turbo-16k",
            "gpt-3.5-turbo-0613", "gpt-3.5-turbo-0301"
        ]
        
        if self._openai_model in available_models:
            return self._openai_model
        else:
            print(f"⚠️  WARNING: Model '{self._openai_model}' is not available. Falling back to 'gpt-4'")
            return "gpt-4"
    
    # MongoDB Configuration
    mongodb_url: str = os.getenv("MONGODB_URL") or "mongodb://localhost:27017"
    mongodb_db: str = os.getenv("MONGODB_DB", "health-compass")
    
    # Redis Configuration
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    
    # Security
    secret_key: str = os.getenv("SECRET_KEY", "your_secret_key_here")
    algorithm: str = os.getenv("ALGORITHM", "HS256")
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    
    # Rate Limiting
    rate_limit_requests: int = int(os.getenv("RATE_LIMIT_REQUESTS", "100"))
    rate_limit_window: int = int(os.getenv("RATE_LIMIT_WINDOW", "3600"))
    
    # Logging
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    
    # Development settings (to handle extra env vars)
    debug: bool = False
    reload: bool = False
    
    class Config:
        env_file = ".env"
        extra = "ignore"  # Ignore extra fields from environment

settings = Settings()
