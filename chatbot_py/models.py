from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from enum import Enum

class ModelType(str, Enum):
    # Current OpenAI Models (as of 2024)
    GPT_4 = "gpt-4"
    GPT_4_TURBO = "gpt-4-turbo-preview"
    GPT_4_32K = "gpt-4-32k"
    GPT_3_5_TURBO = "gpt-3.5-turbo"
    GPT_3_5_TURBO_16K = "gpt-3.5-turbo-16k"
    
    # Legacy models (if still available)
    GPT_3_5_TURBO_0613 = "gpt-3.5-turbo-0613"
    GPT_3_5_TURBO_0301 = "gpt-3.5-turbo-0301"

class QueryType(str, Enum):
    GENERAL = "general"
    SUPPLEMENT_SPECIFIC = "supplement_specific"
    MEDICINE_SPECIFIC = "medicine_specific"
    VACCINE_SPECIFIC = "vaccine_specific"
    OFF_TOPIC = "off_topic"

class BotQueryRequest(BaseModel):
    query: str = Field(..., description="User's question or query")
    supplement_id: Optional[str] = Field(None, description="Optional supplement ID for context")
    medicine_id: Optional[str] = Field(None, description="Optional medicine ID for context")
    vaccine_id: Optional[str] = Field(None, description="Optional vaccine ID for context")
    anon_token: Optional[str] = Field(None, description="Anonymous session token")
    user_token: Optional[str] = Field(None, description="User authentication token")
    
class BotQueryResponse(BaseModel):
    model_config = {"protected_namespaces": ()}
    
    response: str = Field(..., description="AI-generated response")
    metadata: Dict[str, Any] = Field(..., description="Response metadata")
    disclaimer: str = Field(..., description="Medical disclaimer")
    supplement_context: Optional[Dict[str, Any]] = Field(None, description="Supplement context if provided")
    medicine_context: Optional[Dict[str, Any]] = Field(None, description="Medicine context if provided")
    vaccine_context: Optional[Dict[str, Any]] = Field(None, description="Vaccine context if provided")

# Supplement Models
class Supplement(BaseModel):
    id: Optional[str] = Field(None, description="Supplement ID")
    name: str = Field(..., description="Supplement name")
    description: str = Field(..., description="Supplement description")
    ingredients: List[str] = Field(..., description="List of ingredients")
    benefits: List[str] = Field(..., description="Potential benefits")
    risks: List[str] = Field(..., description="Potential risks and considerations")
    usage: str = Field(..., description="Usage instructions")
    dosage: str = Field(..., description="Recommended dosage")
    category: str = Field(..., description="Supplement category")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Medicine Models
class Medicine(BaseModel):
    id: Optional[str] = Field(None, description="Medicine ID")
    name: str = Field(..., description="Medicine name")
    generic_name: str = Field(..., description="Generic name")
    description: str = Field(..., description="Medicine description")
    active_ingredients: List[str] = Field(..., description="Active ingredients")
    dosage_forms: List[str] = Field(..., description="Available dosage forms")
    indications: List[str] = Field(..., description="Medical indications")
    contraindications: List[str] = Field(..., description="Contraindications")
    side_effects: List[str] = Field(..., description="Potential side effects")
    interactions: List[str] = Field(..., description="Drug interactions")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Vaccine Models
class Vaccine(BaseModel):
    id: Optional[str] = Field(None, description="Vaccine ID")
    name: str = Field(..., description="Vaccine name")
    description: str = Field(..., description="Vaccine description")
    target_disease: str = Field(..., description="Disease the vaccine prevents")
    age_groups: List[str] = Field(..., description="Recommended age groups")
    dosage_schedule: List[str] = Field(..., description="Dosage schedule")
    contraindications: List[str] = Field(..., description="Contraindications")
    side_effects: List[str] = Field(..., description="Potential side effects")
    effectiveness: str = Field(..., description="Effectiveness information")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Scheduling Models
class MedicineSchedule(BaseModel):
    id: Optional[str] = Field(None, description="Schedule ID")
    medicine_id: str = Field(..., description="Medicine ID")
    medicine_name: str = Field(..., description="Medicine name")
    dosage: str = Field(..., description="Dosage amount")
    frequency: str = Field(..., description="How often to take")
    time_of_day: List[str] = Field(..., description="Times of day to take")
    start_date: datetime = Field(..., description="When to start taking")
    end_date: Optional[datetime] = Field(None, description="When to stop taking")
    instructions: str = Field(..., description="Special instructions")
    anon_token: Optional[str] = Field(None, description="Anonymous token")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Factsheet(BaseModel):
    id: Optional[str] = Field(None, description="Factsheet ID")
    title: str = Field(..., description="Factsheet title")
    content: str = Field(..., description="Factsheet content")
    summary: str = Field(..., description="Brief summary")
    keywords: List[str] = Field(..., description="Search keywords")
    category: str = Field(..., description="Health category (supplement, medicine, vaccine, general)")
    source: str = Field(..., description="Information source")
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class VaccineSchedule(BaseModel):
    id: Optional[str] = Field(None, description="Schedule ID")
    vaccine_id: str = Field(..., description="Vaccine ID")
    vaccine_name: str = Field(..., description="Vaccine name")
    dose_number: int = Field(..., description="Which dose in the series")
    recommended_age: str = Field(..., description="Recommended age for this dose")
    due_date: datetime = Field(..., description="When this dose is due")
    completed_date: Optional[datetime] = Field(None, description="When completed")
    location: Optional[str] = Field(None, description="Where to get vaccinated")
    notes: Optional[str] = Field(None, description="Additional notes")
    anon_token: Optional[str] = Field(None, description="Anonymous token")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AIQueryLog(BaseModel):
    model_config = {"protected_namespaces": ()}
    
    id: Optional[str] = Field(None, description="Log entry ID")
    query: str = Field(..., description="User query")
    response: str = Field(..., description="AI response")
    model_used: ModelType = Field(..., description="OpenAI model used")
    tokens_used: Optional[int] = Field(None, description="Tokens consumed")
    supplement_id: Optional[str] = Field(None, description="Supplement ID if applicable")
    medicine_id: Optional[str] = Field(None, description="Medicine ID if applicable")
    vaccine_id: Optional[str] = Field(None, description="Vaccine ID if applicable")
    anon_token: Optional[str] = Field(None, description="Anonymous token")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    success: bool = Field(..., description="Whether the query was successful")
    error_message: Optional[str] = Field(None, description="Error message if failed")

class SupplementViewLog(BaseModel):
    id: Optional[str] = Field(None, description="Log entry ID")
    supplement_id: str = Field(..., description="Supplement ID")
    anon_token: Optional[str] = Field(None, description="Anonymous token")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_agent: Optional[str] = Field(None, description="User agent string")
    ip_address: Optional[str] = Field(None, description="IP address")

class SupplementRecommendationRequest(BaseModel):
    tags: List[str] = Field(..., description="Health tags for recommendation")
    properties: Dict[str, Any] = Field(..., description="Additional properties")
    anon_token: Optional[str] = Field(None, description="Anonymous token")

class SupplementRecommendationResponse(BaseModel):
    recommendations: List[Dict[str, Any]] = Field(..., description="List of recommended supplements")
    reasoning: str = Field(..., description="Explanation for recommendations")

class AdminLogFilter(BaseModel):
    start_date: Optional[datetime] = Field(None, description="Start date for filtering")
    end_date: Optional[datetime] = Field(None, description="End date for filtering")
    model: Optional[ModelType] = Field(None, description="Filter by model used")
    supplement_id: Optional[str] = Field(None, description="Filter by supplement ID")
    medicine_id: Optional[str] = Field(None, description="Filter by medicine ID")
    vaccine_id: Optional[str] = Field(None, description="Filter by vaccine ID")
    anon_token: Optional[str] = Field(None, description="Filter by anonymous token")
    success: Optional[bool] = Field(None, description="Filter by success status")

class RateLimitInfo(BaseModel):
    remaining_requests: int = Field(..., description="Remaining requests allowed")
    reset_time: datetime = Field(..., description="When the rate limit resets")
    limit: int = Field(..., description="Total requests allowed in window")

# User Medical Information Models
class UserMedicalProfile(BaseModel):
    id: Optional[str] = Field(None, description="Profile ID")
    user_id: str = Field(..., description="User ID from Node.js app")
    anon_token: Optional[str] = Field(None, description="Anonymous token for non-authenticated users")
    
    # Personal Information
    age: Optional[int] = Field(None, description="User age")
    gender: Optional[str] = Field(None, description="User gender")
    weight: Optional[float] = Field(None, description="Weight in kg")
    height: Optional[float] = Field(None, description="Height in cm")
    medical_conditions: List[str] = Field(default=[], description="List of medical conditions")
    allergies: List[str] = Field(default=[], description="List of allergies")
    
    # Current Medications
    current_medicines: List[str] = Field(default=[], description="List of current medicine IDs")
    
    # Current Supplements
    current_supplements: List[str] = Field(default=[], description="List of current supplement IDs")
    
    # Vaccination History
    vaccination_history: List[str] = Field(default=[], description="List of completed vaccine IDs")
    
    # Lifestyle Information
    diet_preferences: List[str] = Field(default=[], description="Dietary preferences/restrictions")
    activity_level: Optional[str] = Field(None, description="Activity level")
    sleep_pattern: Optional[str] = Field(None, description="Sleep pattern")
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserMedicineUsage(BaseModel):
    id: Optional[str] = Field(None, description="Usage ID")
    user_id: str = Field(..., description="User ID from Node.js app")
    anon_token: Optional[str] = Field(None, description="Anonymous token")
    
    # Medicine Information
    medicine_id: str = Field(..., description="Medicine ID")
    medicine_name: str = Field(..., description="Medicine name")
    generic_name: str = Field(..., description="Generic name")
    
    # Usage Details
    dosage: str = Field(..., description="Dosage amount")
    frequency: str = Field(..., description="How often to take")
    time_of_day: List[str] = Field(default=[], description="Times of day to take")
    start_date: datetime = Field(..., description="When started taking")
    end_date: Optional[datetime] = Field(None, description="When stopped taking")
    
    # Status
    is_active: bool = Field(default=True, description="Whether currently taking")
    adherence_rate: Optional[float] = Field(None, description="Adherence percentage")
    
    # Instructions
    instructions: str = Field(..., description="Special instructions")
    notes: Optional[str] = Field(None, description="Additional notes")
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserSupplementUsage(BaseModel):
    id: Optional[str] = Field(None, description="Usage ID")
    user_id: str = Field(..., description="User ID from Node.js app")
    anon_token: Optional[str] = Field(None, description="Anonymous token")
    
    # Supplement Information
    supplement_id: str = Field(..., description="Supplement ID")
    supplement_name: str = Field(..., description="Supplement name")
    
    # Usage Details
    dosage: str = Field(..., description="Dosage amount")
    frequency: str = Field(..., description="How often to take")
    time_of_day: List[str] = Field(default=[], description="Times of day to take")
    start_date: datetime = Field(..., description="When started taking")
    end_date: Optional[datetime] = Field(None, description="When stopped taking")
    
    # Status
    is_active: bool = Field(default=True, description="Whether currently taking")
    adherence_rate: Optional[float] = Field(None, description="Adherence percentage")
    
    # Instructions
    instructions: str = Field(..., description="Special instructions")
    notes: Optional[str] = Field(None, description="Additional notes")
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserVaccineHistory(BaseModel):
    id: Optional[str] = Field(None, description="History ID")
    user_id: str = Field(..., description="User ID from Node.js app")
    anon_token: Optional[str] = Field(None, description="Anonymous token")
    
    # Vaccine Information
    vaccine_id: str = Field(..., description="Vaccine ID")
    vaccine_name: str = Field(..., description="Vaccine name")
    
    # Vaccination Details
    dose_number: int = Field(..., description="Which dose in the series")
    vaccination_date: datetime = Field(..., description="When vaccinated")
    next_due_date: Optional[datetime] = Field(None, description="When next dose is due")
    
    # Status
    is_completed: bool = Field(default=True, description="Whether vaccination completed")
    location: Optional[str] = Field(None, description="Where vaccinated")
    
    # Notes
    notes: Optional[str] = Field(None, description="Additional notes")
    side_effects: Optional[str] = Field(None, description="Any side effects experienced")
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Request/Response Models for Medical Profile
class CreateMedicalProfileRequest(BaseModel):
    user_id: str = Field(..., description="User ID from Node.js app")
    anon_token: Optional[str] = Field(None, description="Anonymous token")
    age: Optional[int] = Field(None, description="User age")
    gender: Optional[str] = Field(None, description="User gender")
    weight: Optional[float] = Field(None, description="Weight in kg")
    height: Optional[float] = Field(None, description="Height in cm")
    medical_conditions: List[str] = Field(default=[], description="List of medical conditions")
    allergies: List[str] = Field(default=[], description="List of allergies")
    diet_preferences: List[str] = Field(default=[], description="Dietary preferences/restrictions")
    activity_level: Optional[str] = Field(None, description="Activity level")
    sleep_pattern: Optional[str] = Field(None, description="Sleep pattern")

class UpdateMedicalProfileRequest(BaseModel):
    age: Optional[int] = Field(None, description="User age")
    gender: Optional[str] = Field(None, description="User gender")
    weight: Optional[float] = Field(None, description="Weight in kg")
    height: Optional[float] = Field(None, description="Height in cm")
    medical_conditions: Optional[List[str]] = Field(None, description="List of medical conditions")
    allergies: Optional[List[str]] = Field(None, description="List of allergies")
    diet_preferences: Optional[List[str]] = Field(None, description="Dietary preferences/restrictions")
    activity_level: Optional[str] = Field(None, description="Activity level")
    sleep_pattern: Optional[str] = Field(None, description="Sleep pattern")

class AddMedicineRequest(BaseModel):
    user_id: str = Field(..., description="User ID from Node.js app")
    anon_token: Optional[str] = Field(None, description="Anonymous token")
    medicine_id: str = Field(..., description="Medicine ID")
    dosage: str = Field(..., description="Dosage amount")
    frequency: str = Field(..., description="How often to take")
    time_of_day: List[str] = Field(default=[], description="Times of day to take")
    start_date: datetime = Field(..., description="When to start taking")
    end_date: Optional[datetime] = Field(None, description="When to stop taking")
    instructions: str = Field(..., description="Special instructions")
    notes: Optional[str] = Field(None, description="Additional notes")

class AddSupplementRequest(BaseModel):
    user_id: str = Field(..., description="User ID from Node.js app")
    anon_token: Optional[str] = Field(None, description="Anonymous token")
    supplement_id: str = Field(..., description="Supplement ID")
    dosage: str = Field(..., description="Dosage amount")
    frequency: str = Field(..., description="How often to take")
    time_of_day: List[str] = Field(default=[], description="Times of day to take")
    start_date: datetime = Field(..., description="When to start taking")
    end_date: Optional[datetime] = Field(None, description="When to stop taking")
    instructions: str = Field(..., description="Special instructions")
    notes: Optional[str] = Field(None, description="Additional notes")

class AddVaccineRequest(BaseModel):
    user_id: str = Field(..., description="User ID from Node.js app")
    anon_token: Optional[str] = Field(None, description="Anonymous token")
    vaccine_id: str = Field(..., description="Vaccine ID")
    dose_number: int = Field(..., description="Which dose in the series")
    vaccination_date: datetime = Field(..., description="When vaccinated")
    next_due_date: Optional[datetime] = Field(None, description="When next dose is due")
    location: Optional[str] = Field(None, description="Where vaccinated")
    notes: Optional[str] = Field(None, description="Additional notes")
    side_effects: Optional[str] = Field(None, description="Any side effects experienced")

class PersonalizedAdviceRequest(BaseModel):
    user_id: str = Field(..., description="User ID from Node.js app")
    anon_token: Optional[str] = Field(None, description="Anonymous token")
    query: str = Field(..., description="User's health question")
    context: Optional[str] = Field(None, description="Additional context")

class PersonalizedAdviceResponse(BaseModel):
    advice: str = Field(..., description="Personalized health advice")
    considerations: List[str] = Field(..., description="Important considerations based on user profile")
    interactions: List[str] = Field(default=[], description="Potential interactions with current medications/supplements")
    recommendations: List[str] = Field(default=[], description="Specific recommendations")
    warnings: List[str] = Field(default=[], description="Warnings based on user profile")
    disclaimer: str = Field(..., description="Medical disclaimer")
