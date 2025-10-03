import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from database import db
from models import (
    UserMedicalProfile, UserMedicineUsage, UserSupplementUsage, UserVaccineHistory,
    CreateMedicalProfileRequest, UpdateMedicalProfileRequest, AddMedicineRequest,
    AddSupplementRequest, AddVaccineRequest, PersonalizedAdviceRequest
)
from ai_service import AIService

# Configure logging with lazy % formatting
logger = logging.getLogger(__name__)

class UserMedicalService:
    def __init__(self):
        self.ai_service = AIService()
        
    async def create_medical_profile(self, request: CreateMedicalProfileRequest) -> Dict[str, Any]:
        """Create a new user medical profile"""
        try:
            profile_data = request.dict()
            profile_data["created_at"] = datetime.now(timezone.utc)
            profile_data["updated_at"] = datetime.now(timezone.utc)
            
            profile_id = await db.create_user_medical_profile(profile_data)
            
            logger.info("Medical profile created successfully for user: %s", request.user_id)
            return {
                "success": True,
                "profile_id": profile_id,
                "message": "Medical profile created successfully"
            }
        except Exception as e:
            logger.error("Failed to create medical profile: %s", str(e))
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to create medical profile"
            }
    
    async def update_medical_profile(self, user_id: str, request: UpdateMedicalProfileRequest, anon_token: Optional[str] = None) -> Dict[str, Any]:
        """Update user medical profile"""
        try:
            update_data = {k: v for k, v in request.dict().items() if v is not None}
            
            if not update_data:
                return {
                    "success": False,
                    "message": "No valid fields to update"
                }
            
            success = await db.update_user_medical_profile(user_id, update_data, anon_token)
            
            if success:
                logger.info("Medical profile updated successfully for user: %s", user_id)
                return {
                    "success": True,
                    "message": "Medical profile updated successfully"
                }
            else:
                return {
                    "success": False,
                    "message": "Profile not found or no changes made"
                }
        except Exception as e:
            logger.error("Failed to update medical profile: %s", str(e))
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to update medical profile"
            }
    
    async def add_medicine_usage(self, request: AddMedicineRequest) -> Dict[str, Any]:
        """Add medicine usage for a user"""
        try:
            # Get medicine details from database
            medicine = await db.get_medicine(request.medicine_id)
            if not medicine:
                return {
                    "success": False,
                    "message": "Medicine not found"
                }
            
            usage_data = request.dict()
            usage_data["medicine_name"] = medicine.get("name", "")
            usage_data["generic_name"] = medicine.get("generic_name", "")
            usage_data["created_at"] = datetime.now(timezone.utc)
            usage_data["updated_at"] = datetime.now(timezone.utc)
            
            usage_id = await db.add_user_medicine_usage(usage_data)
            
            logger.info("Medicine usage added successfully for user: %s", request.user_id)
            return {
                "success": True,
                "usage_id": usage_id,
                "message": "Medicine usage added successfully"
            }
        except Exception as e:
            logger.error("Failed to add medicine usage: %s", str(e))
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to add medicine usage"
            }
    
    async def add_supplement_usage(self, request: AddSupplementRequest) -> Dict[str, Any]:
        """Add supplement usage for a user"""
        try:
            # Get supplement details from database
            supplement = await db.get_supplement(request.supplement_id)
            if not supplement:
                return {
                    "success": False,
                    "message": "Supplement not found"
                }
            
            usage_data = request.dict()
            usage_data["supplement_name"] = supplement.get("name", "")
            usage_data["created_at"] = datetime.now(timezone.utc)
            usage_data["updated_at"] = datetime.now(timezone.utc)
            
            usage_id = await db.add_user_supplement_usage(usage_data)
            
            logger.info("Supplement usage added successfully for user: %s", request.user_id)
            return {
                "success": True,
                "usage_id": usage_id,
                "message": "Supplement usage added successfully"
            }
        except Exception as e:
            logger.error("Failed to add supplement usage: %s", str(e))
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to add supplement usage"
            }
    
    async def add_vaccine_history(self, request: AddVaccineRequest) -> Dict[str, Any]:
        """Add vaccine history for a user"""
        try:
            # Get vaccine details from database
            vaccine = await db.get_vaccine(request.vaccine_id)
            if not vaccine:
                return {
                    "success": False,
                    "message": "Vaccine not found"
                }
            
            vaccine_data = request.dict()
            vaccine_data["vaccine_name"] = vaccine.get("name", "")
            vaccine_data["created_at"] = datetime.now(timezone.utc)
            vaccine_data["updated_at"] = datetime.now(timezone.utc)
            
            history_id = await db.add_user_vaccine_history(vaccine_data)
            
            logger.info("Vaccine history added successfully for user: %s", request.user_id)
            return {
                "success": True,
                "history_id": history_id,
                "message": "Vaccine history added successfully"
            }
        except Exception as e:
            logger.error("Failed to add vaccine history: %s", str(e))
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to add vaccine history"
            }
    
    async def get_user_health_summary(self, user_id: str, anon_token: Optional[str] = None) -> Dict[str, Any]:
        """Get comprehensive health summary for a user"""
        try:
            health_data = await db.get_user_comprehensive_health_data(user_id, anon_token)
            
            if not health_data["profile"]:
                return {
                    "success": False,
                    "message": "No medical profile found for this user"
                }
            
            # Check for potential interactions
            medicine_ids = [med.get("medicine_id") for med in health_data["current_medicines"]]
            supplement_ids = [supp.get("supplement_id") for supp in health_data["current_supplements"]]
            interactions = await db.check_drug_interactions(medicine_ids, supplement_ids)
            
            summary = {
                "profile": health_data["profile"],
                "current_medicines_count": len(health_data["current_medicines"]),
                "current_supplements_count": len(health_data["current_supplements"]),
                "vaccines_completed": len(health_data["vaccine_history"]),
                "potential_interactions": interactions,
                "last_updated": health_data["profile"].get("updated_at")
            }
            
            return {
                "success": True,
                "data": summary
            }
        except Exception as e:
            logger.error("Failed to get health summary: %s", str(e))
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to get health summary"
            }
    
    async def get_personalized_advice(self, request: PersonalizedAdviceRequest) -> Dict[str, Any]:
        """Get personalized health advice based on user's medical profile"""
        try:
            # Get user's health data
            health_data = await db.get_user_comprehensive_health_data(request.user_id, request.anon_token)
            
            if not health_data["profile"]:
                return {
                    "success": False,
                    "message": "No medical profile found. Please create a profile first."
                }
            
            # Prepare context for AI
            context = self._prepare_ai_context(health_data, request.query)
            
            # Get AI response
            ai_response = await self.ai_service.get_personalized_health_advice(
                query=request.query,
                user_context=context
            )
            
            if ai_response.get("success"):
                return {
                    "success": True,
                    "data": {
                        "advice": ai_response["response"],
                        "considerations": ai_response.get("considerations", []),
                        "interactions": ai_response.get("interactions", []),
                        "recommendations": ai_response.get("recommendations", []),
                        "warnings": ai_response.get("warnings", []),
                        "disclaimer": "This advice is for informational purposes only. Always consult with a healthcare professional."
                    }
                }
            else:
                return {
                    "success": False,
                    "message": "Failed to generate personalized advice",
                    "error": ai_response.get("error", "Unknown error")
                }
                
        except Exception as e:
            logger.error("Failed to get personalized advice: %s", str(e))
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to get personalized advice"
            }
    
    def _prepare_ai_context(self, health_data: Dict[str, Any], query: str) -> str:
        """Prepare context string for AI service"""
        profile = health_data.get("profile", {})
        medicines = health_data.get("current_medicines", [])
        supplements = health_data.get("current_supplements", [])
        vaccines = health_data.get("vaccine_history", [])
        
        context_parts = []
        
        # Basic profile info
        if profile.get("age"):
            context_parts.append(f"Age: {profile['age']}")
        if profile.get("gender"):
            context_parts.append(f"Gender: {profile['gender']}")
        if profile.get("medical_conditions"):
            context_parts.append(f"Medical conditions: {', '.join(profile['medical_conditions'])}")
        if profile.get("allergies"):
            context_parts.append(f"Allergies: {', '.join(profile['allergies'])}")
        
        # Current medications
        if medicines:
            med_names = [med.get("medicine_name", "") for med in medicines]
            context_parts.append(f"Currently taking medications: {', '.join(med_names)}")
        
        # Current supplements
        if supplements:
            supp_names = [supp.get("supplement_name", "") for supp in supplements]
            context_parts.append(f"Currently taking supplements: {', '.join(supp_names)}")
        
        # Vaccination history
        if vaccines:
            vaccine_names = [vacc.get("vaccine_name", "") for vacc in vaccines]
            context_parts.append(f"Vaccination history: {', '.join(vaccine_names)}")
        
        context = f"User Profile: {'; '.join(context_parts)}. Query: {query}"
        return context

