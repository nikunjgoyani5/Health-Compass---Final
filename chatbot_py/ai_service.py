#!/usr/bin/env python3
"""
AI Service for Health Compass Chatbot
Handles OpenAI API interactions and AI logic
"""

import logging
import openai
import re
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from enum import Enum
import os

logger = logging.getLogger(__name__)

class ModelType(Enum):
    """OpenAI model types"""
    GPT_4 = "gpt-4"
    GPT_3_5_TURBO = "gpt-3.5-turbo"
    GPT_3_5_TURBO_16K = "gpt-3.5-turbo-16k"

class QueryType(Enum):
    """Query types for categorization"""
    GENERAL = "general"
    SUPPLEMENT_SPECIFIC = "supplement_specific"
    MEDICINE_SPECIFIC = "medicine_specific"
    VACCINE_SPECIFIC = "vaccine_specific"
    PERSONALIZED = "personalized"

class AIService:
    """AI service for handling OpenAI interactions"""
    
    def __init__(self, database=None):
        # Initialize OpenAI client
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            # For testing purposes, allow initialization without API key
            logger.warning("OPENAI_API_KEY not found, initializing in test mode")
            self.client = None
        else:
            self.client = openai.AsyncOpenAI(api_key=api_key)
        
        self.database = database
        
        # Model configuration
        model_name = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo")
        try:
            self.model = ModelType(model_name)
        except ValueError:
            logger.warning("Invalid model %s, using default", model_name)
            self.model = ModelType.GPT_3_5_TURBO
        
        # Base system prompt
        self.base_system_prompt = """You are HealthBot, a highly skilled healthcare and medicine expert.

You provide clear, accurate, and professional advice on:
- Symptoms and common diseases
- Over-the-counter (OTC) medicines
- First aid guidance
- Fitness, exercise, and wellness routines
- Diet and nutrition plans
- Mental health support

Important Instructions:
- You must suggest actual safe over-the-counter medicines for minor conditions like fever, headache, cold, stomach pain, etc.
- If multiple options exist, suggest the best 1-2 medicines with basic dosage guidance (like "once every 6 hours" or "after food"), but avoid giving exact mg dosages unless very common.
- For any critical or emergency symptoms (severe chest pain, heavy bleeding, seizures), advise immediate hospitalization.
- Use simple, professional, and caring language.
- Do not force users to see a doctor for minor health issues unless symptoms are severe or worsening.
- Your role is to act like a real medicine advisor."""

        # Medical disclaimer
        self.medical_disclaimer = """IMPORTANT: This information is for educational purposes only and should not replace professional medical advice. Always consult with a healthcare provider for medical decisions."""

    async def initialize(self):
        """Initialize the AI service"""
        try:
            # Test OpenAI connection
            await self.client.chat.completions.create(
                model=self.model.value,
                messages=[{"role": "user", "content": "Hello"}],
                max_tokens=5
            )
            logger.info("AI Service initialized successfully")
        except Exception as e:
            logger.error("Failed to initialize AI Service: %s", str(e))
            raise

    async def _is_health_related_query(self, query: str, anon_token: str = None) -> bool:
        """
        Use GPT to intelligently determine if a query is health-related
        This is more flexible and accurate than manual keyword matching
        """
        try:
            # Check if this is a creation command (always health-related)
            if self._is_creation_command(query):
                logger.info("Creation command detected, immediately treating as health-related: %s", query)
                return True
            
            # If we have an active conversation state, immediately return True
            if anon_token and self.database:
                try:
                    existing_state = await self.database.get_conversation_state(anon_token)
                    if existing_state and existing_state.get("state") != "IDLE":
                        logger.info("Active conversation state detected, treating query as health-related: %s", query)
                        return True
                except Exception as e:
                    logger.warning("Failed to check conversation state: %s", str(e))
            
            # If query is very short (likely a field value in a conversation), be more lenient
            if len(query.strip()) < 20:
                logger.info("Short query detected, being more lenient with health detection: %s", query)
                # Check for common field value patterns
                query_lower = query.lower().strip()
                field_value_patterns = [
                    r'^\d+(?:\.\d+)?\s*(?:mg|ml|mcg|g|units?|iu)$',  # Dosage patterns
                    r'^\d+\s*(?:tablets?|capsules?|pills?|units?)$',  # Quantity patterns
                    r'^\$?\d+(?:\.\d{2})?$',  # Price patterns
                    r'^\d{4}-\d{2}-\d{2}$',  # Date patterns
                    r'^[A-Z][a-zA-Z0-9\s\-\.]{1,20}$',  # Name patterns
                    r'^(morning|evening|daily|weekly|monthly)$',  # Frequency patterns
                    r'^(yes|no|y|n|ok|okay)$'  # Confirmation patterns
                ]
                
                for pattern in field_value_patterns:
                    if re.match(pattern, query_lower):
                        logger.info("Query matches field value pattern, treating as health-related: %s", query)
                        return True
            
            # Check if we have OpenAI client available
            if not self.client:
                logger.info("No OpenAI client available, using fallback keyword-based health detection")
                # Fallback to basic keyword check
                query_lower = query.lower().strip()
                
                # Check if this is a creation command (always health-related)
                if self._is_creation_command(query):
                    logger.info("Fallback: Creation command detected, treating as health-related: %s", query)
                    return True
                
                basic_health_keywords = [
                    "health", "medicine", "supplement", "vitamin", "vaccine", "symptom", 
                    "pain", "fever", "exercise", "diet", "nutrition", "wellness", "doctor"
                ]
                
                # Check if query contains health-related keywords
                for keyword in basic_health_keywords:
                    if keyword in query_lower:
                        logger.info("Fallback: Health keyword '%s' found, treating as health-related: %s", keyword, query)
                        return True
                
                # If no health keywords found, treat as non-health
                logger.info("Fallback: No health keywords found, treating as non-health: %s", query)
                return False
            
            # Create a simple prompt for GPT to classify the query
            classification_prompt = f"""Classify if this query is health-related. 

Query: "{query}"

A health-related query is about:
- Supplements, vitamins, medicines, vaccines
- Symptoms, diseases, medical conditions
- Exercise, diet, nutrition, wellness
- Mental health, stress, sleep
- Medical procedures, treatments, therapies
- Health advice, medical information

A non-health query is about:
- Programming, technology, computers
- Cooking, recipes, food preparation
- Travel, entertainment, hobbies
- Business, finance, politics
- General knowledge not related to health

IMPORTANT: You must respond with EXACTLY one of these two words:
- "HEALTH" (if the query is health-related)
- "NOT_HEALTH" (if the query is NOT health-related)

Do not add any other text, explanations, or punctuation. Just respond with the single word."""

            # Use GPT to classify the query
            response = await self.client.chat.completions.create(
                model=self.model.value,
                messages=[
                    {"role": "system", "content": "You are a query classifier. Respond with only 'HEALTH' or 'NOT_HEALTH'."},
                    {"role": "user", "content": classification_prompt}
                ],
                max_tokens=100,
                temperature=0.1 
            )
            
            # Extract the response
            gpt_response = response.choices[0].message.content.strip().upper()
            
            # Validate that GPT responded with the expected format
            if gpt_response not in ["HEALTH", "NOT_HEALTH"]:
                logger.warning("GPT responded with unexpected format: '%s', falling back to basic keyword check", gpt_response)
                # Fallback to basic keyword check
                query_lower = query.lower().strip()
                
                # Check if this is a creation command (always health-related)
                if self._is_creation_command(query):
                    logger.info("GPT fallback: Creation command detected, treating as health-related: %s", query)
                    return True
                
                basic_health_keywords = [
                    "health", "medicine", "supplement", "vitamin", "vaccine", "symptom", 
                    "pain", "fever", "exercise", "diet", "nutrition", "wellness", "doctor"
                ]
                has_health_keyword = any(keyword in query_lower for keyword in basic_health_keywords)
                return has_health_keyword
            
            # Determine if it's health-related
            is_health_related = gpt_response == "HEALTH"
            
            logger.info("GPT Health Detection - Query: '%s', GPT Response: '%s', Is Health Related: %s", 
                       query, gpt_response, is_health_related)
            
            return is_health_related
            
        except Exception as e:
            logger.warning("GPT health detection failed, falling back to basic keyword check: %s", str(e))
            
            # Fallback to basic keyword check if GPT fails
            query_lower = query.lower().strip()
            
            # Basic health keywords as fallback - be more lenient
            basic_health_keywords = [
                "health", "medicine", "supplement", "vitamin", "vaccine", "symptom", 
                "pain", "fever", "exercise", "diet", "nutrition", "wellness", "doctor",
                "mg", "ml", "tablet", "capsule", "pill", "dose", "dosage", "price",
                "quantity", "brand", "manufacturer", "expiration", "expiry", "exp"
            ]
            
            # Check for explicit non-health topics to block
            non_health_topics = [
                "python", "programming", "code", "software", "computer", "technology",
                "math", "mathematics", "physics", "chemistry", "biology", "geography",
                "history", "politics", "economics", "business", "finance", "cooking",
                "recipe", "travel", "vacation", "hotel", "restaurant", "movie", "music",
                "sport", "game", "entertainment", "fashion", "beauty", "cosmetics"
            ]
            
            # If query contains non-health topics, block it
            if any(topic in query_lower for topic in non_health_topics):
                logger.info("Fallback: Query contains non-health topics, blocking: %s", query)
                return False
            
            # Check if this is a creation command (always health-related)
            if self._is_creation_command(query):
                logger.info("Fallback: Creation command detected, treating as health-related: %s", query)
                return True
            
            # Be more lenient in fallback - if it doesn't contain non-health topics, 
            # and it's a short response (likely part of a conversation), allow it
            if len(query.strip()) < 50:  # Short responses are likely conversational
                logger.info("Fallback: Short response without non-health topics, allowing: %s", query)
                return True
            
            # Also be more lenient for very short responses (likely field values)
            if len(query.strip()) < 20:
                logger.info("Fallback: Very short response, likely field value, allowing: %s", query)
                return True
            
            # Only require explicit health keywords for longer queries
            has_health_keyword = any(keyword in query_lower for keyword in basic_health_keywords)
            
            logger.info("Fallback health detection - Query: '%s', Has basic health keyword: %s, Final result: %s", 
                       query, has_health_keyword, has_health_keyword)
            
            return has_health_keyword

    def _get_off_topic_response(self) -> str:
        """Generate a simple response for off-topic queries"""
        return "I apologize, but I'm specifically designed to help with health-related questions about supplements, medicines, vaccines, and general wellness.\n\nYour question doesn't appear to be related to health, supplements, medicines, or vaccines. I'd be happy to help you with questions about:\n• Dietary supplements and vitamins\n• Medicines and medications  \n• Vaccines and immunizations\n• General health and wellness\n• Nutrition and fitness\n\nFor questions about other topics, I recommend seeking information from appropriate sources or professionals in that field."

    async def generate_response(
        self, 
        query: str, 
        supplement_context: Optional[Dict[str, Any]] = None,
        medicine_context: Optional[Dict[str, Any]] = None,
        vaccine_context: Optional[Dict[str, Any]] = None,
        model: ModelType = None
    ) -> Dict[str, Any]:
        """
        Generate AI response using OpenAI

        Args:
            query: User question
            supplement_context: Optional supplement information
            medicine_context: Optional medicine information
            vaccine_context: Optional vaccine information
            model: OpenAI model to use

        Returns:
            Dictionary containing response and metadata
        """
        try:
            # Use specified model or default (always as a string, never Enum)
            if isinstance(model, ModelType):
                model_to_use = model.value
            elif isinstance(model, str) and model.strip():
                model_to_use = model.strip()
            else:
                model_to_use = self.model.value
            
            # Validate model before making API call
            if not model_to_use:
                raise ValueError("No OpenAI model specified")
            
            logger.info("Using OpenAI model: %s", model_to_use)
            
            # Determine system prompt based on context
            if supplement_context:
                system_prompt = self._build_supplement_prompt(supplement_context)
                query_type = QueryType.SUPPLEMENT_SPECIFIC
            elif medicine_context:
                system_prompt = self._build_medicine_prompt(medicine_context)
                query_type = QueryType.MEDICINE_SPECIFIC
            elif vaccine_context:
                system_prompt = self._build_vaccine_prompt(vaccine_context)
                query_type = QueryType.VACCINE_SPECIFIC
            else:
                system_prompt = self.base_system_prompt
                query_type = QueryType.GENERAL
                
            # Prepare messages
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query}
            ]
            
            logger.info("Generating AI response for query type: %s", query_type.value)
            
            # Make OpenAI API call
            response = await self.client.chat.completions.create(
                model=model_to_use,
                messages=messages,
                max_tokens=500,
                temperature=0.7,
                top_p=0.9
            )
            
            # Extract response content
            ai_response = response.choices[0].message.content
            tokens_used = response.usage.total_tokens if response.usage else None
            
            # Build response metadata
            metadata = {
                "model_used": model_to_use,
                "tokens_used": tokens_used,
                "query_type": query_type.value,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "has_supplement_context": supplement_context is not None,
                "has_medicine_context": medicine_context is not None,
                "has_vaccine_context": vaccine_context is not None
            }
            
            logger.info("AI response generated successfully. Tokens used: %s", tokens_used)
            
            return {
                "response": ai_response,
                "metadata": metadata,
                "disclaimer": self._get_appropriate_disclaimer(query_type),
                "supplement_context": supplement_context,
                "medicine_context": medicine_context,
                "vaccine_context": vaccine_context
            }
            
        except openai.BadRequestError as e:
            if "model" in str(e).lower():
                logger.error("Invalid OpenAI model '%s': %s", model_to_use, str(e))
                raise ValueError(f"Invalid OpenAI model '{model_to_use}'. Please check your OPENAI_MODEL configuration.")
            else:
                logger.error("OpenAI API bad request: %s", str(e))
                raise ValueError(f"OpenAI API error: {str(e)}")
        except openai.AuthenticationError as e:
            logger.error("OpenAI authentication failed: %s", str(e))
            raise ValueError("OpenAI API authentication failed. Please check your API key.")
        except openai.RateLimitError as e:
            logger.error("OpenAI rate limit exceeded: %s", str(e))
            raise ValueError("OpenAI API rate limit exceeded. Please try again later.")
        except openai.APITimeoutError as e:
            logger.error("OpenAI API timeout: %s", str(e))
            raise ValueError("OpenAI API request timed out. Please try again.")
        except Exception as e:
            logger.error("Failed to generate AI response: %s", str(e))
            raise ValueError(f"Failed to generate AI response: {str(e)}")
            
    def _build_supplement_prompt(self, supplement_context: Dict[str, Any]) -> str:
        """Build system prompt for supplement-specific queries"""
        supplement_name = supplement_context.get("name", "this supplement")
        supplement_description = supplement_context.get("description", "")
        
        prompt = f"""You are a supplement expert. The user is asking about {supplement_name}.
        
Supplement Information:
{supplement_description}

Provide helpful information about:
- What this supplement is and its benefits
- Common uses and recommended dosages
- Safety considerations and side effects
- Who should or shouldn't take it
- Interactions with medications

{self.medical_disclaimer}"""
        
        return prompt

    def _build_medicine_prompt(self, medicine_context: Dict[str, Any]) -> str:
        """Build system prompt for medicine-specific queries"""
        medicine_name = medicine_context.get("name", "this medicine")
        medicine_description = medicine_context.get("description", "")
        
        prompt = f"""You are a medicine expert. The user is asking about {medicine_name}.
        
Medicine Information:
{medicine_description}

Provide helpful information about:
- What this medicine is and how it works
- Common uses and dosage information
- Side effects and precautions
- Drug interactions to be aware of
- When to seek medical attention

{self.medical_disclaimer}"""
        
        return prompt

    def _build_vaccine_prompt(self, vaccine_context: Dict[str, Any]) -> str:
        """Build system prompt for vaccine-specific queries"""
        vaccine_name = vaccine_context.get("name", "this vaccine")
        vaccine_description = vaccine_context.get("description", "")
        
        prompt = f"""You are a vaccine expert. The user is asking about {vaccine_name}.
        
Vaccine Information:
{vaccine_description}

Provide helpful information about:
- What this vaccine protects against
- Who should get it and when
- Common side effects and reactions
- Contraindications and precautions
- Importance of vaccination

{self.medical_disclaimer}"""
        
        return prompt

    def _get_appropriate_disclaimer(self, query_type: QueryType) -> str:
        """Get appropriate disclaimer based on query type"""
        if query_type == QueryType.SUPPLEMENT_SPECIFIC:
            return "Supplement information is for educational purposes. Consult healthcare providers for personalized advice."
        elif query_type == QueryType.MEDICINE_SPECIFIC:
            return "Medicine information is for educational purposes. Always follow your doctor's instructions."
        elif query_type == QueryType.VACCINE_SPECIFIC:
            return "Vaccine information is for educational purposes. Follow official vaccination schedules."
        else:
            return self.medical_disclaimer

    async def search_factsheet(self, query: str, search_type: str = "AUTO") -> Dict[str, Any]:
        """
        Search for factsheet information
        
        Args:
            query: User search query
            search_results: Database search results for supplements, medicines, or vaccines
            
        Returns:
            Dictionary containing search results and AI-generated summary
        """
        try:
            # For now, return a simple response
            # In production, this would integrate with database search
            response = f"I found information about {query}. This appears to be a health-related query that I can help you with."
            
            return {
                "success": True,
                    "query": query,
                "search_type": search_type,
                "response": response,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            
        except Exception as e:
            logger.error("Factsheet search failed: %s", str(e))
            return {
                "success": False,
                "error": str(e),
                "query": query
            }

    async def generate_personalized_response(self, query: str, user_context: str = None, api_data: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Generate personalized AI response using user context and API data
        """
        try:
            # Handle case where user_context is None or empty
            if not user_context or user_context.strip() == "":
                user_context = "No specific user profile information available."
            
            # Create enhanced system prompt with user context
            system_prompt = f"""You are HealthCompass AI, a knowledgeable and caring health assistant.

{user_context}

CRITICAL RULES:
1. If you know the user's name, use it when addressing them
2. If user has medical conditions/medicines, reference them when relevant
3. If no user data available, provide general but helpful health advice
4. Always check for potential interactions if discussing medicines/supplements
5. Give specific, actionable recommendations
6. Always maintain a warm, caring tone
7. Use emojis to make responses engaging and friendly
8. If user asks about specific supplements/medicines, provide detailed information

{self.medical_disclaimer}

Respond in a helpful manner while maintaining safety guidelines."""

            # Create user message with context
            user_message = f"""User Query: {query}

Please provide a helpful response that:
1. If you know the user's name, address them by name
2. If user has health profile data, reference it when relevant
3. If no user data available, provide general but helpful health advice
4. Always checks for medicine interactions if discussing new medicines/supplements
5. Uses a warm, caring tone with appropriate emojis
6. For specific supplement/medicine questions, provide detailed, educational information"""

            # Generate response using OpenAI
            response = await self.client.chat.completions.create(
                model=self.model.value,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message}
                ],
                max_tokens=800,
                temperature=0.7
            )

            ai_response = response.choices[0].message.content

            # Parse and structure the response
            structured_response = self._parse_personalized_response(ai_response, user_context)
            
            return {
                "response": structured_response["response"],
                "metadata": {
                    "model_used": self.model.value,
                    "tokens_used": response.usage.total_tokens,
                    "query_type": "personalized",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "has_user_context": True,
                    "user_profile_referenced": structured_response["profile_referenced"],
                    "interactions_checked": structured_response["interactions_checked"]
                },
                "disclaimer": self.medical_disclaimer
            }
            
        except Exception as e:
            logger.error("Error generating personalized response: %s", str(e))
            return {
                "response": "I apologize, but I'm having trouble generating a personalized response right now. Please try again later.",
                "metadata": {
                    "model_used": "error",
                    "tokens_used": 0,
                    "query_type": "error",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "error": str(e)
                },
                "disclaimer": self.medical_disclaimer
            }

    def _parse_personalized_response(self, ai_response: str, user_context: str) -> Dict[str, Any]:
        """
        Parse AI response to extract structured information
        """
        try:
            # Check if response references user profile
            profile_referenced = any(keyword in ai_response.lower() for keyword in [
                "your", "you're", "you have", "your profile", "your medicines", "your condition"
            ])

            # Check if interactions were mentioned
            interactions_checked = any(keyword in ai_response.lower() for keyword in [
                "interaction", "interact", "combine", "mix", "together", "avoid", "warning"
            ])
            
            return {
                "response": ai_response,
                "profile_referenced": profile_referenced,
                "interactions_checked": interactions_checked
            }
            
        except Exception as e:
            logger.error("Error parsing personalized response: %s", str(e))
            return {
                "response": ai_response,
                "profile_referenced": False,
                "interactions_checked": False
            }

    async def search_and_structure_factsheet(self, query: str, search_results: Dict[str, Any]) -> Dict[str, Any]:
        """
        Search and structure factsheet information from database results
        """
        try:
            # Create system prompt for factsheet structuring
            system_prompt = f"""You are HealthBot, a healthcare expert. The user asked: "{query}"

I found the following information in our database. Please structure it into a comprehensive, educational response.

Database Results:
{search_results}

Instructions:
1. Organize the information logically (what it is, benefits, dosage, side effects, etc.)
2. Use clear, professional language
3. Include all relevant details from the database
4. Add educational context where helpful
5. Use bullet points and formatting for readability
6. Always emphasize consulting healthcare professionals for medical decisions

Format the response as a comprehensive factsheet."""

            # Generate response using OpenAI
            response = await self.client.chat.completions.create(
                model=self.model.value,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Please structure the factsheet information for: {query}"}
                ],
                max_tokens=1000,
                temperature=0.3
            )

            ai_response = response.choices[0].message.content
            
            return {
                "response": ai_response,
                "metadata": {
                    "model_used": self.model.value,
                    "tokens_used": response.usage.total_tokens,
                    "query_type": "factsheet_search",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "search_results_count": len(search_results),
                    "search_results_keys": list(search_results.keys()),
                    "fallback_used": False
                },
                "disclaimer": self.medical_disclaimer
            }
            
        except Exception as e:
            logger.error("Error in factsheet search and structure: %s", str(e))
            return {
                "response": f"I found some information about {query}, but I'm having trouble structuring it right now. Please try again later.",
                "metadata": {
                    "model_used": "error",
                    "tokens_used": 0,
                    "query_type": "factsheet_search_error",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "error": str(e),
                    "fallback_used": False
                },
                "disclaimer": self.medical_disclaimer
            }

    async def process_comprehensive_query(self, query: str, anon_token: str = None, user_jwt: str = None) -> Dict[str, Any]:
        """
        Comprehensive query processing with intelligent routing
        
        Flow:
        1. Check if health-related
        2. If health-related: Search factsheet → Found: return data, Not found: GPT fallback
        3. If personal query (medicine schedule): Check data availability → Return appropriate response
        4. If not health-related: Show off-topic message
        
        Args:
            query: User's query text
            anon_token: Anonymous session token
            
        Returns:
            Dict containing response, metadata, and context information
        """
        try:
            logger.info("Processing comprehensive query: %s", query)
            
            # 🔍 STEP 1: Check if query is health-related
            is_health_related = await self._is_health_related_query(query, anon_token)
            logger.info("Health-related check result: %s", is_health_related)
            
            if not is_health_related:
                # ❌ NOT HEALTH-RELATED: Show off-topic message
                logger.info("Query is NOT health-related, showing off-topic message: %s", query)
                
                off_topic_response = {
                    "response": "I'm designed specifically for health-related topics like supplements, medicines, vaccines, symptoms, and wellness. I cannot answer questions about programming, general knowledge, or other non-health topics. Please ask a health question, and I'll be happy to help! 💊🏥",
                    "metadata": {
                        "model_used": "health_filter",
                        "tokens_used": 0,
                        "query_type": "non_health_blocked",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "has_supplement_context": False,
                        "has_medicine_context": False,
                        "has_vaccine_context": False,
                        "off_topic": True,
                        "reason": "Query not health-related, blocked to save tokens",
                        "flow_step": "health_check_failed"
                    },
                    "disclaimer": "This response was blocked to save AI tokens. Only health-related questions are processed.",
                    "supplement_context": None,
                    "medicine_context": None,
                    "vaccine_context": None,
                    "flow_summary": "Query blocked - Not health-related"
                }
                
                return off_topic_response
            
            # ✅ HEALTH-RELATED: Continue processing
            
            # 🔍 STEP 2: Check if this is a creation command
            logger.info("Checking if query is creation command: '%s'", query)
            is_creation = self._is_creation_command(query)
            logger.info("Creation command detection result: %s", is_creation)
            if is_creation:
                logger.info("Detected creation command: %s", query)
                return await self._handle_comprehensive_creation(query, anon_token, user_jwt)
            
            # 🔍 STEP 3: Check if user has an ongoing conversation state
            if anon_token and self.database:
                try:
                    existing_state = await self.database.get_conversation_state(anon_token)
                    logger.info("Checking conversation state for token %s: %s", anon_token, existing_state)
                    if existing_state and existing_state.get("state") in ["collecting_medicine", "collecting_supplement", "collecting_vaccine", "collecting_medicine_schedule", "collecting_supplement_schedule", "collecting_vaccine_schedule", "confirming"]:
                        logger.info("User has ongoing conversation state: %s", existing_state.get("state"))
                        return await self._handle_creation_flow(query, anon_token, user_jwt, existing_state)
                    elif existing_state:
                        logger.info("User has state but not in creation flow: %s", existing_state.get("state"))
                except Exception as e:
                    logger.warning("Failed to check conversation state: %s", str(e))
            
            # 🔍 STEP 4: Check if this is a personal query (medicine schedule, etc.)
            from utils import is_medicine_schedule_query, extract_date_from_query
            
            if is_medicine_schedule_query(query):
                logger.info("Detected personal medicine schedule query: %s", query)
                
                # Extract date if present
                extracted_date = extract_date_from_query(query)
                logger.info("Extracted date from query: %s", extracted_date)
                
                # For medicine schedule queries, we need to check if data is available
                # Since this is a personal query, we'll provide appropriate guidance
                if extracted_date:
                    personal_response = {
                        "response": f"I can help you with your medicine schedule for {extracted_date}! However, to access your personal medicine schedule, you'll need to use the dedicated medicine schedule endpoint with your user token.\n\nPlease use:\n`POST /api/bot/medicine-schedule`\nwith your user token and the date: {extracted_date}\n\nThis ensures your personal health information is properly secured and accessible only to you.",
                        "metadata": {
                            "model_used": "medicine_schedule_detector",
                            "tokens_used": 0,
                            "query_type": "medicine_schedule_redirect",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "has_supplement_context": False,
                            "has_medicine_context": False,
                            "has_vaccine_context": False,
                            "off_topic": False,
                            "extracted_date": extracted_date,
                            "flow_step": "personal_query_handled"
                        },
                        "disclaimer": "For personalized medicine schedule access, use the /api/bot/medicine-schedule endpoint with your user token.",
                        "supplement_context": None,
                        "medicine_context": None,
                        "vaccine_context": None,
                        "flow_summary": f"Personal query handled - Medicine schedule for {extracted_date}"
                    }
                else:
                    personal_response = {
                        "response": "I can help you with your medicine schedule! However, to access your personal medicine schedule, you'll need to use the dedicated medicine schedule endpoint with your user token.\n\nPlease use:\n`POST /api/bot/medicine-schedule`\nwith your user token.\n\nThis ensures your personal health information is properly secured and accessible only to you.",
                        "metadata": {
                            "model_used": "medicine_schedule_detector",
                            "tokens_used": 0,
                            "query_type": "medicine_schedule_redirect",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "has_supplement_context": False,
                            "has_medicine_context": False,
                            "has_vaccine_context": False,
                            "off_topic": False,
                            "flow_step": "personal_query_handled"
                        },
                        "disclaimer": "For personalized medicine schedule access, use the /api/bot/medicine-schedule endpoint with your user token.",
                        "supplement_context": None,
                        "medicine_context": None,
                        "vaccine_context": None,
                        "flow_summary": "Personal query handled - Medicine schedule (no date specified)"
                    }
                
                return personal_response
            
            # 🔍 STEP 5: Check if this is a factsheet search query
            from utils import is_factsheet_search_query, extract_search_term
            
            if is_factsheet_search_query(query):
                logger.info("Detected factsheet search query: %s", query)
                
                # Extract search term
                search_term = extract_search_term(query)
                logger.info("Extracted search term: %s", search_term)
                
                # Search for factsheet data
                factsheet_data = await self.search_factsheet(search_term, "AUTO")
                
                if factsheet_data.get("found_in_database", False):
                    # ✅ DATABASE DATA FOUND: Return factsheet data
                    logger.info("✅ Factsheet data found in database for: %s", search_term)
                    
                    response_data = {
                        "response": factsheet_data["response"],
                        "metadata": factsheet_data["metadata"],
                        "disclaimer": factsheet_data["disclaimer"],
                        "supplement_context": factsheet_data.get("supplement_context"),
                        "medicine_context": factsheet_data.get("medicine_context"),
                        "vaccine_context": factsheet_data.get("vaccine_context"),
                        "flow_summary": f"Factsheet found - Database data for {search_term}"
                    }
                    
                    return response_data
                else:
                    # ❌ NO DATABASE DATA: Use GPT fallback
                    logger.info("❌ No factsheet data found for '%s', using GPT-4 fallback", search_term)
                    
                    # Create fallback prompt for GPT-4
                    fallback_prompt = f"""The user asked: "{query}"

I couldn't find specific factsheet information about '{search_term}' in our database, but I can provide general educational information.

Please provide helpful, educational information about this topic, including:
1. What it is (if it's a supplement, medicine, vaccine, or other health-related item)
2. General benefits or uses (if applicable)
3. Important safety considerations
4. Educational context

IMPORTANT: Start your response with "🤖 **GPT-4 GENERATED INFORMATION**" to clearly indicate this is AI-generated content, not from a database factsheet.

Remember: This is for educational purposes only. Always encourage consulting healthcare professionals for specific medical advice."""
                    
                    # Generate response using GPT-4
                    gpt_response_data = await self.generate_response(
                        query=fallback_prompt,
                        supplement_context=None,
                        medicine_context=None,
                        vaccine_context=None
                    )
                    
                    # Update metadata to indicate this was a GPT-4 fallback
                    gpt_response_data["metadata"].update({
                        "search_type": "gpt4_fallback",
                        "query": query,
                        "search_term": search_term,
                        "results_count": 0,
                        "fallback_used": True,
                        "data_source": "gpt4_generated",
                        "database_used": False,
                        "flow_step": "gpt4_fallback_used"
                    })
                    
                    # Add flow summary
                    gpt_response_data["flow_summary"] = f"Factsheet not found - GPT-4 fallback for {search_term}"
                    
                    return gpt_response_data
            
            # 🔍 STEP 6: General health query (not factsheet search)
            logger.info("Processing general health query: %s", query)
            
            # Generate response using standard AI service
            general_response_data = await self.generate_response(
                query=query,
                supplement_context=None,
                medicine_context=None,
                vaccine_context=None
            )
            
            # Add flow summary
            general_response_data["flow_summary"] = "General health query processed"
            
            return general_response_data
            
        except Exception as e:
            logger.error("Failed to process comprehensive query: %s", str(e))
            
            # Return error response
            error_response = {
                "response": f"I encountered an error while processing your query. Please try again or rephrase your question. Error: {str(e)}",
                "metadata": {
                    "model_used": "error_handler",
                    "tokens_used": 0,
                    "query_type": "error",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "has_supplement_context": False,
                    "has_medicine_context": False,
                    "has_vaccine_context": False,
                    "error": str(e),
                    "flow_step": "error_occurred"
                },
                "disclaimer": "An error occurred while processing your request. Please try again.",
                "supplement_context": None,
                "medicine_context": None,
                "vaccine_context": None,
                "flow_summary": f"Error occurred: {str(e)}"
            }
            
            return error_response

    # Medicine Creation Flow Methods
    def _is_creation_command(self, query: str) -> bool:
        """Check if query is a creation command"""
        query_lower = query.lower().strip()
        
        # More flexible pattern matching to handle typos and variations
        # Check for key creation words
        creation_keywords = ["create", "add", "new", "make", "start"]
        item_keywords = ["medicine", "supplement", "vaccine", "med", "supp", "suppl", "suppelment", "medication", "drug"]
        schedule_keywords = ["schedule", "scheduling", "plan", "routine"]
        
        # Check if query contains creation intent
        has_creation_intent = any(keyword in query_lower for keyword in creation_keywords)
        has_item_intent = any(keyword in query_lower for keyword in item_keywords)
        has_schedule_intent = any(keyword in query_lower for keyword in schedule_keywords)
        
        # More flexible matching - if it looks like they want to create something health-related
        if has_creation_intent and has_item_intent:
            logger.info("Creation command detected with flexible matching: %s", query)
            return True
        
        # Also check for exact patterns (existing logic)
        creation_patterns = [
            "create medicine", "create supplement", "create vaccine", "create medicine schedule", "create supplement schedule", "create vaccine schedule",
            "create new medicine", "create new supplement", "create new vaccine", "create new medicine schedule", "create new supplement schedule", "create new vaccine schedule",
            "add medicine", "add supplement", "add vaccine", "add medicine schedule", "add supplement schedule", "add vaccine schedule",
            "new medicine", "new supplement", "new vaccine", "new medicine schedule", "new supplement schedule", "new vaccine schedule",
            "please create medicine", "please create supplement", "please create vaccine", "please create medicine schedule", "please create supplement schedule", "please create vaccine schedule",
            "create a medicine", "create a supplement", "create a vaccine", "create a medicine schedule", "create a supplement schedule", "create a vaccine",
            "i want to create medicine", "i want to create supplement", "i want to create vaccine", "i want to create medicine schedule", "i want to create supplement schedule", "i want to create vaccine schedule",
            "help me create medicine", "help me create supplement", "help me create vaccine", "help me create medicine schedule", "help me create supplement schedule", "help me create vaccine schedule"
        ]
        
        exact_match = any(pattern in query_lower for pattern in creation_patterns)
        if exact_match:
            logger.info("Creation command detected with exact pattern: %s", query)
            return True
            
        return False

    def _get_required_medicine_fields(self) -> List[str]:
        """Get required fields for medicine creation"""
        return ["medicineName", "dosage", "description", "price", "quantity"]

    def _get_required_supplement_fields(self) -> List[str]:
        """Get required fields for supplement creation"""
        return ["supplementName", "dosage", "description", "price", "quantity", "brandName", "manufacturer", "expDate"]

    def _get_required_vaccine_fields(self) -> List[str]:
        """Get required fields for vaccine creation"""
        return ["vaccineName", "dosage", "description", "price", "quantity", "brandName", "manufacturer", "expDate", "ageGroup"]

    def _get_required_medicine_schedule_fields(self) -> List[str]:
        """Get required fields for medicine schedule creation"""
        return ["medicineName", "dosage", "frequency", "timeOfDay", "startDate", "endDate", "instructions"]

    def _get_required_supplement_schedule_fields(self) -> List[str]:
        """Get required fields for supplement schedule creation"""
        return ["supplementName", "dosage", "frequency", "timeOfDay", "startDate", "endDate", "instructions"]

    def _get_required_vaccine_schedule_fields(self) -> List[str]:
        """Get required fields for vaccine schedule creation"""
        return ["vaccineName", "dosage", "frequency", "timeOfDay", "startDate", "endDate", "instructions"]

    def _get_next_field_in_order(self, missing_fields: set, required_fields: List[str]) -> str:
        """Get the next field to ask for in the correct order"""
        for field in required_fields:
            if field in missing_fields:
                return field
        # Fallback to first missing field if none found in order
        return list(missing_fields)[0]

    def _extract_initial_field_values(self, query: str, creation_type: str) -> Dict[str, str]:
        """Extract field values from initial query"""
        extracted_data = {}
        query_lower = query.lower().strip()
        
        # Check for simple creation commands that shouldn't extract field values
        simple_commands = [
            "create medicine", "create supplement", "create vaccine", "create medicine schedule", "create supplement schedule", "create vaccine schedule",
            "please create medicine", "please create supplement", "please create vaccine", "please create medicine schedule", "please create supplement schedule", "please create vaccine schedule",
            "create new medicine", "create new supplement", "create new vaccine", "create new medicine schedule", "create new supplement schedule", "create new vaccine schedule",
            "add medicine", "add supplement", "add vaccine", "add medicine schedule", "add supplement schedule", "add vaccine schedule"
        ]
        
        # Only skip extraction for very simple commands without field data
        # If the query contains field information (like medicine names, dosages), we should extract it
        has_field_info = (
            any(char in query for char in [':', '=']) or  # Has field=value patterns
            any(word.lower() in ["dosage", "name", "price", "quantity", "description"] for word in query.split()) or  # Has field keywords
            any(re.match(r'^\d+mg$', word.lower()) for word in query.split()) or  # Has dosage patterns
            any(re.match(r'^[A-Z][a-zA-Z0-9\s\-\.]{1,20}$', word) for word in query.split())  # Has potential medicine names
        )
        
        if any(cmd in query_lower for cmd in simple_commands) and len(query_lower) < 50 and not has_field_info:
            logger.info("Simple creation command detected, not extracting fields: %s", query)
            return extracted_data
        
        # Enhanced field extraction for field=value patterns
        if creation_type == "medicine":
            field_patterns = [
                (r'name\s*[=:]\s*([^,\n]+)', 'medicineName'),
                (r'dosage\s*[=:]\s*([^,\n]+)', 'dosage'),
                (r'price\s*[=:]\s*([^,\n]+)', 'price'),
                (r'quantity\s*[=:]\s*([^,\n]+)', 'quantity'),
                (r'brand\s*[=:]\s*([^,\n]+)', 'brandName'),
                (r'manufacturer\s*[=:]\s*([^,\n]+)', 'manufacturer'),
                (r'description\s*[=:]\s*([^,\n]+)', 'description'),
                (r'purpose\s*[=:]\s*([^,\n]+)', 'description'),  # Map purpose to description
                (r'created\s+by\s*[=:]\s*([^,\n]+)', 'manufacturer'),  # Map created by to manufacturer
            ]
            
            for pattern, field_name in field_patterns:
                matches = re.findall(pattern, query, re.IGNORECASE)
                for match in matches:
                    value = match.strip()
                    extracted_data[field_name] = value
                    logger.info(f"Extracted {field_name} from field=value: {value}")
            
            # Fallback to old patterns if no field=value patterns found
            if not extracted_data:
                # Medicine name extraction - look for "medicine name is X" or "name is X"
                name_patterns = [
                    r'medicine\s+name\s+is\s+([^,\n]+)',
                    r'name\s+is\s+([^,\n]+)',
                    r'medicine\s+name\s*[=:]\s*([^,\n]+)'
                ]
                for pattern in name_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        potential_name = matches[0].strip()
                        if potential_name.lower() not in ["medicine", "drug", "medication", "tablet", "capsule", "mg", "ml", "yes", "no"]:
                            extracted_data["medicineName"] = potential_name
                            logger.info(f"Extracted medicineName (fallback): {potential_name}")
                            break
                
                # Smart medicine name extraction - look for medicine names at the beginning of the query
                # This handles cases like "dolo dosage is 500mg create medicine"
                # But only if we're not in a field update context
                if "medicineName" not in extracted_data:
                    # Check if this looks like a field update rather than a new medicine creation
                    query_lower = query.lower()
                    
                    # More sophisticated field update detection
                    # If the query contains creation keywords, it's likely a new creation, not a field update
                    creation_keywords = ["create", "make", "new", "add"]
                    has_creation_keywords = any(keyword in query_lower for keyword in creation_keywords)
                    
                    # If it has creation keywords, allow medicine name extraction
                    # If no creation keywords but has field indicators, it's likely a field update
                    is_field_update = (not has_creation_keywords and 
                                    any(indicator in query_lower for indicator in [
                                        "purpose", "description", "price", "quantity", "manufacturer", 
                                        "brand", "name", "is", "=", ":", "for"
                                    ]))
                    
                    if not is_field_update:
                        # Split query into words and look for potential medicine names
                        words = query.strip().split()
                        for i, word in enumerate(words):
                            # Skip common words that aren't medicine names
                            if word.lower() in ["create", "medicine", "supplement", "vaccine", "dosage", "is", "for", "me", "please", "help", "want", "need"]:
                                continue
                            
                            # Check if this word looks like a medicine name (not a number, not a common word)
                            if (len(word) > 2 and 
                                not word.isdigit() and 
                                not re.match(r'^\d+mg$', word.lower()) and
                                not re.match(r'^\d+ml$', word.lower()) and
                                word.lower() not in ["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by"]):
                                
                                # This looks like a medicine name
                                extracted_data["medicineName"] = word
                                logger.info(f"Extracted medicineName (smart detection): {word}")
                                break
                
                # Dosage extraction - look for "dosage is X" or "Xmg"
                dosage_patterns = [
                    r'dosage\s+is\s+([^,\s]+)',  # More specific - stop at whitespace
                    r'dosage\s*[=:]\s*([^,\s]+)',  # More specific - stop at whitespace
                    r'(\d+(?:\.\d+)?\s*(?:mg|ml|mcg|g|units?|iu))',
                    r'(\d+mg)',  # Handle "500mg" format
                    r'(\d+ml)',  # Handle "500ml" format
                    r'(\d+\s*mg)',  # Handle "500 mg" format
                    r'(\d+\s*ml)'   # Handle "500 ml" format
                ]
                for pattern in dosage_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        extracted_data["dosage"] = matches[0].strip()
                        logger.info(f"Extracted dosage (fallback): {matches[0].strip()}")
                        break
                
                # Description extraction - look for "it is for X" or "for X" or "purpose is X"
                desc_patterns = [
                    r'it\s+is\s+for\s+([^,\n]+)',
                    r'for\s+([^,\n]+)',
                    r'purpose\s+is\s+([^,\n]+)',
                    r'purpose\s*[=:]\s*([^,\n]+)',
                    r'purpose\s+([^,\n]+)',  # Handle "purpose fever and energy loss"
                    r'description\s+is\s+([^,\n]+)',  # Handle "description is X"
                    r'description\s*[=:]\s*([^,\n]+)'  # Handle "description: X"
                ]
                for pattern in desc_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        extracted_data["description"] = matches[0].strip()
                        logger.info(f"Extracted description (fallback): {matches[0].strip()}")
                        break
                
                # Manufacturer extraction - look for "created by X"
                manufacturer_patterns = [
                    r'created\s+by\s+([^,\n]+)',
                    r'created\s+by\s*[=:]\s*([^,\n]+)'
                ]
                for pattern in manufacturer_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        extracted_data["manufacturer"] = matches[0].strip()
                        logger.info(f"Extracted manufacturer (fallback): {matches[0].strip()}")
                        break
                
                # Price extraction
                price_patterns = [
                    r'price\s+is\s+([^,\n]+)',
                    r'price\s*[=:]\s*([^,\n]+)',
                    r'(\$\d+(?:\.\d{2})?)',
                    r'(\d+\s*\$?)'
                ]
                for pattern in price_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        extracted_data["price"] = matches[0].strip()
                        logger.info(f"Extracted price (fallback): {matches[0].strip()}")
                        break
                
                # Quantity extraction
                quantity_patterns = [
                    r'quantity\s+is\s+([^,\n]+)',
                    r'quantity\s*[=:]\s*([^,\n]+)',
                    r'(\d+\s*(?:tablets?|capsules?|pills?|units?))'
                ]
                for pattern in quantity_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        extracted_data["quantity"] = matches[0].strip()
                        logger.info(f"Extracted quantity (fallback): {matches[0].strip()}")
                        break
        
        elif creation_type == "supplement":
            field_patterns = [
                (r'name\s*[=:]\s*([^,\n]+)', 'supplementName'),
                (r'dosage\s*[=:]\s*([^,\n]+)', 'dosage'),
                (r'price\s*[=:]\s*([^,\n]+)', 'price'),
                (r'quantity\s*[=:]\s*([^,\n]+)', 'quantity'),
                (r'brand\s*[=:]\s*([^,\n]+)', 'brandName'),
                (r'manufacturer\s*[=:]\s*([^,\n]+)', 'manufacturer'),
                (r'description\s*[=:]\s*([^,\n]+)', 'description'),
                (r'purpose\s*[=:]\s*([^,\n]+)', 'description'),  # Map purpose to description
                (r'created\s+by\s*[=:]\s*([^,\n]+)', 'manufacturer'),  # Map created by to manufacturer
                (r'expiration\s*[=:]\s*([^,\n]+)', 'expDate'),
                (r'exp\s*[=:]\s*([^,\n]+)', 'expDate'),
                (r'expiry\s*[=:]\s*([^,\n]+)', 'expDate'),
            ]
            
            for pattern, field_name in field_patterns:
                matches = re.findall(pattern, query, re.IGNORECASE)
                for match in matches:
                    value = match.strip()
                    extracted_data[field_name] = value
                    logger.info(f"Extracted {field_name} from field=value: {value}")
            
            # Fallback to old patterns if no field=value patterns found
            if not extracted_data:
                # Supplement name extraction - look for "supplement name is X" or "name is X"
                name_patterns = [
                    r'supplement\s+name\s+is\s+([^,\n]+)',
                    r'name\s+is\s+([^,\n]+)',
                    r'supplement\s+name\s*[=:]\s*([^,\n]+)'
                ]
                for pattern in name_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        potential_name = matches[0].strip()
                        if potential_name.lower() not in ["supplement", "vitamin", "mineral", "tablet", "capsule", "mg", "ml", "yes", "no"]:
                            extracted_data["supplementName"] = potential_name
                            logger.info(f"Extracted supplementName (fallback): {potential_name}")
                            break
                
                # Dosage extraction - look for "dosage is X" or "Xmg"
                dosage_patterns = [
                    r'dosage\s+is\s+([^,\n]+)',
                    r'dosage\s*[=:]\s*([^,\n]+)',
                    r'(\d+(?:\.\d+)?\s*(?:mg|ml|mcg|g|units?|iu))'
                ]
                for pattern in dosage_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        extracted_data["dosage"] = matches[0].strip()
                        logger.info(f"Extracted dosage (fallback): {matches[0].strip()}")
                        break
                
                # Description extraction - look for "it is for X" or "for X" or "purpose is X"
                desc_patterns = [
                    r'it\s+is\s+for\s+([^,\n]+)',
                    r'for\s+([^,\n]+)',
                    r'purpose\s+is\s+([^,\n]+)',
                    r'purpose\s*[=:]\s*([^,\n]+)'
                ]
                for pattern in desc_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        extracted_data["description"] = matches[0].strip()
                        logger.info(f"Extracted description (fallback): {matches[0].strip()}")
                        break
                
                # Manufacturer extraction - look for "created by X"
                manufacturer_patterns = [
                    r'created\s+by\s+([^,\n]+)',
                    r'created\s+by\s*[=:]\s*([^,\n]+)'
                ]
                for pattern in manufacturer_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        extracted_data["manufacturer"] = matches[0].strip()
                        logger.info(f"Extracted manufacturer (fallback): {matches[0].strip()}")
                        break
                
                # Brand extraction - look for "brand is X"
                brand_patterns = [
                    r'brand\s+is\s+([^,\n]+)',
                    r'brand\s*[=:]\s*([^,\n]+)'
                ]
                for pattern in brand_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        extracted_data["brandName"] = matches[0].strip()
                        logger.info(f"Extracted brandName (fallback): {matches[0].strip()}")
                        break
                
                # Expiration date extraction
                exp_patterns = [
                    r'expiration\s+is\s+([^,\n]+)',
                    r'expiration\s*[=:]\s*([^,\n]+)',
                    r'exp\s+is\s+([^,\n]+)',
                    r'exp\s*[=:]\s*([^,\n]+)',
                    r'expiry\s+is\s+([^,\n]+)',
                    r'expiry\s*[=:]\s*([^,\n]+)'
                ]
                for pattern in exp_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        extracted_data["expDate"] = matches[0].strip()
                        logger.info(f"Extracted expDate (fallback): {matches[0].strip()}")
                        break
                
                # Price extraction
                price_patterns = [
                    r'price\s+is\s+([^,\n]+)',
                    r'price\s*[=:]\s*([^,\n]+)',
                    r'(\$\d+(?:\.\d{2})?)',
                    r'(\d+\s*\$?)'
                ]
                for pattern in price_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        extracted_data["price"] = matches[0].strip()
                        logger.info(f"Extracted price (fallback): {matches[0].strip()}")
                        break
                
                # Quantity extraction
                quantity_patterns = [
                    r'quantity\s+is\s+([^,\n]+)',
                    r'quantity\s*[=:]\s*([^,\n]+)',
                    r'(\d+\s*(?:tablets?|capsules?|pills?|units?))'
                ]
                for pattern in quantity_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        extracted_data["quantity"] = matches[0].strip()
                        logger.info(f"Extracted quantity (fallback): {matches[0].strip()}")
                        break
        
        elif creation_type == "vaccine":
            field_patterns = [
                (r'name\s*[=:]\s*([^,\n]+)', 'vaccineName'),
                (r'dosage\s*[=:]\s*([^,\n]+)', 'dosage'),
                (r'price\s*[=:]\s*([^,\n]+)', 'price'),
                (r'quantity\s*[=:]\s*([^,\n]+)', 'quantity'),
                (r'brand\s*[=:]\s*([^,\n]+)', 'brandName'),
                (r'manufacturer\s*[=:]\s*([^,\n]+)', 'manufacturer'),
                (r'description\s*[=:]\s*([^,\n]+)', 'description'),
                (r'purpose\s*[=:]\s*([^,\n]+)', 'description'),  # Map purpose to description
                (r'created\s+by\s*[=:]\s*([^,\n]+)', 'manufacturer'),  # Map created by to manufacturer
                (r'expiration\s*[=:]\s*([^,\n]+)', 'expDate'),
                (r'exp\s*[=:]\s*([^,\n]+)', 'expDate'),
                (r'expiry\s*[=:]\s*([^,\n]+)', 'expDate'),
                (r'age\s*[=:]\s*([^,\n]+)', 'ageGroup'),
                (r'age\s+group\s*[=:]\s*([^,\n]+)', 'ageGroup'),
            ]
            
            for pattern, field_name in field_patterns:
                matches = re.findall(pattern, query, re.IGNORECASE)
                for match in matches:
                    value = match.strip()
                    extracted_data[field_name] = value
                    logger.info(f"Extracted {field_name} from field=value: {value}")
            
            # Fallback to old patterns if no field=value patterns found
            if not extracted_data:
                # Vaccine name extraction - look for "vaccine name is X" or "name is X"
                name_patterns = [
                    r'vaccine\s+name\s+is\s+([^,\n]+)',
                    r'name\s+is\s+([^,\n]+)',
                    r'vaccine\s+name\s*[=:]\s*([^,\n]+)'
                ]
                for pattern in name_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        potential_name = matches[0].strip()
                        if potential_name.lower() not in ["vaccine", "shot", "injection", "tablet", "capsule", "mg", "ml", "yes", "no"]:
                            extracted_data["vaccineName"] = potential_name
                            logger.info(f"Extracted vaccineName (fallback): {potential_name}")
                            break
                
                # Dosage extraction - look for "dosage is X" or "Xmg"
                dosage_patterns = [
                    r'dosage\s+is\s+([^,\n]+)',
                    r'dosage\s*[=:]\s*([^,\n]+)',
                    r'(\d+(?:\.\d+)?\s*(?:mg|ml|mcg|g|units?|iu))'
                ]
                for pattern in dosage_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        extracted_data["dosage"] = matches[0].strip()
                        logger.info(f"Extracted dosage (fallback): {matches[0].strip()}")
                        break
                
                # Description extraction - look for "it is for X" or "for X" or "purpose is X"
                desc_patterns = [
                    r'it\s+is\s+for\s+([^,\n]+)',
                    r'for\s+([^,\n]+)',
                    r'purpose\s+is\s+([^,\n]+)',
                    r'purpose\s*[=:]\s*([^,\n]+)'
                ]
                for pattern in desc_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        extracted_data["description"] = matches[0].strip()
                        logger.info(f"Extracted description (fallback): {matches[0].strip()}")
                        break
                
                # Manufacturer extraction - look for "created by X"
                manufacturer_patterns = [
                    r'created\s+by\s+([^,\n]+)',
                    r'created\s+by\s*[=:]\s*([^,\n]+)'
                ]
                for pattern in manufacturer_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        extracted_data["manufacturer"] = matches[0].strip()
                        logger.info(f"Extracted manufacturer (fallback): {matches[0].strip()}")
                        break
                
                # Price extraction
                price_patterns = [
                    r'price\s+is\s+([^,\n]+)',
                    r'price\s*[=:]\s*([^,\n]+)',
                    r'(\$\d+(?:\.\d{2})?)',
                    r'(\d+\s*\$?)'
                ]
                for pattern in price_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        extracted_data["price"] = matches[0].strip()
                        logger.info(f"Extracted price (fallback): {matches[0].strip()}")
                        break
                
                # Quantity extraction
                quantity_patterns = [
                    r'quantity\s+is\s+([^,\n]+)',
                    r'quantity\s*[=:]\s*([^,\n]+)',
                    r'(\d+\s*(?:doses?|shots?|injections?|units?))'
                ]
                for pattern in quantity_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        extracted_data["quantity"] = matches[0].strip()
                        logger.info(f"Extracted quantity (fallback): {matches[0].strip()}")
                        break
                
                # Brand extraction - look for "brand is X"
                brand_patterns = [
                    r'brand\s+is\s+([^,\n]+)',
                    r'brand\s*[=:]\s*([^,\n]+)'
                ]
                for pattern in brand_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        extracted_data["brandName"] = matches[0].strip()
                        logger.info(f"Extracted brandName (fallback): {matches[0].strip()}")
                        break
                
                # Age group extraction
                age_patterns = [
                    r'age\s+group\s+is\s+([^,\n]+)',
                    r'age\s+group\s*[=:]\s*([^,\n]+)',
                    r'age\s+is\s+([^,\n]+)',
                    r'age\s*[=:]\s*([^,\n]+)'
                ]
                for pattern in age_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        extracted_data["ageGroup"] = matches[0].strip()
                        logger.info(f"Extracted ageGroup (fallback): {matches[0].strip()}")
                        break
                
                # Expiration date extraction
                exp_patterns = [
                    r'expiration\s+is\s+([^,\n]+)',
                    r'expiration\s*[=:]\s*([^,\n]+)',
                    r'exp\s+is\s+([^,\n]+)',
                    r'exp\s*[=:]\s*([^,\n]+)',
                    r'expiry\s+is\s+([^,\n]+)',
                    r'expiry\s*[=:]\s*([^,\n]+)'
                ]
                for pattern in exp_patterns:
                    matches = re.findall(pattern, query, re.IGNORECASE)
                    if matches:
                        extracted_data["expDate"] = matches[0].strip()
                        logger.info(f"Extracted expDate (fallback): {matches[0].strip()}")
                        break
        
        elif creation_type == "supplement":
            # Supplement name extraction - look for "supplement name is X" or "name is X"
            name_patterns = [
                r'supplement\s+name\s+is\s+([^,\n]+)',
                r'name\s+is\s+([^,\n]+)',
                r'supplement\s+name\s*[=:]\s*([^,\n]+)'
            ]
            for pattern in name_patterns:
                matches = re.findall(pattern, query, re.IGNORECASE)
                if matches:
                    potential_name = matches[0].strip()
                    if potential_name.lower() not in ["supplement", "vitamin", "mineral", "tablet", "capsule", "mg", "ml", "yes", "no"]:
                        extracted_data["supplementName"] = potential_name
                        logger.info(f"Extracted supplementName (fallback): {potential_name}")
                        break
            
            # Dosage extraction - look for "dosage is X" or "Xmg"
            dosage_patterns = [
                r'dosage\s+is\s+([^,\n]+)',
                r'dosage\s*[=:]\s*([^,\n]+)',
                r'(\d+(?:\.\d+)?\s*(?:mg|ml|mcg|g|units?|iu))'
            ]
            for pattern in dosage_patterns:
                matches = re.findall(pattern, query, re.IGNORECASE)
                if matches:
                    extracted_data["dosage"] = matches[0].strip()
                    logger.info(f"Extracted dosage (fallback): {matches[0].strip()}")
                    break
            
            # Description extraction - look for "it is for X" or "for X" or "purpose is X"
            desc_patterns = [
                r'it\s+is\s+for\s+([^,\n]+)',
                r'for\s+([^,\n]+)',
                r'purpose\s+is\s+([^,\n]+)',
                r'purpose\s*[=:]\s*([^,\n]+)'
            ]
            for pattern in desc_patterns:
                matches = re.findall(pattern, query, re.IGNORECASE)
                if matches:
                    extracted_data["description"] = matches[0].strip()
                    logger.info(f"Extracted description (fallback): {matches[0].strip()}")
                    break
            
            # Manufacturer extraction - look for "created by X"
            manufacturer_patterns = [
                r'created\s+by\s+([^,\n]+)',
                r'created\s+by\s*[=:]\s*([^,\n]+)'
            ]
            for pattern in manufacturer_patterns:
                matches = re.findall(pattern, query, re.IGNORECASE)
                if matches:
                    extracted_data["manufacturer"] = matches[0].strip()
                    logger.info(f"Extracted manufacturer (fallback): {matches[0].strip()}")
                    break
            
            # Brand extraction - look for "brand is X"
            brand_patterns = [
                r'brand\s+is\s+([^,\n]+)',
                r'brand\s*[=:]\s*([^,\n]+)'
            ]
            for pattern in brand_patterns:
                matches = re.findall(pattern, query, re.IGNORECASE)
                if matches:
                    extracted_data["brandName"] = matches[0].strip()
                    logger.info(f"Extracted brandName (fallback): {matches[0].strip()}")
                    break
            
            # Expiration date extraction
            exp_patterns = [
                r'expiration\s+is\s+([^,\n]+)',
                r'expiration\s*[=:]\s*([^,\n]+)',
                r'exp\s+is\s+([^,\n]+)',
                r'exp\s*[=:]\s*([^,\n]+)',
                r'expiry\s+is\s+([^,\n]+)',
                r'expiry\s*[=:]\s*([^,\n]+)'
            ]
            for pattern in exp_patterns:
                matches = re.findall(pattern, query, re.IGNORECASE)
                if matches:
                    extracted_data["expDate"] = matches[0].strip()
                    logger.info(f"Extracted expDate (fallback): {matches[0].strip()}")
                    break
        
        elif creation_type == "vaccine":
            # Vaccine name extraction - look for "vaccine name is X" or "name is X"
            name_patterns = [
                r'vaccine\s+name\s+is\s+([^,\n]+)',
                r'name\s+is\s+([^,\n]+)',
                r'vaccine\s+name\s*[=:]\s*([^,\n]+)'
            ]
            for pattern in name_patterns:
                matches = re.findall(pattern, query, re.IGNORECASE)
                if matches:
                    potential_name = matches[0].strip()
                    if potential_name.lower() not in ["vaccine", "shot", "injection", "tablet", "capsule", "mg", "ml", "yes", "no"]:
                        extracted_data["vaccineName"] = potential_name
                        logger.info(f"Extracted vaccineName (fallback): {potential_name}")
                        break
            
            # Dosage extraction - look for "dosage is X" or "Xmg"
            dosage_patterns = [
                r'dosage\s+is\s+([^,\n]+)',
                r'dosage\s*[=:]\s*([^,\n]+)',
                r'(\d+(?:\.\d+)?\s*(?:mg|ml|mcg|g|units?|iu))'
            ]
            for pattern in dosage_patterns:
                matches = re.findall(pattern, query, re.IGNORECASE)
                if matches:
                    extracted_data["dosage"] = matches[0].strip()
                    logger.info(f"Extracted dosage (fallback): {matches[0].strip()}")
                    break
            
            # Description extraction - look for "it is for X" or "for X" or "purpose is X"
            desc_patterns = [
                r'it\s+is\s+for\s+([^,\n]+)',
                r'for\s+([^,\n]+)',
                r'purpose\s+is\s+([^,\n]+)',
                r'purpose\s*[=:]\s*([^,\n]+)'
            ]
            for pattern in desc_patterns:
                matches = re.findall(pattern, query, re.IGNORECASE)
                if matches:
                    extracted_data["description"] = matches[0].strip()
                    logger.info(f"Extracted description (fallback): {matches[0].strip()}")
                    break
            
            # Manufacturer extraction - look for "created by X"
            manufacturer_patterns = [
                r'created\s+by\s+([^,\n]+)',
                r'created\s+by\s*[=:]\s*([^,\n]+)'
            ]
            for pattern in manufacturer_patterns:
                matches = re.findall(pattern, query, re.IGNORECASE)
                if matches:
                    extracted_data["manufacturer"] = matches[0].strip()
                    logger.info(f"Extracted manufacturer (fallback): {matches[0].strip()}")
                    break
            
            # Brand extraction - look for "brand is X"
            brand_patterns = [
                r'brand\s+is\s+([^,\n]+)',
                r'brand\s*[=:]\s*([^,\n]+)'
            ]
            for pattern in brand_patterns:
                matches = re.findall(pattern, query, re.IGNORECASE)
                if matches:
                    extracted_data["brandName"] = matches[0].strip()
                    logger.info(f"Extracted brandName (fallback): {matches[0].strip()}")
                    break
            
            # Age group extraction
            age_patterns = [
                r'age\s+group\s+is\s+([^,\n]+)',
                r'age\s+group\s*[=:]\s*([^,\n]+)',
                r'age\s+is\s+([^,\n]+)',
                r'age\s*[=:]\s*([^,\n]+)'
            ]
            for pattern in age_patterns:
                matches = re.findall(pattern, query, re.IGNORECASE)
                if matches:
                    extracted_data["ageGroup"] = matches[0].strip()
                    logger.info(f"Extracted ageGroup (fallback): {matches[0].strip()}")
                    break
            
            # Expiration date extraction
            exp_patterns = [
                r'expiration\s+is\s+([^,\n]+)',
                r'expiration\s*[=:]\s*([^,\n]+)',
                r'exp\s+is\s+([^,\n]+)',
                r'exp\s*[=:]\s*([^,\n]+)',
                r'expiry\s+is\s+([^,\n]+)',
                r'expiry\s*[=:]\s*([^,\n]+)'
            ]
            for pattern in exp_patterns:
                matches = re.findall(pattern, query, re.IGNORECASE)
                if matches:
                    extracted_data["expDate"] = matches[0].strip()
                    logger.info(f"Extracted expDate (fallback): {matches[0].strip()}")
                    break
        
        return extracted_data

    def _get_field_prompt(self, field_name: str, creation_type: str) -> str:
        """Get prompt for a specific field"""
        prompts = {
            "medicineName": "What's the name of the medicine?",
            "supplementName": "What's the name of the supplement?",
            "vaccineName": "What's the name of the vaccine?",
            "dosage": "What's the dosage? (e.g., 500mg, 2 tablets)",
            "description": "Please provide a description:",
            "price": "What's the price? (e.g., $30, 25.99)",
            "quantity": "What's the quantity? (e.g., 10 tablets, 30 capsules)",
            "brandName": "What's the brand name?",
            "manufacturer": "Who is the manufacturer?",
            "expDate": "What's the expiration date? (YYYY-MM-DD format)",
            "ageGroup": "What's the age group? (e.g., 0-6 months, 6-12 months, 1-2 years, 2-5 years, 5+ years)",
            "frequency": "How often should it be taken? (e.g., daily, twice daily, every 8 hours, weekly)",
            "timeOfDay": "What time of day? (e.g., morning, evening, before meals, after meals, 9 AM, 8 PM)",
            "startDate": "When should the schedule start? (YYYY-MM-DD format)",
            "endDate": "When should the schedule end? (YYYY-MM-DD format, or 'ongoing')",
            "instructions": "Any special instructions? (e.g., take with food, avoid dairy, store in refrigerator)"
        }
        return prompts.get(field_name, f"Please provide the {field_name}:")

    async def _extract_fields_with_gpt(self, query: str, creation_type: str, current_data: Dict[str, str]) -> Dict[str, str]:
        """Use GPT to intelligently extract field updates from user input"""
        try:
            if not self.client:
                return {}
            
            # Create a prompt for GPT to understand what fields the user is updating
            system_prompt = f"""You are a field extraction assistant for a {creation_type} creation system.

Current {creation_type} data:
{current_data}

User input: "{query}"

Your task is to identify which fields the user is updating or providing values for.

For medicine creation, the fields are:
- medicineName: The name of the medicine
- dosage: The dosage (e.g., 500mg, 2 tablets)
- description: The purpose/description (e.g., "for fever", "pain relief")
- price: The price (e.g., $10, 15.99)
- quantity: The quantity (e.g., 30 tablets, 50 capsules)

For supplement creation, the fields are:
- supplementName: The name of the supplement
- dosage: The dosage
- description: The purpose/description
- price: The price
- quantity: The quantity
- brandName: The brand name
- manufacturer: The manufacturer
- expDate: Expiration date

Respond with ONLY a JSON object mapping field names to values. If no fields are being updated, return {{}}.

Examples:
- User: "Purpose is fever and energy loss" → {{"description": "fever and energy loss"}}
- User: "Price is $25" → {{"price": "$25"}}
- User: "Quantity is 50 tablets" → {{"quantity": "50 tablets"}}

Response format: {{"fieldName": "value"}}"""

            response = await self.client.chat.completions.create(
                model=self.model.value,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": query}
                ],
                max_tokens=200,
                temperature=0.1
            )
            
            gpt_response = response.choices[0].message.content.strip()
            
            # Try to parse JSON response
            import json
            try:
                extracted_fields = json.loads(gpt_response)
                if isinstance(extracted_fields, dict):
                    logger.info(f"GPT extracted fields: {extracted_fields}")
                    return extracted_fields
            except json.JSONDecodeError:
                logger.warning(f"GPT response not valid JSON: {gpt_response}")
                return {}
                
        except Exception as e:
            logger.error(f"Error in GPT field extraction: {str(e)}")
            return {}
        
        return {}

    async def _understand_conversation_with_gpt(self, query: str, conversation_context: Dict[str, Any]) -> Dict[str, Any]:
        """Use GPT to understand user intent in ongoing conversations"""
        try:
            if not self.client:
                return {"intent": "unknown", "action": "continue", "fields": {}}
            
            # Create a comprehensive prompt for GPT to understand the conversation
            system_prompt = f"""You are a conversation understanding assistant for a medicine/supplement creation system.

Current conversation context:
- State: {conversation_context.get('state', 'unknown')}
- Creation Type: {conversation_context.get('creation_type', 'unknown')}
- Collected Data: {conversation_context.get('collected_data', {})}
- Current Field: {conversation_context.get('current_field', 'none')}

User's latest input: "{query}"

Your task is to understand the user's intent and what action should be taken.

Possible intents:
1. "field_update" - User is updating/adding field values
2. "confirmation" - User is confirming (yes/no) an action
3. "save_request" - User wants to save/finalize the item
4. "modification_request" - User wants to modify existing data
5. "new_creation" - User wants to start a new creation
6. "general_question" - User has a general health question
7. "cancellation" - User wants to cancel/stop

For field updates, extract the fields being updated.
For confirmations, determine if it's yes/no.
For save requests, confirm the action.

Respond with ONLY a JSON object in this format:
{{
    "intent": "intent_type",
    "action": "action_to_take",
    "fields": {{"fieldName": "value"}},
    "confidence": 0.95
}}

Examples:
- User: "Purpose is fever and energy loss" → {{"intent": "field_update", "action": "update_fields", "fields": {{"description": "fever and energy loss"}}, "confidence": 0.95}}
- User: "save it" → {{"intent": "save_request", "action": "save_item", "fields": {{}}, "confidence": 0.9}}
- User: "yes" → {{"intent": "confirmation", "action": "confirm", "fields": {{}}, "confidence": 0.9}}
- User: "no" → {{"intent": "confirmation", "action": "deny", "fields": {{}}, "confidence": 0.9}}"""

            response = await self.client.chat.completions.create(
                model=self.model.value,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": query}
                ],
                max_tokens=300,
                temperature=0.1
            )
            
            gpt_response = response.choices[0].message.content.strip()
            
            # Try to parse JSON response
            import json
            try:
                result = json.loads(gpt_response)
                if isinstance(result, dict):
                    logger.info(f"GPT conversation understanding: {result}")
                    return result
            except json.JSONDecodeError:
                logger.warning(f"GPT response not valid JSON: {gpt_response}")
                return {"intent": "unknown", "action": "continue", "fields": {}}
                
        except Exception as e:
            logger.error(f"Error in GPT conversation understanding: {str(e)}")
            return {"intent": "unknown", "action": "continue", "fields": {}}
        
        return {"intent": "unknown", "action": "continue", "fields": {}}

    def _intelligently_assign_field(self, query: str, missing_fields: set, creation_type: str) -> Optional[str]:
        """Intelligently assign user input to the most appropriate field"""
        query_lower = query.lower().strip()
        
        # Check for confirmation responses
        if any(word in query_lower for word in ["yes", "y", "confirm", "create", "ok", "okay"]):
            return None  # Let the confirmation handler deal with this
        
        # Check for cancellation responses
        if any(word in query_lower for word in ["no", "n", "cancel", "abort", "stop"]):
            return None  # Let the confirmation handler deal with this
        
        # Medicine name detection (capitalized words that look like names)
        if "medicineName" in missing_fields:
            if re.match(r'^[A-Z][a-zA-Z0-9\s\-\.]{1,20}$', query.strip()):
                potential_name = query.strip()
                if potential_name.lower() not in ["medicine", "drug", "medication", "tablet", "capsule", "mg", "ml", "yes", "no"]:
                    return "medicineName"
        
        # Dosage detection (numbers with units)
        if "dosage" in missing_fields:
            if re.match(r'^\d+(?:\.\d+)?\s*(?:mg|ml|mcg|g|units?|iu)$', query.strip(), re.IGNORECASE):
                return "dosage"
        
        # Price detection (numbers, possibly with currency)
        if "price" in missing_fields:
            # Handle various price formats: $30, 30$, 30, 30.00, etc.
            price_patterns = [
                r'^\$?\d+(?:\.\d{2})?$',  # $30, 30, 30.00
                r'^\d+\$?$',               # 30$, 30
                r'price\s+is\s*(\$?\d+(?:\.\d{2})?)',  # price is $30
                r'(\$?\d+(?:\.\d{2})?)\s*\$?',         # $30, 30$ (with optional $ at end)
                r'^\d+\s*\$?$',                         # 30, 30$ (space before $)
                r'^\$\d+(?:\.\d{2})?$'                 # $30, $30.00
            ]
            for pattern in price_patterns:
                if re.match(pattern, query.strip(), re.IGNORECASE):
                    return "price"
        
        # Quantity detection (numbers with units)
        if "quantity" in missing_fields:
            quantity_patterns = [
                r'^\d+\s*(?:tablets?|capsules?|pills?|units?)$',  # 10 tablets, 5 capsules
                r'^\d+\s*(?:tablet|capsule|pill|unit)$',          # 10 tablet, 5 capsule
                r'^\d+$',                                          # Just numbers like 10
                r'(\d+)\s*(?:tablets?|capsules?|pills?|units?)',  # Extract number from "10 tablets"
                r'(\d+)\s*(?:tablet|capsule|pill|unit)'           # Extract number from "10 tablet"
            ]
            for pattern in quantity_patterns:
                if re.match(pattern, query.strip(), re.IGNORECASE):
                    return "quantity"
        
        # Expiration date detection (YYYY-MM-DD format)
        if "expDate" in missing_fields:
            if re.match(r'^\d{4}-\d{2}-\d{2}$', query.strip()):
                return "expDate"
        
        # If no specific field matches, return None to use fallback assignment
        return None

    async def _handle_comprehensive_creation(self, query: str, anon_token: str, user_jwt: str = None) -> Dict[str, Any]:
        """Handle creation commands (medicine/supplement)"""
        try:
            logger.info("Starting comprehensive creation flow for query: %s", query)
            
            # Determine creation type
            query_lower = query.lower()
            if "medicine schedule" in query_lower:
                creation_type = "medicine_schedule"
                required_fields = self._get_required_medicine_schedule_fields()
            elif "supplement schedule" in query_lower:
                creation_type = "supplement_schedule"
                required_fields = self._get_required_supplement_schedule_fields()
            elif "vaccine schedule" in query_lower:
                creation_type = "vaccine_schedule"
                required_fields = self._get_required_vaccine_schedule_fields()
            elif "medicine" in query_lower:
                creation_type = "medicine"
                required_fields = self._get_required_medicine_fields()
            elif "supplement" in query_lower:
                creation_type = "supplement"
                required_fields = self._get_required_supplement_fields()
            elif "vaccine" in query_lower:
                creation_type = "vaccine"
                required_fields = self._get_required_vaccine_fields()
            else:
                return {
                    "response": "I can help you create medicines, supplements, vaccines, or their schedules. Please specify which one you'd like to create.",
                    "metadata": {"error": "creation_type_not_specified"},
                    "disclaimer": self.medical_disclaimer
                }
            
            # Extract any initial field values from the query
            extracted_data = self._extract_initial_field_values(query, creation_type)
            
            # Add sensible defaults for missing fields to improve user experience
            if creation_type == "medicine":
                if "description" not in extracted_data:
                    extracted_data["description"] = "General use"
                if "price" not in extracted_data:
                    extracted_data["price"] = "10.00"  # Default price
                if "quantity" not in extracted_data:
                    extracted_data["quantity"] = "30"   # Default quantity (30 tablets)
                if "manufacturer" not in extracted_data:
                    extracted_data["manufacturer"] = "Generic"
            
            # Initialize conversation state
            state = {
                "state": f"collecting_{creation_type}",
                "creation_type": creation_type,
                "required_fields": required_fields,
                "collected_data": extracted_data,
                "current_field": None,
                "started_at": datetime.now(timezone.utc).isoformat()
            }
            
            # Save state to database
            logger.info("💾 Saving conversation state for token: %s, state: %s", anon_token, state)
            await self.database.save_conversation_state(anon_token, state)
            logger.info("✅ Conversation state saved successfully")
            
            # Determine which fields are still missing
            missing_fields = set(required_fields) - set(extracted_data.keys())
            
            # Check if we have enough information to proceed
            # For medicine creation, if we have name and dosage, we can proceed with defaults
            if creation_type == "medicine" and "medicineName" in extracted_data and "dosage" in extracted_data:
                logger.info("Have essential fields (name and dosage), proceeding to creation with defaults")
                state["state"] = "confirming"
                await self.database.save_conversation_state(anon_token, state)
                
                # Create the item immediately
                return await self._create_item(state, anon_token, user_jwt)
            elif missing_fields:
                # Ask for the next missing field in the correct order
                next_field = self._get_next_field_in_order(missing_fields, required_fields)
                state["current_field"] = next_field
                await self.database.save_conversation_state(anon_token, state)
                
                field_prompt = self._get_field_prompt(next_field, creation_type)
                return {
                    "response": f"Great! I'll help you create a {creation_type}. {field_prompt}",
                    "metadata": {
                        "creation_type": creation_type,
                        "state": "collecting",
                        "current_field": next_field,
                        "extracted_fields": list(extracted_data.keys()),
                        "missing_fields": list(missing_fields)
                    },
                    "disclaimer": self.medical_disclaimer
                }
            else:
                # All fields collected, immediately create the item
                logger.info("All fields collected, immediately creating %s", creation_type)
                state["state"] = "confirming"
                await self.database.save_conversation_state(anon_token, state)
                
                # Create the item immediately instead of asking for confirmation
                return await self._create_item(state, anon_token, user_jwt)
                
        except Exception as e:
            logger.error("Error in comprehensive creation: %s", str(e))
            if anon_token:
                await self.database.delete_conversation_state(anon_token)
            return {
                "response": f"I encountered an error while starting the creation process: {str(e)}",
                "metadata": {"error": str(e)},
                "disclaimer": self.medical_disclaimer
            }

    async def _handle_creation_flow(self, query: str, anon_token: str, user_jwt: str, state: Dict[str, Any]) -> Dict[str, Any]:
        """Handle ongoing creation flow"""
        try:
            logger.info("Handling creation flow. Current state: %s, Query: %s", state.get("state"), query)
            
            if state["state"] == "confirming":
                # Use GPT to understand user intent in confirmation state
                logger.info("Using GPT to understand user intent in confirmation state")
                gpt_understanding = await self._understand_conversation_with_gpt(query, state)
                
                if gpt_understanding["intent"] == "field_update":
                    logger.info("GPT detected field update, switching to field collection")
                    # Switch back to collecting state to handle field updates
                    state["state"] = f"collecting_{state['creation_type']}"
                    await self.database.save_conversation_state(anon_token, state)
                    
                    # Now handle as field collection with GPT-extracted fields
                    return await self._handle_creation_flow(query, anon_token, user_jwt, state)
                
                elif gpt_understanding["intent"] == "save_request":
                    logger.info("GPT detected save request, confirming save and clearing state")
                    # Clear the conversation state since the item is already created
                    await self.database.delete_conversation_state(anon_token)
                    return {
                        "response": "Perfect! Your medicine has been saved successfully. Is there anything else you'd like me to help you with?",
                        "metadata": {"action": "saved", "creation_type": state["creation_type"]},
                        "disclaimer": self.medical_disclaimer
                    }
                
                elif gpt_understanding["intent"] == "confirmation":
                    if gpt_understanding["action"] == "confirm":
                        logger.info("GPT detected confirmation, proceeding to create")
                        return await self._create_item(state, anon_token, user_jwt)
                    elif gpt_understanding["action"] == "deny":
                        logger.info("GPT detected denial, cancelling creation")
                        await self.database.delete_conversation_state(anon_token)
                        return {
                            "response": "Creation cancelled. How else can I help you?",
                            "metadata": {"action": "cancelled"},
                            "disclaimer": self.medical_disclaimer
                        }
                
                elif gpt_understanding["intent"] == "cancellation":
                    logger.info("GPT detected cancellation, cancelling creation")
                    await self.database.delete_conversation_state(anon_token)
                    return {
                        "response": "Creation cancelled. How else can I help you?",
                        "metadata": {"action": "cancelled"},
                        "disclaimer": self.medical_disclaimer
                    }
                
                # Fallback to static logic if GPT fails
                query_lower = query.lower().strip()
                
                # Handle "no create for this medicine" confirmation
                if "no create for this" in query_lower or "create for this" in query_lower:
                    logger.info("User said 'no create for this', treating as confirmation to create")
                    return await self._create_item(state, anon_token, user_jwt)
                
                # Standard confirmation handling
                if any(word in query_lower for word in ["yes", "y", "confirm", "create", "ok", "okay"]):
                    return await self._create_item(state, anon_token, user_jwt)
                elif any(word in query_lower for word in ["no", "n", "cancel", "abort", "stop"]):
                    await self.database.delete_conversation_state(anon_token)
                    return {
                        "response": "Creation cancelled. How else can I help you?",
                        "metadata": {"action": "cancelled"},
                        "disclaimer": self.medical_disclaimer
                    }
                else:
                    return {
                        "response": "Please confirm if you want to create this item. Reply with 'yes' to create or 'no' to cancel.",
                        "metadata": {"action": "awaiting_confirmation"},
                        "disclaimer": self.medical_disclaimer
                    }
            
            elif state["state"] in ["collecting_supplement", "collecting_medicine", "collecting_vaccine", "collecting_medicine_schedule", "collecting_supplement_schedule", "collecting_vaccine_schedule"]:
                # Use GPT as the primary method for understanding user input
                extracted_fields = {}
                if self.client:
                    # First try GPT for comprehensive understanding
                    gpt_understanding = await self._understand_conversation_with_gpt(query, state)
                    
                    if gpt_understanding["intent"] == "field_update":
                        extracted_fields = gpt_understanding["fields"]
                        logger.info(f"GPT extracted fields: {extracted_fields}")
                    elif gpt_understanding["intent"] == "save_request":
                        # User wants to save, proceed to creation
                        logger.info("GPT detected save request during field collection")
                        state["state"] = "confirming"
                        await self.database.save_conversation_state(anon_token, state)
                        return await self._create_item(state, anon_token, user_jwt)
                    elif gpt_understanding["intent"] == "confirmation":
                        # User is confirming something, handle appropriately
                        if gpt_understanding["action"] == "confirm":
                            logger.info("GPT detected confirmation during field collection")
                            state["state"] = "confirming"
                            await self.database.save_conversation_state(anon_token, state)
                            return await self._create_item(state, anon_token, user_jwt)
                
                # Fallback to regex extraction if GPT didn't extract fields
                if not extracted_fields:
                    extracted_fields = self._extract_initial_field_values(query, state["creation_type"])
                    
                    # Also try GPT field extraction as backup
                    if self.client:
                        gpt_extracted_fields = await self._extract_fields_with_gpt(query, state["creation_type"], state["collected_data"])
                        if gpt_extracted_fields:
                            extracted_fields.update(gpt_extracted_fields)
                
                missing_fields = set(state["required_fields"]) - set(state["collected_data"].keys())
                
                # If no fields were extracted but we have a current field being requested,
                # treat the user input as a value for that field
                if not extracted_fields and state.get("current_field") and missing_fields:
                    current_field = state["current_field"]
                    # Check if this looks like a simple value (not a command or question)
                    query_lower = query.lower().strip()
                    if (len(query.strip()) > 0 and 
                        not any(word in query_lower for word in ["yes", "no", "cancel", "stop", "help", "what", "how", "why", "when", "where"]) and
                        not query_lower.endswith("?")):
                        
                        # Treat this as a value for the current field
                        extracted_fields = {current_field: query.strip()}
                        logger.info(f"Treating '{query.strip()}' as value for current field '{current_field}'")
                
                if extracted_fields:
                    # Fields extracted - update the collected data
                    updated_fields = []
                    for field_name, field_value in extracted_fields.items():
                        if field_name in state["required_fields"]:
                            old_value = state["collected_data"].get(field_name, "Not set")
                            state["collected_data"][field_name] = field_value
                            updated_fields.append(field_name)
                            logger.info(f"Updated field '{field_name}' from '{old_value}' to '{field_value}'")
                    
                    await self.database.save_conversation_state(anon_token, state)
                    
                    # Check if we now have enough information to proceed
                    if state["creation_type"] == "medicine" and "medicineName" in state["collected_data"] and "dosage" in state["collected_data"]:
                        logger.info("Now have essential fields (name and dosage), proceeding to creation")
                        state["state"] = "confirming"
                        await self.database.save_conversation_state(anon_token, state)
                        return await self._create_item(state, anon_token, user_jwt)
                    
                    # Check remaining missing fields
                    remaining_fields = set(state["required_fields"]) - set(state["collected_data"].keys())
                    if remaining_fields:
                        next_field = self._get_next_field_in_order(remaining_fields, state["required_fields"])
                        state["current_field"] = next_field
                        await self.database.save_conversation_state(anon_token, state)
                        
                        field_prompt = self._get_field_prompt(next_field, state["creation_type"])
                        return {
                            "response": f"Great! I've updated the {', '.join(updated_fields)}. {field_prompt}",
                            "metadata": {
                                "updated_fields": updated_fields,
                                "current_field": next_field,
                                "remaining_fields": list(remaining_fields)
                            },
                            "disclaimer": self.medical_disclaimer
                        }
                    else:
                        state["state"] = "confirming"
                        await self.database.save_conversation_state(anon_token, state)
                        return await self._show_creation_summary(state, anon_token, user_jwt)
                else:
                    # Intelligent single field handling
                    if missing_fields:
                        # Try to intelligently assign the input to the most appropriate field
                        assigned_field = self._intelligently_assign_field(query, missing_fields, state["creation_type"])
                        
                        if assigned_field:
                            state["collected_data"][assigned_field] = query.strip()
                            state["current_field"] = assigned_field
                            logger.info(f"Intelligently assigned {assigned_field} = {query.strip()}")
                            
                            remaining_fields = missing_fields - {assigned_field}
                            if remaining_fields:
                                next_field = self._get_next_field_in_order(remaining_fields, state["required_fields"])
                                state["current_field"] = next_field
                                await self.database.save_conversation_state(anon_token, state)
                                
                                field_prompt = self._get_field_prompt(next_field, state["creation_type"])
                                return {
                                    "response": f"Perfect! {field_prompt}",
                                    "metadata": {
                                        "added_field": assigned_field,
                                        "current_field": next_field,
                                        "remaining_fields": list(remaining_fields)
                                    },
                                    "disclaimer": self.medical_disclaimer
                                }
                            else:
                                state["state"] = "confirming"
                                await self.database.save_conversation_state(anon_token, state)
                                return await self._show_creation_summary(state, anon_token, user_jwt)
                        else:
                            # Fallback: assign to the first missing field in the correct order
                            next_field = self._get_next_field_in_order(missing_fields, state["required_fields"])
                            state["collected_data"][next_field] = query.strip()
                            state["current_field"] = next_field
                            logger.info(f"Fallback assigned {next_field} = {query.strip()}")
                            
                            remaining_fields = missing_fields - {next_field}
                            if remaining_fields:
                                next_next_field = self._get_next_field_in_order(remaining_fields, state["required_fields"])
                                state["current_field"] = next_next_field
                                await self.database.save_conversation_state(anon_token, state)
                                
                                field_prompt = self._get_field_prompt(next_next_field, state["creation_type"])
                                return {
                                    "response": f"Got it! {field_prompt}",
                                    "metadata": {
                                        "added_field": next_field,
                                        "current_field": next_next_field,
                                        "remaining_fields": list(remaining_fields)
                                    },
                                    "disclaimer": self.medical_disclaimer
                                }
                            else:
                                state["state"] = "confirming"
                                await self.database.save_conversation_state(anon_token, state)
                                return await self._show_creation_summary(state, anon_token, user_jwt)
            
            return {
                "response": "I'm not sure how to handle that. Please provide the requested information or ask for help.",
                "metadata": {"action": "confused"},
                "disclaimer": self.medical_disclaimer
            }
            
        except Exception as e:
            logger.error("Error in creation flow: %s", str(e))
            return {
                "response": f"I encountered an error: {str(e)}",
                "metadata": {"error": str(e)},
                "disclaimer": self.medical_disclaimer
            }

    async def _show_creation_summary(self, state: Dict[str, Any], anon_token: str, user_jwt: str) -> Dict[str, Any]:
        """Show summary of collected data for confirmation"""
        try:
            creation_type = state["creation_type"]
            collected_data = state["collected_data"]
            
            if creation_type == "medicine":
                # Format medicine summary in a more readable way
                summary_lines = [
                    f"Great! I've collected all the information for your {creation_type}:",
                    f"• Name: {collected_data.get('medicineName', 'Not specified')}",
                    f"• Dosage: {collected_data.get('dosage', 'Not specified')}",
                    f"• Purpose: {collected_data.get('description', 'Not specified')}",
                    f"• Created by: {collected_data.get('manufacturer', 'Not specified')}",
                    f"• Price: ${collected_data.get('price', 'Not specified').replace('$', '')}",
                    f"• Quantity: {collected_data.get('quantity', 'Not specified')}"
                ]
            elif creation_type == "supplement":
                summary_lines = [f"Here's the {creation_type} information I've collected:"]
                for field, value in collected_data.items():
                    summary_lines.append(f"• {field}: {value}")
                summary_lines.append("\nWould you like me to create this item? Reply 'yes' to confirm or 'no' to cancel.")
            elif creation_type == "vaccine":
                summary_lines = [f"Here's the {creation_type} information I've collected:"]
                for field, value in collected_data.items():
                    summary_lines.append(f"• {field}: {value}")
                summary_lines.append("\nWould you like me to create this item? Reply 'yes' to confirm or 'no' to cancel.")
            elif creation_type == "medicine_schedule":
                summary_lines = [f"Here's the {creation_type} information I've collected:"]
                for field, value in collected_data.items():
                    summary_lines.append(f"• {field}: {value}")
                summary_lines.append("\nWould you like me to create this schedule? Reply 'yes' to confirm or 'no' to cancel.")
            elif creation_type == "supplement_schedule":
                summary_lines = [f"Here's the {creation_type} information I've collected:"]
                for field, value in collected_data.items():
                    summary_lines.append(f"• {field}: {value}")
                summary_lines.append("\nWould you like me to create this schedule? Reply 'yes' to confirm or 'no' to cancel.")
            elif creation_type == "vaccine_schedule":
                summary_lines = [f"Here's the {creation_type} information I've collected:"]
                for field, value in collected_data.items():
                    summary_lines.append(f"• {field}: {value}")
                summary_lines.append("\nWould you like me to create this schedule? Reply 'yes' to confirm or 'no' to cancel.")
            
            return {
                "response": "\n".join(summary_lines),
                "metadata": {
                    "action": "awaiting_confirmation",
                    "creation_type": creation_type,
                    "collected_data": collected_data
                },
                "disclaimer": self.medical_disclaimer
            }
        except Exception as e:
            logger.error("Error showing creation summary: %s", str(e))
            return {
                "response": f"Error showing summary: {str(e)}",
                "metadata": {"error": str(e)},
                "disclaimer": self.medical_disclaimer
            }

    async def _create_item(self, state: Dict[str, Any], anon_token: str, user_jwt: str) -> Dict[str, Any]:
        """Create the item in the database"""
        try:
            creation_type = state["creation_type"]
            collected_data = state["collected_data"]
            
            logger.info("Creating %s with data: %s", creation_type, collected_data)
            
            if creation_type == "medicine":
                # Create a more descriptive description if not provided
                medicine_name = collected_data.get("medicineName", "Unknown")
                dosage = collected_data.get("dosage", "Unknown")
                description = collected_data.get("description", "General use")
                manufacturer = collected_data.get("manufacturer", "Unknown")
                price = collected_data.get("price", "0")
                quantity = collected_data.get("quantity", "0")
                
                # Generate enhanced description if basic description was provided
                if description and description.lower() in ["general use", "no description provided"]:
                    enhanced_description = f"{medicine_name} {dosage} is an effective tablet used for {description.lower()}"
                else:
                    enhanced_description = f"{medicine_name} {dosage} is an effective tablet used for {description.lower()}"
                
                medicine_data = {
                    "name": medicine_name,
                    "generic_name": medicine_name,
                    "description": enhanced_description,
                    "active_ingredients": [medicine_name],
                    "dosage_forms": [dosage],
                    "indications": [description],
                    "contraindications": ["Consult healthcare provider"],
                    "side_effects": ["Consult healthcare provider"],
                    "interactions": ["Consult healthcare provider"],
                    "price": price,
                    "quantity": quantity,
                    "brand_name": collected_data.get("brandName", "Generic"),
                    "manufacturer": manufacturer,
                    "expiration_date": collected_data.get("expDate", "Unknown"),
                    "created_by": anon_token,
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc)
                }
                
                # Try to insert into database if available
                if self.database:
                    medicine_id = await self.database.insert_medicine(medicine_data)
                    medicine_id_str = str(medicine_id)
                else:
                    medicine_id_str = "test_mode"
                
                # Create the exact confirmation message format requested by the user
                confirmation_lines = [
                    "Great! Your medicine has been created:",
                    f"- Name: {medicine_name}",
                    f"- Dosage: {dosage}",
                    f"- Purpose: {description}",
                    f"- Created by: {manufacturer}",
                    f"- Price: ${price.replace('$', '') if isinstance(price, str) else price}",
                    f"- Description: {enhanced_description}",
                    f"- Quantity: {quantity}"
                ]
                
                confirmation_lines.append("\nWould you like me to save this medicine or update any detail?")
                
                response = "\n".join(confirmation_lines)
                
                return {
                    "response": response,
                    "metadata": {
                        "action": "item_created",
                        "creation_type": creation_type,
                        "medicine_id": medicine_id_str,
                        "collected_data": collected_data
                    },
                    "disclaimer": self.medical_disclaimer
                }
            elif creation_type == "supplement":
                # Handle supplement creation
                supplement_name = collected_data.get("supplementName", "Unknown")
                dosage = collected_data.get("dosage", "Unknown")
                description = collected_data.get("description", "General use")
                manufacturer = collected_data.get("manufacturer", "Unknown")
                price = collected_data.get("price", "0")
                quantity = collected_data.get("quantity", "0")
                brand_name = collected_data.get("brandName", "Generic")
                exp_date = collected_data.get("expDate", "Unknown")
                
                # Generate enhanced description if basic description was provided
                if description and description.lower() in ["general use", "no description provided"]:
                    enhanced_description = f"{supplement_name} {dosage} is an effective supplement used for {description.lower()}"
                else:
                    enhanced_description = f"{supplement_name} {dosage} is an effective supplement used for {description.lower()}"
                
                supplement_data = {
                    "name": supplement_name,
                    "generic_name": supplement_name,
                    "description": enhanced_description,
                    "active_ingredients": [supplement_name],
                    "dosage_forms": [dosage],
                    "indications": [description],
                    "contraindications": ["Consult healthcare provider"],
                    "side_effects": ["Consult healthcare provider"],
                    "interactions": ["Consult healthcare provider"],
                    "price": price,
                    "quantity": quantity,
                    "brand_name": brand_name,
                    "manufacturer": manufacturer,
                    "expiration_date": exp_date,
                    "created_by": anon_token,
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc)
                }
                
                # Try to insert into database if available
                if self.database:
                    supplement_id = await self.database.insert_supplement(supplement_data)
                    supplement_id_str = str(supplement_id)
                else:
                    supplement_id_str = "test_mode"
                
                # Create the exact confirmation message format for supplements
                confirmation_lines = [
                    "Great! Your supplement has been created:",
                    f"- Name: {supplement_name}",
                    f"- Dosage: {dosage}",
                    f"- Purpose: {description}",
                    f"- Created by: {manufacturer}",
                    f"- Price: ${price.replace('$', '') if isinstance(price, str) else price}",
                    f"- Description: {enhanced_description}",
                    f"- Quantity: {quantity}",
                    f"- Brand: {brand_name}",
                    f"- Expiration: {exp_date}"
                ]
                
                confirmation_lines.append("\nWould you like me to save this supplement or update any detail?")
                
                response = "\n".join(confirmation_lines)
                
                return {
                    "response": response,
                    "metadata": {
                        "action": "item_created",
                        "creation_type": creation_type,
                        "supplement_id": supplement_id_str,
                        "collected_data": collected_data
                    },
                    "disclaimer": self.medical_disclaimer
                }
            elif creation_type == "vaccine":
                # Handle vaccine creation
                vaccine_name = collected_data.get("vaccineName", "Unknown")
                dosage = collected_data.get("dosage", "Unknown")
                description = collected_data.get("description", "General use")
                manufacturer = collected_data.get("manufacturer", "Unknown")
                price = collected_data.get("price", "0")
                quantity = collected_data.get("quantity", "0")
                brand_name = collected_data.get("brandName", "Generic")
                exp_date = collected_data.get("expDate", "Unknown")
                age_group = collected_data.get("ageGroup", "Unknown")

                # Generate enhanced description if basic description was provided
                if description and description.lower() in ["general use", "no description provided"]:
                    enhanced_description = f"{vaccine_name} {dosage} is an effective vaccine used for {description.lower()}"
                else:
                    enhanced_description = f"{vaccine_name} {dosage} is an effective vaccine used for {description.lower()}"
                
                vaccine_data = {
                    "name": vaccine_name,
                    "generic_name": vaccine_name,
                    "description": enhanced_description,
                    "active_ingredients": [vaccine_name],
                    "dosage_forms": [dosage],
                    "indications": [description],
                    "contraindications": ["Consult healthcare provider"],
                    "side_effects": ["Consult healthcare provider"],
                    "interactions": ["Consult healthcare provider"],
                    "price": price,
                    "quantity": quantity,
                    "brand_name": brand_name,
                    "manufacturer": manufacturer,
                    "expiration_date": exp_date,
                    "age_group": age_group,
                    "created_by": anon_token,
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc)
                }
                
                # Try to insert into database if available
                if self.database:
                    vaccine_id = await self.database.insert_vaccine(vaccine_data)
                    vaccine_id_str = str(vaccine_id)
                else:
                    vaccine_id_str = "test_mode"
                
                # Create the exact confirmation message format for vaccines
                confirmation_lines = [
                    "Great! Your vaccine has been created:",
                    f"- Name: {vaccine_name}",
                    f"- Dosage: {dosage}",
                    f"- Purpose: {description}",
                    f"- Created by: {manufacturer}",
                    f"- Price: ${price.replace('$', '') if isinstance(price, str) else price}",
                    f"- Description: {enhanced_description}",
                    f"- Quantity: {quantity}",
                    f"- Brand: {brand_name}",
                    f"- Expiration: {exp_date}",
                    f"- Age Group: {age_group}"
                ]
                
                confirmation_lines.append("\nWould you like me to save this vaccine or update any detail?")
                
                response = "\n".join(confirmation_lines)
                
                return {
                    "response": response,
                    "metadata": {
                        "action": "item_created",
                        "creation_type": creation_type,
                        "vaccine_id": vaccine_id_str,
                        "collected_data": collected_data
                    },
                    "disclaimer": self.medical_disclaimer
                }
            elif creation_type == "medicine_schedule":
                # Handle medicine schedule creation
                medicine_name = collected_data.get("medicineName", "Unknown")
                dosage = collected_data.get("dosage", "Unknown")
                frequency = collected_data.get("frequency", "Daily")
                time_of_day = collected_data.get("timeOfDay", "Morning")
                start_date = collected_data.get("startDate", "Today")
                end_date = collected_data.get("endDate", "Ongoing")
                instructions = collected_data.get("instructions", "Take as prescribed")
                
                schedule_data = {
                    "medicine_name": medicine_name,
                    "dosage": dosage,
                    "frequency": frequency,
                    "time_of_day": time_of_day,
                    "start_date": start_date,
                    "end_date": end_date,
                    "instructions": instructions,
                    "created_by": anon_token,
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc)
                }
                
                # Try to insert into database if available
                if self.database:
                    schedule_id = await self.database.insert_medicine_schedule(schedule_data)
                    schedule_id_str = str(schedule_id)
                else:
                    schedule_id_str = "test_mode"
                
                confirmation_lines = [
                    "Great! Your medicine schedule has been created:",
                    f"- Medicine: {medicine_name}",
                    f"- Dosage: {dosage}",
                    f"- Frequency: {frequency}",
                    f"- Time: {time_of_day}",
                    f"- Start Date: {start_date}",
                    f"- End Date: {end_date}",
                    f"- Instructions: {instructions}"
                ]
                
                confirmation_lines.append("\nWould you like me to save this schedule or update any detail?")
                
                response = "\n".join(confirmation_lines)
                
                return {
                    "response": response,
                    "metadata": {
                        "action": "item_created",
                        "creation_type": creation_type,
                        "schedule_id": schedule_id_str,
                        "collected_data": collected_data
                    },
                    "disclaimer": self.medical_disclaimer
                }
            elif creation_type == "supplement_schedule":
                # Handle supplement schedule creation
                supplement_name = collected_data.get("supplementName", "Unknown")
                dosage = collected_data.get("dosage", "Unknown")
                frequency = collected_data.get("frequency", "Daily")
                time_of_day = collected_data.get("timeOfDay", "Morning")
                start_date = collected_data.get("startDate", "Today")
                end_date = collected_data.get("endDate", "Ongoing")
                instructions = collected_data.get("instructions", "Take as prescribed")
                
                schedule_data = {
                    "supplement_name": supplement_name,
                    "dosage": dosage,
                    "frequency": frequency,
                    "time_of_day": time_of_day,
                    "start_date": start_date,
                    "end_date": end_date,
                    "instructions": instructions,
                    "created_by": anon_token,
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc)
                }
                
                # Try to insert into database if available
                if self.database:
                    schedule_id = await self.database.insert_medicine_schedule(schedule_data)  # Reuse medicine schedule table
                    schedule_id_str = str(schedule_id)
                else:
                    schedule_id_str = "test_mode"
                
                confirmation_lines = [
                    "Great! Your supplement schedule has been created:",
                    f"- Supplement: {supplement_name}",
                    f"- Dosage: {dosage}",
                    f"- Frequency: {frequency}",
                    f"- Time: {time_of_day}",
                    f"- Start Date: {start_date}",
                    f"- End Date: {end_date}",
                    f"- Instructions: {instructions}"
                ]
                
                confirmation_lines.append("\nWould you like me to save this schedule or update any detail?")
                
                response = "\n".join(confirmation_lines)
                
                return {
                    "response": response,
                    "metadata": {
                        "action": "item_created",
                        "creation_type": creation_type,
                        "schedule_id": schedule_id_str,
                        "collected_data": collected_data
                    },
                    "disclaimer": self.medical_disclaimer
                }
            elif creation_type == "vaccine_schedule":
                # Handle vaccine schedule creation
                vaccine_name = collected_data.get("vaccineName", "Unknown")
                dosage = collected_data.get("dosage", "Unknown")
                frequency = collected_data.get("frequency", "Once")
                time_of_day = collected_data.get("timeOfDay", "Morning")
                start_date = collected_data.get("startDate", "Today")
                end_date = collected_data.get("endDate", "Ongoing")
                instructions = collected_data.get("instructions", "Administer as prescribed")
                
                schedule_data = {
                    "vaccine_name": vaccine_name,
                    "dosage": dosage,
                    "frequency": frequency,
                    "time_of_day": time_of_day,
                    "start_date": start_date,
                    "end_date": end_date,
                    "instructions": instructions,
                    "created_by": anon_token,
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc)
                }
                
                # Try to insert into database if available
                if self.database:
                    schedule_id = await self.database.insert_medicine_schedule(schedule_data)  # Reuse medicine schedule table
                    schedule_id_str = str(schedule_id)
                else:
                    schedule_id_str = "test_mode"
                
                confirmation_lines = [
                    "Great! Your vaccine schedule has been created:",
                    f"- Vaccine: {vaccine_name}",
                    f"- Dosage: {dosage}",
                    f"- Frequency: {frequency}",
                    f"- Time: {time_of_day}",
                    f"- Start Date: {start_date}",
                    f"- End Date: {end_date}",
                    f"- Instructions: {instructions}"
                ]
                
                confirmation_lines.append("\nWould you like me to save this schedule or update any detail?")
                
                response = "\n".join(confirmation_lines)
                
                return {
                    "response": response,
                    "metadata": {
                        "action": "item_created",
                        "creation_type": creation_type,
                        "schedule_id": schedule_id_str,
                        "collected_data": collected_data
                    },
                    "disclaimer": self.medical_disclaimer
                }
                
        except Exception as e:
            logger.error("v Error creating item: %s", str(e))
            return {
                "response": f"I encountered an error while creating the item: {str(e)}",
                "metadata": {"error": str(e)},
                "disclaimer": self.medical_disclaimer
            }

# Global AI service instance - will be initialized with database later
ai_service = None
