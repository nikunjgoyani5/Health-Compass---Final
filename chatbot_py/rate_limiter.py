import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Tuple, Optional
# Note: rate-limiter-flexible may not be available, using a simple in-memory implementation
# from rate_limiter_flexible import AsyncRateLimiter
from config import settings

# Configure logging with lazy % formatting
logger = logging.getLogger(__name__)

class RateLimiter:
    def __init__(self):
        # Simple in-memory rate limiter implementation
        self.requests: Dict[str, list[datetime]] = {}
        self.limits: Dict[str, int] = {}
        self.max_requests = settings.rate_limit_requests
        self.window_seconds = settings.rate_limit_window
        
    async def check_rate_limit(self, key: str) -> Tuple[bool, Optional[datetime]]:
        """Check if request is allowed"""
        now = datetime.now(timezone.utc)
        
        if key not in self.requests:
            self.requests[key] = []
            self.limits[key] = settings.rate_limit_requests
            return True, None
        
        # Clean old requests outside the window
        window_start = now - timedelta(seconds=settings.rate_limit_window)
        self.requests[key] = [req_time for req_time in self.requests[key] if req_time > window_start]
        
        if len(self.requests[key]) < self.limits[key]:
            self.requests[key].append(now)
            return True, None
        else:
            # Calculate reset time
            oldest_in_window = min(self.requests[key]) if self.requests[key] else now
            reset_time = oldest_in_window + timedelta(seconds=settings.rate_limit_window)
            return False, reset_time

    async def get_remaining_requests(self, key: str) -> int:
        """Return remaining requests in the current window for the key"""
        try:
            now = datetime.now(timezone.utc)
            window_start = now - timedelta(seconds=self.window_seconds)
            if key not in self.requests:
                self.requests[key] = []
                self.limits[key] = self.max_requests
                return self.max_requests
            # Clean window
            self.requests[key] = [t for t in self.requests[key] if t > window_start]
            used = len(self.requests[key])
            limit = self.limits.get(key, self.max_requests)
            remaining = max(0, limit - used)
            return remaining
        except Exception as e:
            logger.error("Failed to get remaining requests for %s: %s", key, str(e))
            return 0

    async def get_reset_time(self, key: str) -> datetime:
        """Get the datetime when the current window resets for the key"""
        try:
            now = datetime.now(timezone.utc)
            if key not in self.requests or not self.requests[key]:
                return now
            oldest_in_window = min(self.requests[key])
            window_end = oldest_in_window + timedelta(seconds=self.window_seconds)
            return window_end
        except Exception as e:
            logger.error("Failed to get reset time for key %s: %s", key, str(e))
            return datetime.now(timezone.utc)

# Global rate limiter instance
rate_limiter = RateLimiter()
