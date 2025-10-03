import secrets
import string
import logging
from datetime import datetime, timedelta
from typing import Optional
import hashlib
import ipaddress

# Configure logging with lazy % formatting
logger = logging.getLogger(__name__)

def generate_anon_token(length: int = 16) -> str:
    """
    Generate a secure anonymous token
    
    Args:
        length: Length of the token
        
    Returns:
        Secure random token string
    """
    try:
        # Use secrets module for cryptographically secure random generation
        alphabet = string.ascii_letters + string.digits
        token = ''.join(secrets.choice(alphabet) for _ in range(length))
        logger.debug("Generated anonymous token of length %d", length)
        return token
    except Exception as e:
        logger.error("Failed to generate anonymous token: %s", str(e))
        # Fallback to a simpler method
        import random
        return ''.join(random.choice(alphabet) for _ in range(length))

def generate_session_id() -> str:
    """Generate a unique session identifier"""
    try:
        # Combine timestamp with random string for uniqueness
        timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        random_part = generate_anon_token(8)
        session_id = f"{timestamp}_{random_part}"
        logger.debug("Generated session ID: %s", session_id)
        return session_id
    except Exception as e:
        logger.error("Failed to generate session ID: %s", str(e))
        return generate_anon_token(16)

def validate_ip_address(ip_str: str) -> bool:
    """
    Validate if a string is a valid IP address
    
    Args:
        ip_str: String to validate as IP address
        
    Returns:
        True if valid IP address, False otherwise
    """
    try:
        ipaddress.ip_address(ip_str)
        return True
    except ValueError:
        return False

def sanitize_input(text: str, max_length: int = 1000) -> str:
    """
    Sanitize user input text
    
    Args:
        text: Input text to sanitize
        max_length: Maximum allowed length
        
    Returns:
        Sanitized text
    """
    if not text:
        return ""
        
    # Remove potentially dangerous characters
    dangerous_chars = ['<', '>', '"', "'", '&', '{', '}', '[', ']', '(', ')', ';']
    sanitized = text
    
    for char in dangerous_chars:
        sanitized = sanitized.replace(char, '')
        
    # Limit length
    if len(sanitized) > max_length:
        sanitized = sanitized[:max_length]
        logger.warning("Input text truncated to %d characters", max_length)
        
    # Remove extra whitespace
    sanitized = ' '.join(sanitized.split())
    
    return sanitized

def extract_client_ip(request) -> str:
    """
    Extract client IP address from request object
    
    Args:
        request: FastAPI request object
        
    Returns:
        Client IP address string
    """
    try:
        # Check for forwarded headers first (for proxy scenarios)
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            # Take the first IP in the chain
            ip = forwarded_for.split(',')[0].strip()
            if validate_ip_address(ip):
                return ip
                
        # Check X-Real-IP header
        real_ip = request.headers.get("X-Real-IP")
        if real_ip and validate_ip_address(real_ip):
            return real_ip
            
        # Fallback to client host
        client_host = request.client.host if request.client else None
        if client_host and validate_ip_address(client_host):
            return client_host
            
        # Final fallback
        return "127.0.0.1"
        
    except Exception as e:
        logger.error("Failed to extract client IP: %s", str(e))
        return "127.0.0.1"

def get_user_agent(request) -> str:
    """
    Extract user agent string from request
    
    Args:
        request: FastAPI request object
        
    Returns:
        User agent string or default value
    """
    try:
        user_agent = request.headers.get("User-Agent", "")
        return sanitize_input(user_agent, max_length=500)
    except Exception as e:
        logger.error("Failed to extract user agent: %s", str(e))
        return "Unknown"

def create_rate_limit_key(identifier: str, request_type: str = "general") -> str:
    """
    Create a rate limit key for the identifier
    
    Args:
        identifier: IP address or anonymous token
        request_type: Type of request for rate limiting
        
    Returns:
        Rate limit key string
    """
    try:
        # Hash the identifier for security
        hashed_id = hashlib.sha256(identifier.encode()).hexdigest()[:16]
        key = f"{request_type}:{hashed_id}"
        logger.debug("Created rate limit key: %s", key)
        return key
    except Exception as e:
        logger.error("Failed to create rate limit key: %s", str(e))
        return f"{request_type}:{identifier}"

def format_timestamp(timestamp: datetime) -> str:
    """
    Format timestamp for display
    
    Args:
        timestamp: Datetime object to format
        
    Returns:
        Formatted timestamp string
    """
    try:
        return timestamp.strftime("%Y-%m-%d %H:%M:%S UTC")
    except Exception as e:
        logger.error("Failed to format timestamp: %s", str(e))
        return str(timestamp)

def calculate_time_difference(start_time: datetime, end_time: datetime = None) -> str:
    """
    Calculate and format time difference
    
    Args:
        start_time: Start time
        end_time: End time (defaults to current time)
        
    Returns:
        Formatted time difference string
    """
    try:
        if end_time is None:
            end_time = datetime.utcnow()
            
        diff = end_time - start_time
        
        if diff.total_seconds() < 60:
            return f"{int(diff.total_seconds())} seconds"
        elif diff.total_seconds() < 3600:
            return f"{int(diff.total_seconds() // 60)} minutes"
        elif diff.total_seconds() < 86400:
            return f"{int(diff.total_seconds() // 3600)} hours"
        else:
            return f"{int(diff.total_seconds() // 86400)} days"
            
    except Exception as e:
        logger.error("Failed to calculate time difference: %s", str(e))
        return "Unknown"

def is_banned_keyword(text: str, banned_keywords: list = None) -> bool:
    """
    Check if text contains banned keywords
    
    Args:
        text: Text to check
        banned_keywords: List of banned keywords
        
    Returns:
        True if banned keyword found, False otherwise
    """
    if not banned_keywords:
        banned_keywords = [
            "kill", "harm", "dangerous", "illegal", "drug", "overdose",
            "suicide", "self-harm", "violence", "hate", "discrimination"
        ]
        
    try:
        text_lower = text.lower()
        for keyword in banned_keywords:
            if keyword.lower() in text_lower:
                logger.warning("Banned keyword detected: %s", keyword)
                return True
        return False
    except Exception as e:
        logger.error("Failed to check banned keywords: %s", str(e))
        return False

def is_factsheet_search_query(text: str) -> bool:
    """
    Detect if a query is asking "what is [name]?" to automatically route to factsheet search
    
    Args:
        text: User query text
        
    Returns:
        True if it's a factsheet search query, False otherwise
    """
    try:
        text_lower = text.lower().strip()
        
        # Common patterns for factsheet searches
        factsheet_patterns = [
            "what is ",
            "what's ",
            "tell me about ",
            "information about ",
    "details about ",
            "explain ",
            "describe ",
            "define "
        ]
        
        for pattern in factsheet_patterns:
            if text_lower.startswith(pattern):
                # Check if there's actual content after the pattern
                remaining_text = text_lower[len(pattern):].strip()
                if len(remaining_text) > 2:  # At least 3 characters for a meaningful search
                    logger.debug("Detected factsheet search query: %s", text)
                    return True
        
        return False
        
    except Exception as e:
        logger.error("Failed to detect factsheet search query: %s", str(e))
        return False

def extract_search_term(text: str) -> str:
    """
    Extract the search term from a factsheet search query
    
    Args:
        text: User query text (e.g., "what is vitamin c?")
        
    Returns:
        Extracted search term (e.g., "vitamin c")
    """
    try:
        text_lower = text.lower().strip()
        
        # Remove common question patterns
        patterns_to_remove = [
            "what is ",
            "what's ",
            "tell me about ",
            "information about ",
            "details about ",
            "explain ",
            "describe ",
            "define "
        ]
        
        for pattern in patterns_to_remove:
            if text_lower.startswith(pattern):
                search_term = text_lower[len(pattern):].strip()
                # Remove question marks and extra punctuation
                search_term = search_term.rstrip('?.,!').strip()
                return search_term
        
        return text.strip()
        
    except Exception as e:
        logger.error("Failed to extract search term: %s", str(e))
        return text.strip()

def is_medicine_schedule_query(query: str) -> bool:
    """
    Detect if a query is asking about medicine schedule
    
    Args:
        query: User's query text
        
    Returns:
        True if query is about medicine schedule, False otherwise
    """
    if not query:
        return False
    
    query_lower = query.lower()
    
    # Medicine schedule keywords
    schedule_keywords = [
        "medicine schedule", "medication schedule", "medicine schedule", "med schedule",
        "what medicine", "what medication", "my medicine", "my medication",
        "today medicine", "today medication", "medicine today", "medication today",
        "medicine list", "medication list", "medicine reminder", "medication reminder",
        "when to take", "what to take", "dosage schedule", "medicine time",
        "pill schedule", "tablet schedule", "medicine routine", "medication routine"
    ]
    
    # Check for schedule keywords
    for keyword in schedule_keywords:
        if keyword in query_lower:
            return True
    
    # Check for date-specific medicine queries
    import re
    date_patterns = [
        r"medicine.*\d{4}-\d{2}-\d{2}",  # medicine on 2025-08-22
        r"medicine.*\d{1,2}/\d{1,2}/\d{4}",  # medicine on 8/22/2025
        r"medicine.*\d{1,2}-\d{1,2}-\d{4}",  # medicine on 8-22-2025
        r"what.*medicine.*\d{4}-\d{2}-\d{2}",  # what medicine on 2025-08-22
        r"my.*medicine.*\d{4}-\d{2}-\d{2}"   # my medicine on 2025-08-22
    ]
    
    for pattern in date_patterns:
        if re.search(pattern, query_lower):
            return True
    
    return False

def extract_date_from_query(query: str) -> Optional[str]:
    """
    Extract date from medicine schedule query
    
    Args:
        query: User's query text
        
    Returns:
        Date string in YYYY-MM-DD format if found, None otherwise
    """
    if not query:
        return None
    
    import re
    from datetime import datetime
    
    # Try different date formats
    date_patterns = [
        r"(\d{4})-(\d{2})-(\d{2})",  # 2025-08-22
        r"(\d{1,2})/(\d{1,2})/(\d{4})",  # 8/22/2025
        r"(\d{1,2})-(\d{1,2})-(\d{4})",  # 8-22-2025
        r"(\d{1,2})\.(\d{1,2})\.(\d{4})"  # 8.22.2025
    ]
    
    for pattern in date_patterns:
        match = re.search(pattern, query)
        if match:
            try:
                if len(match.groups()) == 3:
                    if len(match.group(1)) == 4:  # YYYY-MM-DD format
                        year, month, day = match.groups()
                    else:  # MM/DD/YYYY format
                        month, day, year = match.groups()
                    
                    # Validate date
                    date_obj = datetime(int(year), int(month), int(day))
                    return date_obj.strftime("%Y-%m-%d")
            except ValueError:
                continue
    
    # Check for relative dates
    query_lower = query.lower()
    today = datetime.now()
    
    if "today" in query_lower:
        return today.strftime("%Y-%m-%d")
    elif "tomorrow" in query_lower:
        tomorrow = today + timedelta(days=1)
        return tomorrow.strftime("%Y-%m-%d")
    elif "yesterday" in query_lower:
        yesterday = today - timedelta(days=1)
        return yesterday.strftime("%Y-%m-%d")
    
    return None
