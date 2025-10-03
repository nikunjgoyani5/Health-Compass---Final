import logging
import asyncio
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Depends, Request, BackgroundTasks, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import uvicorn
from typing import Dict, Any, Optional

from config import settings
from database import db
from ai_service import AIService
from rate_limiter import rate_limiter

# Initialize AI service
ai_service = None

def check_ai_service():
    """Check if AI service is available"""
    if ai_service is None:
        raise HTTPException(
            status_code=503,
            detail="AI Service is not available. Please check server logs."
        )
# Optional imports for advanced features
try:
    from services.api_integration_service import api_integration_service
    from services.user_context_manager import user_context_manager
    ADVANCED_FEATURES_AVAILABLE = True
except ImportError as e:
    print(f"Warning: Advanced features not available: {str(e)}")
    print("This is normal if you haven't installed all optional dependencies")
    api_integration_service = None
    user_context_manager = None
    ADVANCED_FEATURES_AVAILABLE = False
from utils import (
    generate_anon_token, 
    extract_client_ip, 
    get_user_agent, 
    sanitize_input,
    is_banned_keyword,
    create_rate_limit_key,
    is_factsheet_search_query,
    extract_search_term,
    is_medicine_schedule_query,
    extract_date_from_query
)
from models import (
    BotQueryRequest, 
    BotQueryResponse, 
    SupplementRecommendationRequest,
    SupplementRecommendationResponse,
    AdminLogFilter,
    RateLimitInfo,
    Supplement,
    Medicine,
    Vaccine,
    MedicineSchedule,
    VaccineSchedule,
    CreateMedicalProfileRequest,
    UpdateMedicalProfileRequest,
    AddMedicineRequest,
    AddSupplementRequest,
    AddVaccineRequest,
    PersonalizedAdviceRequest
)

# Configure logging with lazy % formatting
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    global ai_service
    
    # Startup
    logger.info("Starting Health Compass AI System...")
    try:
        await db.connect()
        logger.info("Database connection attempted")
    except Exception as e:
        logger.warning("Database connection failed: %s - continuing without database", str(e))
    
    # Initialize AI service
    try:
        ai_service = AIService(database=db)
        await ai_service.initialize()
        logger.info("AI Service initialized successfully")
    except Exception as e:
        logger.error("Failed to initialize AI Service: %s", str(e))
        ai_service = None
    
    logger.info("Health Compass AI System started successfully")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Health Compass AI System...")
    await db.disconnect()
    logger.info("Health Compass AI System shutdown complete")

# Create FastAPI app
app = FastAPI(
    title="Health Compass AI System",
    description="AI-powered health supplement, medicine, and vaccine recommendation and chatbot system",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def get_identifier(request: Request) -> str:
    """Extract identifier for rate limiting (IP or anon token)"""
    # Check if anon token exists in cookies or headers
    anon_token = request.cookies.get("anon_token") or request.headers.get("X-Anon-Token")
    
    if anon_token:
        return anon_token
    else:
        # Use IP address as fallback
        return extract_client_ip(request)

async def check_rate_limit(request: Request, identifier: str = Depends(get_identifier)):
    """Check rate limit for the request"""
    rate_limit_key = create_rate_limit_key(identifier, "api")
    
    allowed, reset_time = await rate_limiter.check_rate_limit(rate_limit_key)
    
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "Rate limit exceeded",
                "reset_time": reset_time.isoformat() if reset_time else None,
                "message": "Too many requests. Please try again later."
            }
        )

@app.post("/api/bot/ask", response_model=BotQueryResponse)
async def ask_bot(
    request: BotQueryRequest,
    background_tasks: BackgroundTasks,
    identifier: str = Depends(get_identifier),
    anon_header: Optional[str] = Header(None, alias="X-Anon-Token"),
    _: None = Depends(check_rate_limit)
):
    """
    Main AI chatbot endpoint
    
    Route user queries to OpenAI and inject supplement, medicine, or vaccine context if provided
    """
    try:
        # Sanitize input
        sanitized_query = sanitize_input(request.query)
        
        # Check for banned keywords
        if is_banned_keyword(sanitized_query):
            raise HTTPException(
                status_code=400,
                detail="Query contains inappropriate content"
            )
        
        # Accept anon_token or user_token for conversation memory
        anon_token = request.anon_token or request.user_token or anon_header
        if not anon_token:
            raise HTTPException(
                status_code=400,
                detail="Missing anon_token or user_token. Send it in header 'X-Anon-Token' and in body as 'anon_token' or user_token."
            )
        
        # 🔍 PRIORITY 1: Check if this is a medicine schedule query
        if is_medicine_schedule_query(sanitized_query):
            logger.info("Detected medicine schedule query: %s", sanitized_query)
            
            # Extract date from query if present
            extracted_date = extract_date_from_query(sanitized_query)
            logger.info("Extracted date from query: %s", extracted_date)
            
            # For medicine schedule queries, we need a user token
            # Since this endpoint doesn't have user authentication, we'll provide a helpful response
            # directing users to use the medicine-schedule endpoint
            if extracted_date:
                response_text = f"I can help you with your medicine schedule for {extracted_date}! However, to access your personal medicine schedule, you'll need to use the dedicated medicine schedule endpoint with your user token.\n\nPlease use:\n`POST /api/bot/medicine-schedule`\nwith your user token and the date: {extracted_date}"
            else:
                response_text = "I can help you with your medicine schedule! However, to access your personal medicine schedule, you'll need to use the dedicated medicine schedule endpoint with your user token.\n\nPlease use:\n`POST /api/bot/medicine-schedule`\nwith your user token."
            
            # Create medicine schedule response
            medicine_schedule_response = BotQueryResponse(
                response=response_text,
                metadata={
                    "model_used": "medicine_schedule_detector",
                    "tokens_used": 0,
                    "query_type": "medicine_schedule_redirect",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "has_supplement_context": False,
                    "has_medicine_context": False,
                    "has_vaccine_context": False,
                    "off_topic": False,
                    "extracted_date": extracted_date
                },
                disclaimer="For personalized medicine schedule access, use the /api/bot/medicine-schedule endpoint with your user token.",
                supplement_context=None,
                medicine_context=None,
                vaccine_context=None
            )
            
            # Log the medicine schedule redirect
            background_tasks.add_task(
                log_ai_query,
                f"Medicine schedule query redirect: {sanitized_query}",
                medicine_schedule_response.response,
                medicine_schedule_response.metadata,
                None, None, None, anon_token, True
            )
            
            # Return medicine schedule redirect response
            response_headers = {"X-Anon-Token": anon_token}
            return JSONResponse(
                content=medicine_schedule_response.dict(),
                headers=response_headers
            )
        
        # 🔍 PRIORITY 2: Check if query is health-related BEFORE processing
        is_health_related = await ai_service._is_health_related_query(sanitized_query)
        logger.info("Query health-related check result: %s", is_health_related)
        
        if not is_health_related:
            logger.info("Query is NOT health-related, blocking to save tokens: %s", sanitized_query)
            
            # Block non-health questions to save tokens
            blocked_response = BotQueryResponse(
                response="I'm designed to help with health-related topics like supplements, medicines, vaccines, symptoms, and wellness. I cannot answer questions about programming, general knowledge, or other non-health topics. Please ask a health question, and I'll be happy to help! 💊🏥",
                metadata={
                    "model_used": "health_filter",
                    "tokens_used": 0,
                    "query_type": "non_health_blocked",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "has_supplement_context": False,
                    "has_medicine_context": False,
                    "has_vaccine_context": False,
                    "off_topic": True,
                    "reason": "Query not health-related, blocked to save tokens"
                },
                disclaimer="This response was blocked to save AI tokens. Only health-related questions are processed.",
                supplement_context=None,
                medicine_context=None,
                vaccine_context=None
            )
            
            # Log the blocked query
            background_tasks.add_task(
                log_ai_query,
                f"Non-health query blocked: {sanitized_query}",
                blocked_response.response,
                blocked_response.metadata,
                None, None, None, anon_token, True
            )
            
            # Return blocked response
            response_headers = {"X-Anon-Token": anon_token}
            return JSONResponse(
                content=blocked_response.dict(),
                headers=response_headers
            )
        
        # 🔍 PRIORITY 3: Check if user has an ongoing conversation state (BEFORE factsheet search)
        if anon_token and db:
            try:
                logger.info("🔍 Checking conversation state for token: %s", anon_token)
                existing_state = await db.get_conversation_state(anon_token)
                logger.info("🔍 Retrieved conversation state: %s", existing_state)
                
                if existing_state and existing_state.get("state") in ["collecting_medicine", "collecting_supplement", "collecting_vaccine", "collecting_medicine_schedule", "collecting_supplement_schedule", "collecting_vaccine_schedule", "confirming"]:
                    logger.info("✅ User has ongoing conversation state: %s, continuing creation flow", existing_state.get("state"))
                    # Continue the creation flow instead of doing factsheet search
                    ai_response_data = await ai_service._handle_creation_flow(sanitized_query, anon_token, None, existing_state)
                    
                    # Log the creation flow continuation
                    background_tasks.add_task(
                        log_ai_query,
                        f"Creation flow continued: {existing_state.get('state')}",
                        ai_response_data["response"],
                        ai_response_data["metadata"],
                        None, None, None, anon_token, True
                    )
                    
                    # Prepare response for creation flow
                    response = BotQueryResponse(
                        response=ai_response_data["response"],
                        metadata=ai_response_data["metadata"],
                        disclaimer=ai_response_data["disclaimer"],
                        supplement_context=None,
                        medicine_context=None,
                        vaccine_context=None
                    )
                    
                    # Return response headers
                    response_headers = {"X-Anon-Token": anon_token}
                    return JSONResponse(
                        content=response.dict(),
                        headers=response_headers
                    )
                else:
                    logger.info("❌ No ongoing conversation state found or state not in creation flow")
            except Exception as e:
                logger.warning("Failed to check conversation state: %s", str(e))
        
        # 🔍 PRIORITY 4: Check if this is a factsheet search query (health-related queries only)
        logger.info("🔍 Checking if query is factsheet search: '%s'", sanitized_query)
        if is_factsheet_search_query(sanitized_query):
            # Extract search term and build robust variants (synonyms) like the dedicated factsheet endpoint
            search_term = extract_search_term(sanitized_query)
            logger.info("✅ Detected factsheet search query for: %s", search_term)

            def _build_query_variants(q: str) -> list:
                base = q.strip()
                lower = base.lower()
                preambles = [
                    "what is", "tell me about", "information about", "explain",
                    "benefits of", "side effects of", "dosage of", "how to take",
                    "details about", "learn about"
                ]
                for p in preambles:
                    if p in lower:
                        idx = lower.find(p) + len(p)
                        lower = lower[idx:].strip()
                        break
                import re
                cleaned = re.sub(r"^[^a-z0-9]+|[^a-z0-9]+$", "", lower)
                cleaned = re.sub(r"\s+", " ", cleaned)

                variants = [search_term, cleaned]

                synonyms = {
                    "vitamin d3": ["cholecalciferol", "vitamin d", "vit d3", "d3"],
                    "vitamin d": ["cholecalciferol", "vit d"],
                    "vitamin c": ["ascorbic acid", "vit c"],
                    "vitamin b12": ["cobalamin", "vit b12", "b12"],
                    "omega 3": ["omega-3", "fish oil"],
                    "omega-3": ["omega 3", "fish oil"],
                    "paracetamol": ["acetaminophen"],
                    "ibuprofen": ["advil", "motrin"],
                }
                for key, syns in synonyms.items():
                    if key in cleaned:
                        variants.extend(syns)
                seen = set()
                ordered = []
                for v in variants:
                    vv = v.strip()
                    if vv and vv not in seen:
                        seen.add(vv)
                        ordered.append(vv)
                return ordered

            variants = _build_query_variants(sanitized_query)

            # Search for items in database using variants until we get hits
            search_results = {}
            supplement_results = []
            medicine_results = []
            vaccine_results = []
            for v in variants:
                if not supplement_results:
                    sr = await db.search_supplements(v)
                    if sr:
                        supplement_results = sr
                        search_results["supplements"] = supplement_results
                if not medicine_results:
                    mr = await db.search_medicines(v)
                    if mr:
                        medicine_results = mr
                        search_results["medicines"] = mr
                if not vaccine_results:
                    vr = await db.search_vaccines(v)
                    if vr:
                        vaccine_results = vr
                        search_results["vaccines"] = vr
            
            if search_results:
                # ✅ DATABASE DATA FOUND - Use factsheet data
                logger.info("✅ Factsheet data found in database for: %s", search_term)
                
                # Generate structured response using AI
                ai_response_data = await ai_service.search_and_structure_factsheet(
                    query=sanitized_query,
                    search_results=search_results
                )
                
                # Log the factsheet search
                background_tasks.add_task(
                    log_ai_query,
                    f"Factsheet search (database data): {search_term}",
                    ai_response_data["response"],
                    ai_response_data["metadata"],
                    None, None, None, anon_token, True
                )
                
                # Prepare response for factsheet search
                response = BotQueryResponse(
                    response=ai_response_data["response"],
                    metadata=ai_response_data["metadata"],
                    disclaimer=ai_response_data["disclaimer"],
                    supplement_context=supplement_results[0] if supplement_results else None,
                    medicine_context=medicine_results[0] if medicine_results else None,
                    vaccine_context=vaccine_results[0] if vaccine_results else None
                )
                
                # Return structured factsheet response
                response_headers = {"X-Anon-Token": anon_token}
                return JSONResponse(
                    content=response.dict(),
                    headers=response_headers
                )
            else:
                # ❌ NO DATABASE DATA - Fallback to GPT-4 for general information
                logger.info("❌ No factsheet data found for '%s', using GPT-4 fallback", search_term)
                
                # Create a fallback prompt for GPT-4
                fallback_prompt = f"""The user asked: "{sanitized_query}"

I couldn't find specific factsheet information about '{search_term}' in our database, but I can provide general educational information.

Please provide helpful, educational information about this topic, including:
1. What it is (if it's a supplement, medicine, vaccine, or other health-related item)
2. General benefits or uses (if applicable)
3. Important safety considerations
4. Educational context

IMPORTANT: Start your response with "🤖 **GPT-4 GENERATED INFORMATION**" to clearly indicate this is AI-generated content, not from a database factsheet.

Remember: This is for educational purposes only. Always encourage consulting healthcare professionals for specific medical advice."""
                
                # Generate response using GPT-4
                ai_response_data = await ai_service.generate_response(
                    query=fallback_prompt,
                    supplement_context=None,
                    medicine_context=None,
                    vaccine_context=None
                )
                
                # Update metadata to indicate this was a GPT-4 fallback
                ai_response_data["metadata"].update({
                    "search_type": "gpt4_fallback",
                    "query": sanitized_query,
                    "search_term": search_term,
                    "results_count": 0,
                    "fallback_used": True,
                    "data_source": "gpt4_generated",
                    "database_used": False
                })
                
                # Log the GPT-4 fallback
                background_tasks.add_task(
                    log_ai_query,
                    f"GPT-4 fallback for: {search_term}",
                    ai_response_data["response"],
                    ai_response_data["metadata"],
                    None, None, None, anon_token, True
                )
                
                # Prepare response for GPT-4 fallback
                response = BotQueryResponse(
                    response=ai_response_data["response"],
                    metadata=ai_response_data["metadata"],
                    disclaimer=ai_response_data["disclaimer"],
                    supplement_context=None,
                    medicine_context=None,
                    vaccine_context=None
                )
                
                # Return GPT-4 fallback response
                response_headers = {"X-Anon-Token": anon_token}
                return JSONResponse(
                    content=response.dict(),
                    headers=response_headers
                )
        else:
            # 🔍 PRIORITY 4: Regular health queries (not factsheet searches)
            # Initialize context variables
            supplement_context = None
            medicine_context = None
            vaccine_context = None
            
            # Prepare context based on what's provided
            if request.supplement_id:
                # Fetch supplement details from database
                supplement_data = await db.get_supplement(request.supplement_id)
                if supplement_data:
                    supplement_context = {"supplement_info": supplement_data}
            
            if request.medicine_id:
                # Fetch medicine details from database
                medicine_data = await db.get_medicine(request.medicine_id)
                if medicine_data:
                    medicine_context = {"medicine_info": medicine_data}
            
            if request.vaccine_id:
                # Fetch vaccine details from database
                vaccine_data = await db.get_vaccine(request.vaccine_id)
                if vaccine_data:
                    vaccine_context = {"vaccine_info": vaccine_data}
            
            # Generate AI response for regular health queries
            try:
                ai_response_data = await ai_service.generate_response(
                    query=sanitized_query,
                    supplement_context=supplement_context,
                    medicine_context=medicine_context,
                    vaccine_context=vaccine_context
                )
            except Exception as e:
                logger.warning("Primary AI response failed, trying fallback: %s", str(e))
                # Fallback: try to generate a basic response
                ai_response_data = await ai_service.generate_response(
                    query=f"Please provide helpful information about: {sanitized_query}",
                    supplement_context=None,
                    medicine_context=None,
                    vaccine_context=None
                )
            
            # Prepare response
            response = BotQueryResponse(
                response=ai_response_data["response"],
                metadata=ai_response_data["metadata"],
                disclaimer=ai_response_data["disclaimer"],
                supplement_context=supplement_context,
                medicine_context=medicine_context,
                vaccine_context=vaccine_context
            )
            
            # Log the query asynchronously
            background_tasks.add_task(
                log_ai_query,
                sanitized_query,
                ai_response_data["response"],
                ai_response_data["metadata"],
                request.supplement_id,
                request.medicine_id,
                request.vaccine_id,
                anon_token,
                True
            )
            
            # Set anon token in response headers for future requests
            response_headers = {"X-Anon-Token": anon_token}
            
            return JSONResponse(
                content=response.dict(),
                headers=response_headers
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error in bot ask endpoint: %s", str(e))
        
        # Log failed query
        background_tasks.add_task(
            log_ai_query,
            request.query,
            "",
            {"error": str(e)},
            request.supplement_id,
            request.medicine_id,
            request.vaccine_id,
            request.anon_token or "unknown",
            False,
            str(e)
        )
        
        raise HTTPException(
            status_code=500,
            detail="Internal server error while processing your request"
        )

@app.post("/api/bot/comprehensive", response_model=BotQueryResponse)
async def comprehensive_bot_query(
    request: BotQueryRequest,
    background_tasks: BackgroundTasks,
    identifier: str = Depends(get_identifier),
    anon_header: Optional[str] = Header(None, alias="X-Anon-Token"),
    _: None = Depends(check_rate_limit)
):
    """
    Comprehensive AI chatbot endpoint with intelligent query routing
    
    Flow:
    1. Check if health-related
    2. If health-related: Check creation intent → If yes: Start creation flow
    3. If personal query (medicine schedule): Check data availability → Return appropriate response
    4. If factsheet search: Search factsheet → Found: return data, Not found: GPT fallback
    5. If not health-related: Show off-topic message
    """
    try:
        # Check if AI service is available
        check_ai_service()
        
        # Sanitize input
        sanitized_query = sanitize_input(request.query)
        
        # Check for banned keywords
        if is_banned_keyword(sanitized_query):
            raise HTTPException(
                status_code=400,
                detail="Query contains inappropriate content"
            )
        
        # Generate a simple session ID for conversation memory
        anon_token = f"session_{identifier}"
        
        logger.info("Processing comprehensive query: %s", sanitized_query)
        
        # Use the comprehensive query processing method
        comprehensive_response_data = await ai_service.process_comprehensive_query(
            query=sanitized_query,
            anon_token=anon_token
        )
        
        # Create BotQueryResponse from comprehensive data
        response = BotQueryResponse(
            response=comprehensive_response_data["response"],
            metadata=comprehensive_response_data["metadata"],
            disclaimer=comprehensive_response_data["disclaimer"],
            supplement_context=comprehensive_response_data.get("supplement_context"),
            medicine_context=comprehensive_response_data.get("medicine_context"),
            vaccine_context=comprehensive_response_data.get("vaccine_context")
        )
        
        # Log the comprehensive query
        background_tasks.add_task(
            log_ai_query,
            f"Comprehensive query: {sanitized_query}",
            comprehensive_response_data["response"],
            comprehensive_response_data["metadata"],
            None, None, None, anon_token, True
        )
        
        # Return response with anon token header
        response_headers = {"X-Anon-Token": anon_token}
        return JSONResponse(
            content=response.dict(),
            headers=response_headers
        )
        
    except Exception as e:
        logger.error("Failed to process comprehensive query: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process comprehensive query: {str(e)}"
        )

@app.post("/api/bot/comprehensive-with-auth", response_model=BotQueryResponse)
async def comprehensive_bot_query_with_auth(
    request: BotQueryRequest,
    background_tasks: BackgroundTasks,
    identifier: str = Depends(get_identifier),
    authorization: Optional[str] = Header(None),
    _: None = Depends(check_rate_limit)
):
    """
    Comprehensive AI chatbot endpoint with JWT authentication support
    
    This endpoint supports both anonymous and authenticated users.
    For authenticated users, it can access personal data and create items.
    """
    try:
        # Check if AI service is available
        check_ai_service()
        
        # Sanitize input
        sanitized_query = sanitize_input(request.query)
        
        # Check for banned keywords
        if is_banned_keyword(sanitized_query):
            raise HTTPException(
                status_code=400,
                detail="Query contains inappropriate content"
            )
        
        # Accept anon_token or user_token for conversation memory (even with JWT)
        anon_token = request.anon_token or request.user_token or anon_header
        if not anon_token:
            raise HTTPException(
                status_code=400,
                detail="Missing anon_token. Send it in header 'X-Anon-Token' and in body as 'anon_token'."
            )
        
        # Extract JWT token from Authorization header
        user_jwt = None
        if authorization and authorization.startswith("Bearer "):
            user_jwt = authorization[7:]  # Remove "Bearer " prefix
            logger.info("Processing authenticated query with JWT")
        else:
            logger.info("Processing anonymous query")
        
        logger.info("Processing comprehensive query with auth: %s", sanitized_query)
        
        # Use the comprehensive query processing method with JWT support
        comprehensive_response_data = await ai_service.process_comprehensive_query(
            query=sanitized_query,
            anon_token=anon_token,
            user_jwt=user_jwt
        )
        
        # Note: Removed the problematic JWT bypass logic that was causing conversation state issues
        # The comprehensive query processing already handles JWT users properly
        
        # Create BotQueryResponse from comprehensive data
        response = BotQueryResponse(
            response=comprehensive_response_data["response"],
            metadata=comprehensive_response_data["metadata"],
            disclaimer=comprehensive_response_data["disclaimer"],
            supplement_context=comprehensive_response_data.get("supplement_context"),
            medicine_context=comprehensive_response_data.get("medicine_context"),
            vaccine_context=comprehensive_response_data.get("vaccine_context")
        )
        
        # Log the comprehensive query
        background_tasks.add_task(
            log_ai_query,
            f"Comprehensive query with auth: {sanitized_query}",
            comprehensive_response_data["response"],
            comprehensive_response_data["metadata"],
            None, None, None, anon_token, True
        )
        
        # Return response with anon token header
        response_headers = {"X-Anon-Token": anon_token}
        return JSONResponse(
            content=response.dict(),
            headers=response_headers
        )
        
    except Exception as e:
        logger.error("Failed to process comprehensive query with auth: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process comprehensive query: {str(e)}"
        )

@app.post("/api/bot/recommend", response_model=SupplementRecommendationResponse)
async def get_supplement_recommendations(
    request: SupplementRecommendationRequest,
    background_tasks: BackgroundTasks,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """
    AI-based supplement recommendation endpoint
    
    Deliver 2-3 supplements based on tags and properties
    """
    try:
        # Sanitize input
        sanitized_tags = [sanitize_input(tag, max_length=100) for tag in request.tags]
        sanitized_properties = {
            k: sanitize_input(str(v), max_length=200) 
            for k, v in request.properties.items()
        }
        
        # Generate recommendations
        recommendations_data = await ai_service.get_supplement_recommendations(
            tags=sanitized_tags,
            properties=sanitized_properties
        )
        
        response = SupplementRecommendationResponse(
            recommendations=recommendations_data["recommendations"],
            reasoning=recommendations_data["reasoning"]
        )
        
        # Log the recommendation request
        background_tasks.add_task(
            log_ai_query,
            f"Recommendation request: {', '.join(sanitized_tags)}",
            recommendations_data["reasoning"],
            recommendations_data["metadata"],
            None,
            None,
            None,
            request.anon_token or "unknown",
            True
        )
        
        return response
        
    except Exception as e:
        logger.error("Error in supplement recommendation endpoint: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to generate supplement recommendations"
        )

@app.post("/api/bot/factsheet-search")
async def search_factsheet(
    request: BotQueryRequest,
    background_tasks: BackgroundTasks,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """
    Search for supplements, medicines, or vaccines in database and structure factsheet information
    
    This endpoint automatically searches the database when users ask "what is [name]?"
    """
    try:
        # Sanitize input
        sanitized_query = sanitize_input(request.query)
        
        # Check for banned keywords
        if is_banned_keyword(sanitized_query):
            raise HTTPException(
                status_code=400,
                detail="Query contains inappropriate content"
            )
        
        # Generate or use existing anon token
        anon_token = request.anon_token or generate_anon_token()
        
        # Search for items in database (with variants & synonyms)
        search_results = {}

        def _build_query_variants(q: str) -> list:
            base = q.strip()
            lower = base.lower()
            # Remove common preambles
            preambles = [
                "what is", "tell me about", "information about", "explain",
                "benefits of", "side effects of", "dosage of", "how to take",
                "details about", "learn about"
            ]
            for p in preambles:
                if p in lower:
                    idx = lower.find(p) + len(p)
                    lower = lower[idx:].strip()
                    break
            import re
            cleaned = re.sub(r"^[^a-z0-9]+|[^a-z0-9]+$", "", lower)
            cleaned = re.sub(r"\s+", " ", cleaned)

            variants = [q, cleaned]

            # Synonyms for common supplements/vitamins
            synonyms = {
                "vitamin d3": ["cholecalciferol", "vitamin d", "vit d3", "d3"],
                "vitamin d": ["cholecalciferol", "vit d"],
                "vitamin c": ["ascorbic acid", "vit c"],
                "vitamin b12": ["cobalamin", "vit b12", "b12"],
                "omega 3": ["omega-3", "fish oil"],
                "omega-3": ["omega 3", "fish oil"],
                "paracetamol": ["acetaminophen"],
                "ibuprofen": ["advil", "motrin"],
            }
            for key, syns in synonyms.items():
                if key in cleaned:
                    variants.extend(syns)
            # De-duplicate while preserving order
            seen = set()
            ordered = []
            for v in variants:
                vv = v.strip()
                if vv and vv not in seen:
                    seen.add(vv)
                    ordered.append(vv)
            return ordered

        variants = _build_query_variants(sanitized_query)

        # Try supplements/medicines/vaccines with variants until we get hits
        supplement_results = []
        medicine_results = []
        vaccine_results = []
        for v in variants:
            if not supplement_results:
                sr = await db.search_supplements(v)
                if sr:
                    supplement_results = sr
                    search_results["supplements"] = supplement_results
            if not medicine_results:
                mr = await db.search_medicines(v)
                if mr:
                    medicine_results = mr
                    search_results["medicines"] = medicine_results
            if not vaccine_results:
                vr = await db.search_vaccines(v)
                if vr:
                    vaccine_results = vr
                    search_results["vaccines"] = vaccine_results
        
        if not search_results:
            # No results found in database, fallback to GPT-4 for general information
            logger.info("No factsheet data found for '%s', falling back to GPT-4", sanitized_query)
            
            # Create a fallback prompt for GPT-4
            fallback_prompt = f"""The user asked: "{sanitized_query}"

I couldn't find specific factsheet information about '{sanitized_query}' in our database, but I can provide general educational information.

Please provide helpful, educational information about this topic, including:
1. What it is (if it's a supplement, medicine, vaccine, or other health-related item)
2. General benefits or uses (if applicable)
3. Important safety considerations
4. Educational context

Remember: This is for educational purposes only. Always encourage consulting healthcare professionals for specific medical advice."""
            
            # Generate response using GPT-4
            ai_response_data = await ai_service.generate_response(
                query=fallback_prompt,
                supplement_context=None,
                medicine_context=None,
                vaccine_context=None
            )
            
            # Update metadata to indicate this was a GPT-4 fallback
            ai_response_data["metadata"].update({
                "search_type": "gpt4_fallback",
                "query": sanitized_query,
                "results_count": 0,
                "fallback_used": True,
                "timestamp": datetime.utcnow().isoformat()
            })
            
            # Log the GPT-4 fallback
            background_tasks.add_task(
                log_ai_query,
                f"GPT-4 fallback for: {sanitized_query}",
                ai_response_data["response"],
                ai_response_data["metadata"],
                None,
                None,
                None,
                anon_token,
                True
            )
            
            # Return GPT-4 fallback response
            response_headers = {"X-Anon-Token": anon_token}
            return JSONResponse(
                content=ai_response_data,
                headers=response_headers
            )
        
        # Generate structured response using AI
        ai_response_data = await ai_service.search_and_structure_factsheet(
            query=sanitized_query,
            search_results=search_results
        )
        
        # Log the factsheet search
        background_tasks.add_task(
            log_ai_query,
            f"Factsheet search: {sanitized_query}",
            ai_response_data["response"],
            ai_response_data["metadata"],
            None,
            None,
            None,
            anon_token,
            True
        )
        
        # Set anon token in response headers for future requests
        response_headers = {"X-Anon-Token": anon_token}
        
        return JSONResponse(
            content=ai_response_data,
            headers=response_headers
        )
        
    except Exception as e:
        logger.error("Error in factsheet search endpoint: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to search factsheet information"
        )

# Supplement Management Endpoints
@app.post("/api/supplements")
async def create_supplement(
    supplement: Supplement,
    background_tasks: BackgroundTasks,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """Create a new supplement"""
    try:
        supplement_data = supplement.dict()
        supplement_id = await db.insert_supplement(supplement_data)
        
        logger.info("Supplement created with ID: %s", supplement_id)
        return {"id": supplement_id, "message": "Supplement created successfully"}
        
    except Exception as e:
        logger.error("Error creating supplement: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to create supplement"
        )

@app.post("/api/supplements/comprehensive")
async def create_comprehensive_supplement(
    supplement_data: dict,
    background_tasks: BackgroundTasks,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """Create a comprehensive supplement with flexible data structure"""
    try:
        # Create a flexible supplement document that matches what the user provided
        # This bypasses the strict Supplement model validation
        flexible_supplement_data = {
            "name": supplement_data.get("medicineName", "Unknown"),
            "description": supplement_data.get("description", "General use"),
            "ingredients": [supplement_data.get("medicineName", "Unknown")],
            "benefits": [supplement_data.get("takenForSymptoms", "General health")],
            "risks": ["Consult healthcare provider"],
            "usage": f"Take as directed by healthcare provider",
            "dosage": supplement_data.get("dosage", "Standard"),
            "category": "General",
            "price": supplement_data.get("price", "0"),
            "quantity": supplement_data.get("quantity", 0),
            "brand_name": supplement_data.get("brand_name", "Generic"),
            "manufacturer": supplement_data.get("manufacturer", "Unknown"),
            "expiration_date": supplement_data.get("expDate", "Unknown"),
            "created_by": identifier,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        
        # Use the database insert method directly with flexible data
        supplement_id = await db.insert_supplement(flexible_supplement_data)
        
        logger.info("Comprehensive supplement created with ID: %s", supplement_id)
        return {
            "id": supplement_id, 
            "message": f"Supplement '{flexible_supplement_data['name']}' created successfully with comprehensive details"
        }
        
    except Exception as e:
        logger.error("Error creating comprehensive supplement: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to create comprehensive supplement"
        )

@app.get("/api/supplements/{supplement_id}")
async def get_supplement(
    supplement_id: str,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """Get supplement by ID"""
    try:
        supplement = await db.get_supplement(supplement_id)
        if not supplement:
            raise HTTPException(status_code=404, detail="Supplement not found")
        
        return supplement
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error retrieving supplement: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve supplement"
        )

@app.get("/api/supplements/search/{query}")
async def search_supplements(
    query: str,
    limit: int = 10,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """Search supplements"""
    try:
        supplements = await db.search_supplements(query, limit)
        return {"supplements": supplements, "total": len(supplements)}
        
    except Exception as e:
        logger.error("Error searching supplements: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to search supplements"
        )

# Medicine Management Endpoints
@app.post("/api/medicines")
async def create_medicine(
    medicine: Medicine,
    background_tasks: BackgroundTasks,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """Create a new medicine"""
    try:
        medicine_data = medicine.dict()
        medicine_id = await db.insert_medicine(medicine_data)
        
        logger.info("Medicine created with ID: %s", medicine_id)
        return {"id": medicine_id, "message": "Medicine created successfully"}
        
    except Exception as e:
        logger.error("Error creating medicine: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to create medicine"
        )

@app.get("/api/medicines/{medicine_id}")
async def get_medicine(
    medicine_id: str,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """Get medicine by ID"""
    try:
        medicine = await db.get_medicine(medicine_id)
        if not medicine:
            raise HTTPException(status_code=404, detail="Medicine not found")
        
        return medicine
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error retrieving medicine: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve medicine"
        )

@app.get("/api/medicines/search/{query}")
async def search_medicines(
    query: str,
    limit: int = 10,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """Search medicines"""
    try:
        medicines = await db.search_medicines(query, limit)
        return {"medicines": medicines, "total": len(medicines)}
        
    except Exception as e:
        logger.error("Error searching medicines: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to search medicines"
        )

# Vaccine Management Endpoints
@app.post("/api/vaccines")
async def create_vaccine(
    vaccine: Vaccine,
    background_tasks: BackgroundTasks,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """Create a new vaccine"""
    try:
        vaccine_data = vaccine.dict()
        vaccine_id = await db.insert_vaccine(vaccine_data)
        
        logger.info("Vaccine created with ID: %s", vaccine_id)
        return {"id": vaccine_id, "message": "Vaccine created successfully"}
        
    except Exception as e:
        logger.error("Error creating vaccine: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to create vaccine"
        )

@app.post("/api/vaccines/comprehensive")
async def create_comprehensive_vaccine(
    vaccine_data: dict,
    background_tasks: BackgroundTasks,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """Create a comprehensive vaccine with flexible data structure"""
    try:
        # Map the user's data to the expected database structure
        mapped_vaccine_data = {
            "name": vaccine_data.get("name", "Unknown"),
            "generic_name": vaccine_data.get("name", "Unknown"),
            "description": vaccine_data.get("description", "General use"),
            "active_ingredients": [vaccine_data.get("name", "Unknown")],
            "dosage_forms": [vaccine_data.get("dosage", "Standard")],
            "indications": [vaccine_data.get("description", "General use")],
            "contraindications": ["Consult healthcare provider"],
            "side_effects": ["Consult healthcare provider"],
            "interactions": ["Consult healthcare provider"],
            "price": vaccine_data.get("price", "0"),
            "quantity": vaccine_data.get("quantity", 0),
            "brand_name": vaccine_data.get("brand_name", "Generic"),
            "manufacturer": vaccine_data.get("manufacturer", "Unknown"),
            "expiration_date": vaccine_data.get("expiration_date", "Unknown"),
            "age_group": vaccine_data.get("age_group", "General"),
            "created_by": identifier,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        
        vaccine_id = await db.insert_vaccine(mapped_vaccine_data)
        
        logger.info("Comprehensive vaccine created with ID: %s", vaccine_id)
        return {
            "id": vaccine_id, 
            "message": f"Vaccine '{mapped_vaccine_data['name']}' created successfully with comprehensive details"
        }
        
    except Exception as e:
        logger.error("Error creating comprehensive vaccine: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to create comprehensive vaccine"
        )

@app.get("/api/vaccines/{vaccine_id}")
async def get_vaccine(
    vaccine_id: str,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """Get vaccine by ID"""
    try:
        vaccine = await db.get_vaccine(vaccine_id)
        if not vaccine:
            raise HTTPException(status_code=404, detail="Vaccine not found")
        
        return vaccine
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error retrieving vaccine: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve vaccine"
        )

@app.get("/api/vaccines/search/{query}")
async def search_vaccines(
    query: str,
    limit: int = 10,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """Search vaccines"""
    try:
        vaccines = await db.search_vaccines(query, limit)
        return {"vaccines": vaccines, "total": len(vaccines)}
        
    except Exception as e:
        logger.error("Error searching vaccines: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to search vaccines"
        )

# Medicine Scheduling Endpoints
@app.post("/api/medicines/schedule")
async def create_medicine_schedule(
    schedule: MedicineSchedule,
    background_tasks: BackgroundTasks,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """Create a new medicine schedule"""
    try:
        schedule_data = schedule.dict()
        schedule_id = await db.insert_medicine_schedule(schedule_data)
        
        logger.info("Medicine schedule created with ID: %s", schedule_id)
        return {"id": schedule_id, "message": "Medicine schedule created successfully"}
        
    except Exception as e:
        logger.error("Error creating medicine schedule: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to create medicine schedule"
        )

@app.get("/api/medicines/schedule/{anon_token}")
async def get_medicine_schedules(
    anon_token: str,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """Get medicine schedules for a user"""
    try:
        schedules = await db.get_medicine_schedules(anon_token)
        return {"schedules": schedules, "total": len(schedules)}
        
    except Exception as e:
        logger.error("Error retrieving medicine schedules: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve medicine schedules"
        )

@app.put("/api/medicines/schedule/{schedule_id}")
async def update_medicine_schedule(
    schedule_id: str,
    update_data: dict,
    background_tasks: BackgroundTasks,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """Update a medicine schedule"""
    try:
        success = await db.update_medicine_schedule(schedule_id, update_data)
        if not success:
            raise HTTPException(status_code=404, detail="Schedule not found")
        
        return {"message": "Medicine schedule updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error updating medicine schedule: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to update medicine schedule"
        )

# Vaccine Scheduling Endpoints
@app.post("/api/vaccines/schedule")
async def create_vaccine_schedule(
    schedule: VaccineSchedule,
    background_tasks: BackgroundTasks,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """Create a new vaccine schedule"""
    try:
        schedule_data = schedule.dict()
        schedule_id = await db.insert_vaccine_schedule(schedule_data)
        
        logger.info("Vaccine schedule created with ID: %s", schedule_id)
        return {"id": schedule_id, "message": "Vaccine schedule created successfully"}
        
    except Exception as e:
        logger.error("Error creating vaccine schedule: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to create vaccine schedule"
        )

@app.get("/api/vaccines/schedule/{anon_token}")
async def get_vaccine_schedules(
    anon_token: str,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """Get vaccine schedules for a user"""
    try:
        schedules = await db.get_vaccine_schedules(anon_token)
        return {"schedules": schedules, "total": len(schedules)}
        
    except Exception as e:
        logger.error("Error retrieving vaccine schedules: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve vaccine schedules"
        )

@app.put("/api/vaccines/schedule/{schedule_id}")
async def update_vaccine_schedule(
    schedule_id: str,
    update_data: dict,
    background_tasks: BackgroundTasks,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """Update a vaccine schedule"""
    try:
        success = await db.update_vaccine_schedule(schedule_id, update_data)
        if not success:
            raise HTTPException(status_code=404, detail="Schedule not found")
        
        return {"message": "Vaccine schedule updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error updating vaccine schedule: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to update vaccine schedule"
        )

@app.post("/api/supplements/{supplement_id}/view")
async def log_supplement_view(
    supplement_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
    identifier: str = Depends(get_identifier)
):
    """
    Log supplement detail page visit
    
    Async logging on each product detail page visit
    """
    try:
        # Extract client information
        client_ip = extract_client_ip(request)
        user_agent = get_user_agent(request)
        anon_token = request.cookies.get("anon_token") or request.headers.get("X-Anon-Token")
        
        # Log the view asynchronously
        background_tasks.add_task(
            log_supplement_view,
            supplement_id,
            anon_token,
            user_agent,
            client_ip
        )
        
        return {"message": "View logged successfully"}
        
    except Exception as e:
        logger.error("Error logging supplement view: %s", str(e))
        # Don't fail the request for logging errors
        return {"message": "View logged successfully"}

@app.get("/api/admin/logs/queries")
async def get_ai_query_logs(
    start_date: str = None,
    end_date: str = None,
    model: str = None,
    supplement_id: str = None,
    medicine_id: str = None,
    vaccine_id: str = None,
    anon_token: str = None,
    success: bool = None,
    limit: int = 100
):
    """
    Admin endpoint to retrieve AI query logs
    
    Filters: date range, model, supplementId, medicineId, vaccineId, anonToken, success
    """
    try:
        # Build filters
        filters = {}
        
        if start_date:
            try:
                from datetime import datetime
                filters["start_date"] = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid start_date format")
                
        if end_date:
            try:
                from datetime import datetime
                filters["end_date"] = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid end_date format")
                
        if model:
            filters["model"] = model
        if supplement_id:
            filters["supplement_id"] = supplement_id
        if medicine_id:
            filters["medicine_id"] = medicine_id
        if vaccine_id:
            filters["vaccine_id"] = vaccine_id
        if anon_token:
            filters["anon_token"] = anon_token
        if success is not None:
            filters["success"] = success
            
        # Get logs from database
        logs = await db.get_ai_query_logs(filters, limit)
        
        return {
            "logs": logs,
            "total": len(logs),
            "filters_applied": filters
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error retrieving AI query logs: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve query logs"
        )

@app.get("/api/admin/logs/views")
async def get_supplement_view_logs(
    start_date: str = None,
    end_date: str = None,
    supplement_id: str = None,
    anon_token: str = None,
    limit: int = 100
):
    """
    Admin endpoint to retrieve supplement view logs
    """
    try:
        # Build filters
        filters = {}
        
        if start_date:
            try:
                from datetime import datetime
                filters["start_date"] = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid start_date format")
                
        if end_date:
            try:
                from datetime import datetime
                filters["end_date"] = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid end_date format")
                
        if supplement_id:
            filters["supplement_id"] = supplement_id
        if anon_token:
            filters["anon_token"] = anon_token

        # Get logs from database
        logs = await db.get_supplement_view_logs(filters, limit)
        
        return {
            "logs": logs,
            "total": len(logs),
            "filters_applied": filters
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error retrieving supplement view logs: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve view logs"
        )

@app.get("/api/rate-limit/info")
async def get_rate_limit_info(
    identifier: str = Depends(get_identifier)
):
    """
    Get rate limit information for the current identifier
    """
    try:
        rate_limit_key = create_rate_limit_key(identifier, "api")
        
        remaining = await rate_limiter.get_remaining_requests(rate_limit_key)
        reset_time = await rate_limiter.get_reset_time(rate_limit_key)
        
        info = RateLimitInfo(
            remaining_requests=remaining,
            reset_time=reset_time,
            limit=settings.rate_limit_requests
        )
        
        return info
        
    except Exception as e:
        logger.error("Error getting rate limit info: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to get rate limit information"
        )

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "Health Compass AI System"}

@app.get("/test-greeting")
async def test_greeting():
    """Test endpoint to debug greeting logic"""
    test_query = "Hi, I'm Itisha and I have a headache. What should I do?, what medicine i should take now ?"
    
    # Test the greeting detection logic
    greeting_patterns = [
        "hello", "hi", "hey", "good morning", "good afternoon", "good evening",
        "my name is", "i'm", "i am", "call me", "this is", "introduce"
    ]
    
    is_greeting = any(pattern in test_query.lower() for pattern in greeting_patterns)
    
    # Check if there's also a health question in the same message
    question_indicators = ["what is", "tell me about", "explain", "can you", "how", "why", "when", "where", "can you tell me", "what", "tell me", "could you"]
    has_health_question = any(indicator in test_query.lower() for indicator in question_indicators)
    
    # Additional check: look for question marks or specific health terms
    if not has_health_question:
        health_terms = ["vitamin", "medicine", "supplement", "health", "disease", "symptom", "pain", "fever", "cold", "headache"]
        has_health_question = any(term in test_query.lower() for term in health_terms)
    
    # Final check: if the message is long enough and contains health terms, treat it as having a health question
    if not has_health_question and len(test_query.split()) > 8:
        has_health_question = True
    
    return {
        "test_query": test_query,
        "is_greeting": is_greeting,
        "has_health_question": has_health_question,
        "question_indicators_found": [indicator for indicator in question_indicators if indicator in test_query.lower()],
        "health_terms_found": [term for term in ["vitamin", "medicine", "supplement", "health", "disease", "symptom", "pain", "fever", "cold", "headache"] if term in test_query.lower()],
        "message_length": len(test_query.split())
    }

@app.post("/api/bot/fetch-user-data")
async def fetch_user_data(
    request: Request,
    background_tasks: BackgroundTasks,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """
    Fetch user data from Node.js APIs and provide personalized response
    """
    try:
        # Get request body
        body = await request.json()
        query = body.get("query", "")
        user_token = body.get("user_token", "")
        
        if not user_token:
            return {"error": "user_token is required"}
        
        # Generate user ID from token
        user_id = f"user_{hash(user_token) % 1000000}"
        
        # Fetch user data from Node.js APIs
        logger.info("Fetching user data for user: %s", user_id)
        
        # Get comprehensive user data
        if ADVANCED_FEATURES_AVAILABLE and api_integration_service:
            api_data = await api_integration_service.get_user_comprehensive_data(user_token)
        else:
            api_data = {"success": False, "error": "Advanced features not available", "data": {}}
        
        # Update user context with API data
        if ADVANCED_FEATURES_AVAILABLE and user_context_manager:
            user_context = user_context_manager.update_user_context(user_id, query, api_data.get("data", {}))
            context_summary = user_context_manager.get_context_summary(user_id)
        else:
            user_context = {"user_id": user_id, "query": query}
            context_summary = f"User ID: {user_id}\nQuery: {query}\nNote: Advanced context features not available"
        
        # Try to detect a supplement/medicine mentioned in the query and check interactions
        interactions_summary = ""
        try:
            q_lower = query.lower()
            candidate_names = []
            # Simple extraction for common supplement keywords
            for key in ["vitamin b12", "vitamin c", "vitamin d", "omega 3", "omega-3", "zinc", "iron", "calcium", "magnesium", "probiotics"]:
                if key in q_lower:
                    candidate_names.append(key)

            # If generic patterns like "can i take X" (single word/phrase)
            if not candidate_names:
                import re
                match = re.search(r"can i (?:take|use) ([a-z0-9\-\s]+)", q_lower)
                if match:
                    candidate = match.group(1).strip()
                    if len(candidate) > 1:
                        candidate_names.append(candidate)

            detected_interactions = []
            if candidate_names and ADVANCED_FEATURES_AVAILABLE:
                # Search supplement by name
                from database import db as _db
                supplements_found = []
                for name in candidate_names:
                    results = await _db.search_supplements(name, limit=1)
                    if results:
                        supplements_found.append(results[0])

                if supplements_found:
                    # Extract user medicine ids from api data
                    medicines_list = api_data.get("data", {}).get("medicines", [])
                    medicine_ids = []
                    for item in medicines_list:
                        # Try multiple shapes
                        for field in ["medicine_id", "medicineId", "_id", "id"]:
                            if field in item:
                                medicine_ids.append(item[field])
                                break
                        # Nested medicine object
                        if not medicine_ids and isinstance(item.get("medicine"), dict) and item["medicine"].get("_id"):
                            medicine_ids.append(item["medicine"]["_id"])

                    supplement_ids = [supp.get("_id") for supp in supplements_found if supp.get("_id")]
                    if medicine_ids and supplement_ids:
                        detected_interactions = await _db.check_drug_interactions(medicine_ids, supplement_ids)

            if detected_interactions:
                # Build a short interactions note to prepend to context
                notes = []
                for it in detected_interactions[:3]:
                    desc = it.get("description") or f"Potential interaction between {it.get('medicine')} and {it.get('supplement')}"
                    notes.append(f"- {desc}")
                interactions_summary = "\nPotential interactions detected based on your current medicines:\n" + "\n".join(notes) + "\n"
        except Exception as e:
            logger.warning("Interaction detection failed: %s", str(e))

        # Generate personalized response using AI (include interactions summary if present)
        enhanced_context = context_summary + ("\n" + interactions_summary if interactions_summary else "")
        ai_response_data = await ai_service.generate_personalized_response(query, enhanced_context, api_data.get("data", {}))
        
        # Log the personalized query
        background_tasks.add_task(
            log_ai_query,
            f"Personalized query with API data: {query}",
            ai_response_data["response"],
            ai_response_data["metadata"],
            None,
            None,
            None,
            user_token,
            True
        )
        
        return {
            "status": True,
            "data": {
                "response": ai_response_data["response"],
                "user_context": user_context,
                "api_data": api_data,
                "source": "python_bridge"
            },
            "message": "Personalized response generated successfully"
        }
        
    except Exception as e:
        logger.error("Error in fetch-user-data endpoint: %s", str(e))
        return {
            "status": False,
            "error": str(e),
            "message": "Failed to generate personalized response"
        }

@app.post("/api/bot/medicine-schedule")
async def get_medicine_schedule(
    request: Request,
    background_tasks: BackgroundTasks,
    identifier: str = Depends(get_identifier),
    _: None = Depends(check_rate_limit)
):
    """
    Get user's medicine schedule directly from database and provide personalized response
    """
    try:
        # Get request body
        body = await request.json()
        query = body.get("query", "")
        user_token = body.get("user_token", "")
        date = body.get("date", None)
        
        if not user_token:
            return {"error": "user_token is required"}
        
        # Generate user ID from token
        user_id = f"user_{hash(user_token) % 1000000}"
        
        logger.info("Fetching medicine schedule for user: %s, date: %s", user_id, date)
        
        # Get medicine schedules directly from database
        try:
            medicine_schedules = await db.get_medicine_schedules(user_token)
            logger.info("Found %d medicine schedules for user", len(medicine_schedules))
        except Exception as e:
            logger.error("Failed to fetch medicine schedules: %s", str(e))
            medicine_schedules = []
        
        # Filter schedules by date if specified
        if date and medicine_schedules:
            try:
                from datetime import datetime
                target_date = datetime.strptime(date, "%Y-%m-%d").date()
                filtered_schedules = []
                for schedule in medicine_schedules:
                    schedule_date = schedule.get("date")
                    if schedule_date:
                        if isinstance(schedule_date, str):
                            schedule_date = datetime.strptime(schedule_date, "%Y-%m-%d").date()
                        elif hasattr(schedule_date, 'date'):
                            schedule_date = schedule_date.date()
                        
                        if schedule_date == target_date:
                            filtered_schedules.append(schedule)
                medicine_schedules = filtered_schedules
                logger.info("Filtered to %d schedules for date %s", len(medicine_schedules), date)
            except Exception as e:
                logger.warning("Date filtering failed: %s", str(e))
        
        # Get user's current medicines and supplements
        try:
            user_medicines = await db.get_user_medicines(user_token)
            user_supplements = await db.get_user_supplements(user_token)
        except Exception as e:
            logger.warning("Failed to fetch user medicines/supplements: %s", str(e))
            user_medicines = []
            user_supplements = []
        
        # Prepare context for AI
        context_data = {
            "user_id": user_id,
            "query": query,
            "medicine_schedules": medicine_schedules,
            "current_medicines": user_medicines,
            "current_supplements": user_supplements,
            "date": date
        }
        
        # Generate personalized response
        if medicine_schedules:
            # Create a detailed schedule summary
            schedule_summary = "Your medicine schedule:\n"
            for schedule in medicine_schedules:
                medicine_name = schedule.get("medicine_name", "Unknown Medicine")
                dosage = schedule.get("dosage", "Unknown dosage")
                time = schedule.get("time", "Unknown time")
                schedule_summary += f"• {medicine_name}: {dosage} at {time}\n"
            
            # Generate AI response with schedule data
            ai_response_data = await ai_service.generate_personalized_response(
                query, 
                f"User Query: {query}\n\n{schedule_summary}\n\nCurrent Medicines: {[m.get('name', 'Unknown') for m in user_medicines]}\nCurrent Supplements: {[s.get('name', 'Unknown') for s in user_supplements]}",
                context_data
            )
            
            response_text = f"📅 **Your Medicine Schedule for {date or 'today'}:**\n\n{schedule_summary}\n\n{ai_response_data['response']}"
        else:
            # No schedules found
            if date:
                response_text = f"I couldn't find any medicine schedules for {date}. This could mean:\n\n• No medicines are scheduled for that date\n• The schedule hasn't been set up yet\n• There might be an issue with the date format\n\nPlease check with your healthcare provider or try a different date."
            else:
                response_text = "I couldn't find any medicine schedules for you. This could mean:\n\n• No medicines are currently scheduled\n• The schedule hasn't been set up yet\n• There might be an issue with your profile\n\nPlease check with your healthcare provider to set up your medicine schedule."
        
        # Log the query
        background_tasks.add_task(
            log_ai_query,
            f"Medicine schedule query: {query}",
            response_text,
            {"query_type": "medicine_schedule", "schedules_found": len(medicine_schedules), "date": date},
            None,
            None,
            None,
            user_token,
            True
        )
        
        return {
            "status": True,
            "data": {
                "response": response_text,
                "medicine_schedules": medicine_schedules,
                "current_medicines": user_medicines,
                "current_supplements": user_supplements,
                "date": date,
                "source": "python_database"
            },
            "message": "Medicine schedule retrieved successfully"
        }
        
    except Exception as e:
        logger.error("Error in medicine-schedule endpoint: %s", str(e))
        return {
            "status": False,
            "error": str(e),
            "message": "Failed to retrieve medicine schedule"
        }

async def log_ai_query(
    query: str,
    response: str,
    metadata: dict,
    supplement_id: str = None,
    medicine_id: str = None,
    vaccine_id: str = None,
    anon_token: str = None,
    success: bool = True,
    error_message: str = None
):
    """Background task to log AI queries"""
    try:
        log_data = {
            "query": query,
            "response": response,
            "model_used": metadata.get("model_used", "unknown"),
            "tokens_used": metadata.get("tokens_used"),
            "supplement_id": supplement_id,
            "medicine_id": medicine_id,
            "vaccine_id": vaccine_id,
            "anon_token": anon_token,
            "success": success,
            "error_message": error_message
        }
        
        await db.insert_ai_query_log(log_data)
        logger.info("AI query logged successfully")
        
    except Exception as e:
        logger.error("Failed to log AI query: %s", str(e))

async def log_supplement_view(
    supplement_id: str,
    anon_token: str = None,
    user_agent: str = None,
    ip_address: str = None
):
    """Background task to log supplement views"""
    try:
        log_data = {
            "supplement_id": supplement_id,
            "anon_token": anon_token,
            "user_agent": user_agent,
            "ip_address": ip_address
        }
        
        await db.insert_supplement_view_log(log_data)
        logger.info("Supplement view logged successfully")
        
    except Exception as e:
        logger.error("Failed to log supplement view: %s", str(e))

# User Medical Information Endpoints
@app.post("/api/user/medical-profile", response_model=Dict[str, Any])
async def create_medical_profile(request: CreateMedicalProfileRequest):
    """Create a new user medical profile"""
    try:
        from services.user_medical_service import UserMedicalService
        service = UserMedicalService()
        result = await service.create_medical_profile(request)
        return result
    except Exception as e:
        logger.error("Failed to create medical profile: %s", str(e))
        return {"success": False, "error": str(e), "message": "Internal server error"}

@app.put("/api/user/medical-profile", response_model=Dict[str, Any])
async def update_medical_profile(request: UpdateMedicalProfileRequest, authorization: str = Header(None)):
    """Update user medical profile using authorization token from header"""
    try:
        if not authorization:
            return {"success": False, "message": "Authorization token is required"}
        
        # Extract user_id from authorization token
        # In production, you would decode and validate the JWT token
        # For now, we'll assume the token contains the user_id or use it as anon_token
        user_id = None
        anon_token = None
        
        # Try to extract user_id from token (this is a simplified approach)
        # In production, implement proper JWT decoding
        if authorization.startswith("Bearer "):
            token = authorization.replace("Bearer ", "")
            # For demo purposes, assume token format: "user_id:actual_user_id" or just "actual_user_id"
            if ":" in token:
                user_id = token.split(":")[1]
            else:
                # If no user_id format, treat as anon_token
                anon_token = token
        else:
            # If no Bearer prefix, treat as anon_token
            anon_token = authorization
        
        if not user_id and not anon_token:
            return {"success": False, "message": "Invalid authorization token format"}
        
        from services.user_medical_service import UserMedicalService
        service = UserMedicalService()
        result = await service.update_medical_profile(user_id or "", request, anon_token)
        return result
    except Exception as e:
        logger.error("Failed to update medical profile: %s", str(e))
        return {"success": False, "error": str(e), "message": "Internal server error"}

@app.get("/api/user/medical-profile", response_model=Dict[str, Any])
async def get_medical_profile(authorization: str = Header(None)):
    """Get user medical profile using authorization token from header"""
    try:
        if not authorization:
            return {"success": False, "message": "Authorization token is required"}
        
        # Extract user_id from authorization token
        user_id = None
        anon_token = None
        
        if authorization.startswith("Bearer "):
            token = authorization.replace("Bearer ", "")
            if ":" in token:
                user_id = token.split(":")[1]
            else:
                anon_token = token
        else:
            anon_token = authorization
        
        if not user_id and not anon_token:
            return {"success": False, "message": "Invalid authorization token format"}
        
        from services.user_medical_service import UserMedicalService
        service = UserMedicalService()
        result = await service.get_user_health_summary(user_id or "", anon_token)
        return result
    except Exception as e:
        logger.error("Failed to get medical profile: %s", str(e))
        return {"success": False, "error": str(e), "message": "Internal server error"}

@app.post("/api/user/medicine-usage", response_model=Dict[str, Any])
async def add_medicine_usage(request: AddMedicineRequest):
    """Add medicine usage for a user"""
    try:
        from services.user_medical_service import UserMedicalService
        service = UserMedicalService()
        result = await service.add_medicine_usage(request)
        return result
    except Exception as e:
        logger.error("Failed to add medicine usage: %s", str(e))
        return {"success": False, "error": str(e), "message": "Internal server error"}

@app.get("/api/user/medicine-usage", response_model=Dict[str, Any])
async def get_medicine_usage(authorization: str = Header(None), active_only: bool = True):
    """Get user's medicine usage using authorization token from header"""
    try:
        if not authorization:
            return {"success": False, "message": "Authorization token is required"}
        
        # Extract user_id from authorization token
        user_id = None
        anon_token = None
        
        if authorization.startswith("Bearer "):
            token = authorization.replace("Bearer ", "")
            if ":" in token:
                user_id = token.split(":")[1]
            else:
                anon_token = token
        else:
            anon_token = authorization
        
        if not user_id and not anon_token:
            return {"success": False, "message": "Invalid authorization token format"}
        
        medicines = await db.get_user_medicine_usage(user_id or "", anon_token, active_only)
        return {
            "success": True,
            "data": medicines
        }
    except Exception as e:
        logger.error("Failed to get medicine usage: %s", str(e))
        return {"success": False, "error": str(e), "message": "Internal server error"}

@app.post("/api/user/supplement-usage", response_model=Dict[str, Any])
async def add_supplement_usage(request: AddSupplementRequest):
    """Add supplement usage for a user"""
    try:
        from services.user_medical_service import UserMedicalService
        service = UserMedicalService()
        result = await service.add_supplement_usage(request)
        return result
    except Exception as e:
        logger.error("Failed to add supplement usage: %s", str(e))
        return {"success": False, "error": str(e), "message": "Internal server error"}

@app.get("/api/user/supplement-usage", response_model=Dict[str, Any])
async def get_supplement_usage(authorization: str = Header(None), active_only: bool = True):
    """Get user's supplement usage using authorization token from header"""
    try:
        if not authorization:
            return {"success": False, "message": "Authorization token is required"}
        
        # Extract user_id from authorization token
        user_id = None
        anon_token = None
        
        if authorization.startswith("Bearer "):
            token = authorization.replace("Bearer ", "")
            if ":" in token:
                user_id = token.split(":")[1]
            else:
                anon_token = token
        else:
            anon_token = authorization
        
        if not user_id and not anon_token:
            return {"success": False, "message": "Invalid authorization token format"}
        
        supplements = await db.get_user_supplement_usage(user_id or "", anon_token, active_only)
        return {
            "success": True,
            "data": supplements
        }
    except Exception as e:
        logger.error("Failed to get supplement usage: %s", str(e))
        return {"success": False, "error": str(e), "message": "Internal server error"}

@app.post("/api/user/vaccine-history", response_model=Dict[str, Any])
async def add_vaccine_history(request: AddVaccineRequest):
    """Add vaccine history for a user"""
    try:
        from services.user_medical_service import UserMedicalService
        service = UserMedicalService()
        result = await service.add_vaccine_history(request)
        return result
    except Exception as e:
        logger.error("Failed to add vaccine history: %s", str(e))
        return {"success": False, "error": str(e), "message": "Internal server error"}

@app.get("/api/user/vaccine-history", response_model=Dict[str, Any])
async def get_vaccine_history(authorization: str = Header(None)):
    """Get user's vaccine history using authorization token from header"""
    try:
        if not authorization:
            return {"success": False, "message": "Authorization token is required"}
        
        # Extract user_id from authorization token
        user_id = None
        anon_token = None
        
        if authorization.startswith("Bearer "):
            token = authorization.replace("Bearer ", "")
            if ":" in token:
                user_id = token.split(":")[1]
            else:
                anon_token = token
        else:
            anon_token = authorization
        
        if not user_id and not anon_token:
            return {"success": False, "message": "Invalid authorization token format"}
        
        vaccines = await db.get_user_vaccine_history(user_id or "", anon_token)
        return {
            "success": True,
            "data": vaccines
        }
    except Exception as e:
        logger.error("Failed to get vaccine history: %s", str(e))
        return {"success": False, "error": str(e), "message": "Internal server error"}

@app.post("/api/user/personalized-advice", response_model=Dict[str, Any])
async def get_personalized_advice(request: PersonalizedAdviceRequest):
    """Get personalized health advice based on user's medical profile"""
    try:
        from services.user_medical_service import UserMedicalService
        service = UserMedicalService()
        result = await service.get_personalized_advice(request)
        return result
    except Exception as e:
        logger.error("Failed to get personalized advice: %s", str(e))
        return {"success": False, "error": str(e), "message": "Internal server error"}

@app.get("/api/user/health-summary", response_model=Dict[str, Any])
async def get_health_summary(authorization: str = Header(None)):
    """Get comprehensive health summary using authorization token from header"""
    try:
        if not authorization:
            return {"success": False, "message": "Authorization token is required"}
        
        # Extract user_id from authorization token
        user_id = None
        anon_token = None
        
        if authorization.startswith("Bearer "):
            token = authorization.replace("Bearer ", "")
            if ":" in token:
                user_id = token.split(":")[1]
            else:
                anon_token = token
        else:
            anon_token = authorization
        
        if not user_id and not anon_token:
            return {"success": False, "message": "Invalid authorization token format"}
        
        from services.user_medical_service import UserMedicalService
        service = UserMedicalService()
        result = await service.get_user_health_summary(user_id or "", anon_token)
        return result
    except Exception as e:
        logger.error("Failed to get health summary: %s", str(e))
        return {"success": False, "error": str(e), "message": "Internal server error"}

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level=settings.log_level.lower()
    )
