import motor.motor_asyncio
from pymongo import MongoClient
from typing import Optional, List, Dict, Any
import logging
from config import settings
from datetime import datetime, timezone, timedelta

# Configure logging with lazy % formatting
logger = logging.getLogger(__name__)

class Database:
    def __init__(self):
        self.client: Optional[motor.motor_asyncio.AsyncIOMotorClient] = None
        self.db = None
        
    def _convert_mongo_types_to_json_safe(self, data: Any) -> Any:
        """Convert MongoDB ObjectIds and datetime objects to strings for JSON serialization"""
        if isinstance(data, dict):
            return {k: self._convert_mongo_types_to_json_safe(v) for k, v in data.items()}
        elif isinstance(data, list):
            return [self._convert_mongo_types_to_json_safe(item) for item in data]
        elif hasattr(data, '__class__') and data.__class__.__name__ == 'ObjectId':
            return str(data)
        elif hasattr(data, 'isoformat'):  # Handle datetime objects
            return data.isoformat()
        else:
            return data
        
    async def connect(self):
        """Connect to MongoDB"""
        try:
            self.client = motor.motor_asyncio.AsyncIOMotorClient(settings.mongodb_url)
            self.db = self.client[settings.mongodb_db]
            logger.info("Connected to MongoDB successfully")
        except Exception as e:
            logger.warning("Failed to connect to MongoDB: %s - continuing without database", str(e))
            self.client = None
            self.db = None
            
    async def disconnect(self):
        """Disconnect from MongoDB"""
        if self.client:
            self.client.close()
            logger.info("Disconnected from MongoDB")
            
    async def get_collection(self, collection_name: str):
        """Get a MongoDB collection"""
        if self.db is None:
            raise Exception("Database not connected")
        return self.db[collection_name]
        
    # AI Query Logging
    async def insert_ai_query_log(self, log_data: Dict[str, Any]) -> str:
        """Insert AI query log into MongoDB"""
        try:
            collection = await self.get_collection("ai_query_logs")
            result = await collection.insert_one(log_data)
            logger.info("AI query log inserted with ID: %s", str(result.inserted_id))
            return str(result.inserted_id)
        except Exception as e:
            logger.error("Failed to insert AI query log: %s", str(e))
            raise

    # Conversation State Management
    async def save_conversation_state(self, anon_token: str, state_data: Dict[str, Any]) -> str:
        """Save conversation state to MongoDB"""
        try:
            collection = await self.get_collection("conversation_states")
            # Use upsert to update existing or create new
            result = await collection.update_one(
                {"anon_token": anon_token},
                {
                    "$set": {
                        **state_data,
                        "anon_token": anon_token,
                        "updated_at": datetime.now(timezone.utc),
                        "created_at": datetime.now(timezone.utc)
                    }
                },
                upsert=True
            )
            logger.info("Conversation state saved for token: %s", anon_token)
            return anon_token
        except Exception as e:
            logger.error("Failed to save conversation state: %s", str(e))
            raise

    async def get_conversation_state(self, anon_token: str) -> Optional[Dict[str, Any]]:
        """Get conversation state from MongoDB"""
        try:
            collection = await self.get_collection("conversation_states")
            state = await collection.find_one({"anon_token": anon_token})
            if state:
                # Convert MongoDB types to JSON-safe format
                state = self._convert_mongo_types_to_json_safe(state)
                # Remove MongoDB-specific fields
                state.pop("_id", None)
                state.pop("anon_token", None)
                state.pop("created_at", None)
                state.pop("updated_at", None)
            return state
        except Exception as e:
            logger.error("Failed to get conversation state: %s", str(e))
            raise

    async def delete_conversation_state(self, anon_token: str) -> bool:
        """Delete conversation state from MongoDB"""
        try:
            collection = await self.get_collection("conversation_states")
            result = await collection.delete_one({"anon_token": anon_token})
            logger.info("Conversation state deleted for token: %s", anon_token)
            return result.deleted_count > 0
        except Exception as e:
            logger.error("Failed to delete conversation state: %s", str(e))
            raise

    async def cleanup_expired_conversation_states(self, max_age_hours: int = 24) -> int:
        """Clean up old conversation states"""
        try:
            collection = await self.get_collection("conversation_states")
            cutoff_time = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
            result = await collection.delete_many({"updated_at": {"$lt": cutoff_time}})
            logger.info("Cleaned up %d expired conversation states", result.deleted_count)
            return result.deleted_count
        except Exception as e:
            logger.error("Failed to cleanup expired conversation states: %s", str(e))
            raise
            
    async def insert_supplement_view_log(self, log_data: Dict[str, Any]) -> str:
        """Insert supplement view log into MongoDB"""
        try:
            collection = await self.get_collection("supplement_view_logs")
            result = await collection.insert_one(log_data)
            logger.info("Supplement view log inserted with ID: %s", str(result.inserted_id))
            return str(result.inserted_id)
        except Exception as e:
            logger.error("Failed to insert supplement view log: %s", str(e))
            raise

    # Supplement Operations
    async def insert_supplement(self, supplement_data: Dict[str, Any]) -> str:
        """Insert a new supplement"""
        try:
            collection = await self.get_collection("supplement")
            result = await collection.insert_one(supplement_data)
            logger.info("Supplement inserted with ID: %s", str(result.inserted_id))
            return str(result.inserted_id)
        except Exception as e:
            logger.error("Failed to insert supplement: %s", str(e))
            raise

    async def get_supplement(self, supplement_id: str) -> Optional[Dict[str, Any]]:
        """Get supplement by ID"""
        try:
            collection = await self.get_collection("supplement")
            supplement = await collection.find_one({"_id": supplement_id})
            if supplement:
                # Convert MongoDB types to JSON-safe format
                supplement = self._convert_mongo_types_to_json_safe(supplement)
            return supplement
        except Exception as e:
            logger.error("Failed to get supplement: %s", str(e))
            raise

    async def search_supplements(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Search supplements by name or description"""
        try:
            collection = await self.get_collection("supplement")
            # Use regex search instead of text search to avoid index requirements
            search_query = {
                "$or": [
                    {"name": {"$regex": query, "$options": "i"}},
                    {"description": {"$regex": query, "$options": "i"}}
                ]
            }
            cursor = collection.find(search_query).limit(limit)
            supplements = await cursor.to_list(length=limit)
            # Convert MongoDB types to JSON-safe format
            supplements = self._convert_mongo_types_to_json_safe(supplements)
            logger.info("Found %d supplements matching query: %s", len(supplements), query)
            return supplements
        except Exception as e:
            logger.error("Failed to search supplements: %s", str(e))
            # Return empty list instead of raising to allow fallback to GPT-4
            return []

    # Medicine Operations
    async def insert_medicine(self, medicine_data: Dict[str, Any]) -> str:
        """Insert a new medicine"""
        try:
            collection = await self.get_collection("medicine")
            result = await collection.insert_one(medicine_data)
            logger.info("Medicine inserted with ID: %s", str(result.inserted_id))
            return str(result.inserted_id)
        except Exception as e:
            logger.error("Failed to insert medicine: %s", str(e))
            raise

    async def get_medicine(self, medicine_id: str) -> Optional[Dict[str, Any]]:
        """Get medicine by ID"""
        try:
            collection = await self.get_collection("medicine")
            medicine = await collection.find_one({"_id": medicine_id})
            if medicine:
                # Convert MongoDB types to JSON-safe format
                medicine = self._convert_mongo_types_to_json_safe(medicine)
            return medicine
        except Exception as e:
            logger.error("Failed to get medicine: %s", str(e))
            raise

    async def search_medicines(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Search medicines by name or description"""
        try:
            collection = await self.get_collection("medicine")
            # Use regex search instead of text search to avoid index requirements
            search_query = {
                "$or": [
                    {"name": {"$regex": query, "$options": "i"}},
                    {"description": {"$regex": query, "$options": "i"}},
                    {"generic_name": {"$regex": query, "$options": "i"}}
                ]
            }
            cursor = collection.find(search_query).limit(limit)
            medicines = await cursor.to_list(length=limit)
            # Convert MongoDB types to JSON-safe format
            medicines = self._convert_mongo_types_to_json_safe(medicines)
            logger.info("Found %d medicines matching query: %s", len(medicines), query)
            return medicines
        except Exception as e:
            logger.error("Failed to search medicines: %s", str(e))
            # Return empty list instead of raising to allow fallback to GPT-4
            return []

    # Vaccine Operations
    async def insert_vaccine(self, vaccine_data: Dict[str, Any]) -> str:
        """Insert a new vaccine"""
        try:
            collection = await self.get_collection("vaccine")
            result = await collection.insert_one(vaccine_data)
            logger.info("Vaccine inserted with ID: %s", str(result.inserted_id))
            return str(result.inserted_id)
        except Exception as e:
            logger.error("Failed to insert vaccine: %s", str(e))
            raise

    async def get_vaccine(self, vaccine_id: str) -> Optional[Dict[str, Any]]:
        """Get vaccine by ID"""
        try:
            collection = await self.get_collection("vaccine")
            vaccine = await collection.find_one({"_id": vaccine_id})
            if vaccine:
                # Convert MongoDB types to JSON-safe format
                vaccine = self._convert_mongo_types_to_json_safe(vaccine)
            return vaccine
        except Exception as e:
            logger.error("Failed to get vaccine: %s", str(e))
            raise

    async def search_vaccines(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Search vaccines by name or target disease"""
        try:
            collection = await self.get_collection("vaccine")
            # Use regex search instead of text search to avoid index requirements
            search_query = {
                "$or": [
                    {"name": {"$regex": query, "$options": "i"}},
                    {"description": {"$regex": query, "$options": "i"}},
                    {"target_disease": {"$regex": query, "$options": "i"}}
                ]
            }
            cursor = collection.find(search_query).limit(limit)
            vaccines = await cursor.to_list(length=limit)
            # Convert MongoDB types to JSON-safe format
            vaccines = self._convert_mongo_types_to_json_safe(vaccines)
            logger.info("Found %d vaccines matching query: %s", len(vaccines), query)
            return vaccines
        except Exception as e:
            logger.error("Failed to search vaccines: %s", str(e))
            # Return empty list instead of raising to allow fallback to GPT-4
            return []

    # Medicine Schedule Operations
    async def insert_medicine_schedule(self, schedule_data: Dict[str, Any]) -> str:
        """Insert a new medicine schedule"""
        try:
            collection = await self.get_collection("medicineschedule")
            result = await collection.insert_one(schedule_data)
            logger.info("Medicine schedule inserted with ID: %s", str(result.inserted_id))
            return str(result.inserted_id)
        except Exception as e:
            logger.error("Failed to insert medicine schedule: %s", str(e))
            raise

    async def get_medicine_schedules(self, anon_token: str) -> List[Dict[str, Any]]:
        """Get medicine schedules for a user"""
        try:
            collection = await self.get_collection("medicineschedule")
            cursor = collection.find({"anon_token": anon_token}).sort("start_date", 1)
            schedules = await cursor.to_list(length=100)
            # Convert MongoDB types to JSON-safe format
            schedules = self._convert_mongo_types_to_json_safe(schedules)
            return schedules
        except Exception as e:
            logger.error("Failed to get medicine schedules: %s", str(e))
            raise

    async def update_medicine_schedule(self, schedule_id: str, update_data: Dict[str, Any]) -> bool:
        """Update a medicine schedule"""
        try:
            collection = await self.get_collection("medicineschedule")
            result = await collection.update_one(
                {"_id": schedule_id}, 
                {"$set": update_data}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error("Failed to update medicine schedule: %s", str(e))
            raise

    # Vaccine Schedule Operations
    async def insert_vaccine_schedule(self, schedule_data: Dict[str, Any]) -> str:
        """Insert a new vaccine schedule"""
        try:
            collection = await self.get_collection("vaccineschedule")
            result = await collection.insert_one(schedule_data)
            logger.info("Vaccine schedule inserted with ID: %s", str(result.inserted_id))
            return str(result.inserted_id)
        except Exception as e:
            logger.error("Failed to insert vaccine schedule: %s", str(e))
            raise

    async def get_vaccine_schedules(self, anon_token: str) -> List[Dict[str, Any]]:
        """Get vaccine schedules for a user"""
        try:
            collection = await self.get_collection("vaccineschedule")
            cursor = collection.find({"anon_token": anon_token}).sort("due_date", 1)
            schedules = await cursor.to_list(length=100)
            # Convert MongoDB types to JSON-safe format
            schedules = self._convert_mongo_types_to_json_safe(schedules)
            return schedules
        except Exception as e:
            logger.error("Failed to get vaccine schedules: %s", str(e))
            raise

    async def update_vaccine_schedule(self, schedule_id: str, update_data: Dict[str, Any]) -> bool:
        """Update a vaccine schedule"""
        try:
            collection = await self.get_collection("vaccineschedule")
            result = await collection.update_one(
                {"_id": schedule_id}, 
                {"$set": update_data}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error("Failed to update vaccine schedule: %s", str(e))
            raise

    # Logging Operations
    async def get_ai_query_logs(self, filters: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        """Get AI query logs with filters"""
        try:
            collection = await self.get_collection("ai_query_logs")
            query = {}
            
            if filters.get("start_date"):
                query["timestamp"] = {"$gte": filters["start_date"]}
            if filters.get("end_date"):
                if "timestamp" in query:
                    query["timestamp"]["$lte"] = filters["end_date"]
                else:
                    query["timestamp"] = {"$lte": filters["end_date"]}
            if filters.get("model"):
                query["model_used"] = filters["model"]
            if filters.get("supplement_id"):
                query["supplement_id"] = filters["supplement_id"]
            if filters.get("medicine_id"):
                query["medicine_id"] = filters["medicine_id"]
            if filters.get("vaccine_id"):
                query["vaccine_id"] = filters["vaccine_id"]
            if filters.get("anon_token"):
                query["anon_token"] = filters["anon_token"]
            if filters.get("success") is not None:
                query["success"] = filters["success"]
                
            cursor = collection.find(query).sort("timestamp", -1).limit(limit)
            logs = await cursor.to_list(length=limit)
            # Convert MongoDB types to JSON-safe format
            logs = self._convert_mongo_types_to_json_safe(logs)
            logger.info("Retrieved %d AI query logs", len(logs))
            return logs
        except Exception as e:
            logger.error("Failed to retrieve AI query logs: %s", str(e))
            raise
            
    async def get_supplement_view_logs(self, filters: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        """Get supplement view logs"""
        try:
            collection = await self.get_collection("supplement_view_logs")
            query = {}
            
            if filters.get("start_date"):
                query["timestamp"] = {"$gte": filters["start_date"]}
            if filters.get("end_date"):
                if "timestamp" in query:
                    query["timestamp"]["$lte"] = filters["end_date"]
                else:
                    query["timestamp"] = {"$lte": filters["end_date"]}
            if filters.get("supplement_id"):
                query["supplement_id"] = filters["supplement_id"]
            if filters.get("anon_token"):
                query["anon_token"] = filters["anon_token"]

            cursor = collection.find(query).sort("timestamp", -1).limit(limit)
            logs = await cursor.to_list(length=limit)
            # Convert MongoDB types to JSON-safe format
            logs = self._convert_mongo_types_to_json_safe(logs)
            logger.info("Retrieved %d supplement view logs", len(logs))
            return logs
        except Exception as e:
            logger.error("Failed to retrieve supplement view logs: %s", str(e))
            raise

    # User Medical Profile Operations
    async def create_user_medical_profile(self, profile_data: Dict[str, Any]) -> str:
        """Create a new user medical profile"""
        try:
            collection = await self.get_collection("user_medical_profiles")
            result = await collection.insert_one(profile_data)
            logger.info("User medical profile created with ID: %s", str(result.inserted_id))
            return str(result.inserted_id)
        except Exception as e:
            logger.error("Failed to create user medical profile: %s", str(e))
            raise

    async def get_user_medical_profile(self, user_id: str, anon_token: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get user medical profile by user_id or anon_token"""
        try:
            collection = await self.get_collection("user_medical_profiles")
            query = {"user_id": user_id} if user_id else {"anon_token": anon_token}
            profile = await collection.find_one(query)
            if profile:
                profile = self._convert_mongo_types_to_json_safe(profile)
            return profile
        except Exception as e:
            logger.error("Failed to get user medical profile: %s", str(e))
            raise

    async def update_user_medical_profile(self, user_id: str, update_data: Dict[str, Any], anon_token: Optional[str] = None) -> bool:
        """Update user medical profile"""
        try:
            collection = await self.get_collection("user_medical_profiles")
            query = {"user_id": user_id} if user_id else {"anon_token": anon_token}
            update_data["updated_at"] = datetime.now(timezone.utc)
            result = await collection.update_one(query, {"$set": update_data})
            logger.info("User medical profile updated: %s", result.modified_count > 0)
            return result.modified_count > 0
        except Exception as e:
            logger.error("Failed to update user medical profile: %s", str(e))
            raise

    # User Medicine Usage Operations
    async def add_user_medicine_usage(self, usage_data: Dict[str, Any]) -> str:
        """Add medicine usage for a user"""
        try:
            collection = await self.get_collection("user_medicine_usage")
            result = await collection.insert_one(usage_data)
            logger.info("User medicine usage added with ID: %s", str(result.inserted_id))
            return str(result.inserted_id)
        except Exception as e:
            logger.error("Failed to add user medicine usage: %s", str(e))
            raise

    async def get_user_medicine_usage(self, user_id: str, anon_token: Optional[str] = None, active_only: bool = True) -> List[Dict[str, Any]]:
        """Get user's medicine usage"""
        try:
            collection = await self.get_collection("user_medicine_usage")
            query = {"user_id": user_id} if user_id else {"anon_token": anon_token}
            if active_only:
                query["is_active"] = True
            cursor = collection.find(query).sort("created_at", -1)
            usage_list = await cursor.to_list(length=None)
            return [self._convert_mongo_types_to_json_safe(item) for item in usage_list]
        except Exception as e:
            logger.error("Failed to get user medicine usage: %s", str(e))
            raise

    async def update_medicine_usage(self, usage_id: str, update_data: Dict[str, Any]) -> bool:
        """Update medicine usage"""
        try:
            collection = await self.get_collection("user_medicine_usage")
            update_data["updated_at"] = datetime.now(timezone.utc)
            result = await collection.update_one({"_id": usage_id}, {"$set": update_data})
            logger.info("Medicine usage updated: %s", result.modified_count > 0)
            return result.modified_count > 0
        except Exception as e:
            logger.error("Failed to update medicine usage: %s", str(e))
            raise

    # User Supplement Usage Operations
    async def add_user_supplement_usage(self, usage_data: Dict[str, Any]) -> str:
        """Add supplement usage for a user"""
        try:
            collection = await self.get_collection("user_supplement_usage")
            result = await collection.insert_one(usage_data)
            logger.info("User supplement usage added with ID: %s", str(result.inserted_id))
            return str(result.inserted_id)
        except Exception as e:
            logger.error("Failed to add user supplement usage: %s", str(e))
            raise

    async def get_user_supplement_usage(self, user_id: str, anon_token: Optional[str] = None, active_only: bool = True) -> List[Dict[str, Any]]:
        """Get user's supplement usage"""
        try:
            collection = await self.get_collection("user_supplement_usage")
            query = {"user_id": user_id} if user_id else {"anon_token": anon_token}
            if active_only:
                query["is_active"] = True
            cursor = collection.find(query).sort("created_at", -1)
            usage_list = await cursor.to_list(length=None)
            return [self._convert_mongo_types_to_json_safe(item) for item in usage_list]
        except Exception as e:
            logger.error("Failed to get user supplement usage: %s", str(e))
            raise

    async def update_supplement_usage(self, usage_id: str, update_data: Dict[str, Any]) -> bool:
        """Update supplement usage"""
        try:
            collection = await self.get_collection("user_supplement_usage")
            update_data["updated_at"] = datetime.now(timezone.utc)
            result = await collection.update_one({"_id": usage_id}, {"$set": update_data})
            logger.info("Supplement usage updated: %s", result.modified_count > 0)
            return result.modified_count > 0
        except Exception as e:
            logger.error("Failed to update supplement usage: %s", str(e))
            raise

    # User Vaccine History Operations
    async def add_user_vaccine_history(self, vaccine_data: Dict[str, Any]) -> str:
        """Add vaccine history for a user"""
        try:
            collection = await self.get_collection("user_vaccine_history")
            result = await collection.insert_one(vaccine_data)
            logger.info("User vaccine history added with ID: %s", str(result.inserted_id))
            return str(result.inserted_id)
        except Exception as e:
            logger.error("Failed to add user vaccine history: %s", str(e))
            raise

    async def get_user_vaccine_history(self, user_id: str, anon_token: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get user's vaccine history"""
        try:
            collection = await self.get_collection("user_vaccine_history")
            query = {"user_id": user_id} if user_id else {"anon_token": anon_token}
            cursor = collection.find(query).sort("vaccination_date", -1)
            history_list = await cursor.to_list(length=None)
            return [self._convert_mongo_types_to_json_safe(item) for item in history_list]
        except Exception as e:
            logger.error("Failed to get user vaccine history: %s", str(e))
            raise

    async def update_vaccine_history(self, history_id: str, update_data: Dict[str, Any]) -> bool:
        """Update vaccine history"""
        try:
            collection = await self.get_collection("user_vaccine_history")
            update_data["updated_at"] = datetime.now(timezone.utc)
            result = await collection.update_one({"_id": history_id}, {"$set": update_data})
            logger.info("Vaccine history updated: %s", result.modified_count > 0)
            return result.modified_count > 0
        except Exception as e:
            logger.error("Failed to update vaccine history: %s", str(e))
            raise

    # Comprehensive User Health Data
    async def get_user_comprehensive_health_data(self, user_id: str, anon_token: Optional[str] = None) -> Dict[str, Any]:
        """Get comprehensive health data for a user"""
        try:
            # Get medical profile
            profile = await self.get_user_medical_profile(user_id, anon_token)
            
            # Get active medicine usage
            medicines = await self.get_user_medicine_usage(user_id, anon_token, active_only=True)
            
            # Get active supplement usage
            supplements = await self.get_user_supplement_usage(user_id, anon_token, active_only=True)
            
            # Get vaccine history
            vaccines = await self.get_user_vaccine_history(user_id, anon_token)
            
            return {
                "profile": profile,
                "current_medicines": medicines,
                "current_supplements": supplements,
                "vaccine_history": vaccines
            }
        except Exception as e:
            logger.error("Failed to get comprehensive health data: %s", str(e))
            raise

    # Check for Drug Interactions
    async def check_drug_interactions(self, medicine_ids: List[str], supplement_ids: List[str]) -> List[Dict[str, Any]]:
        """Check for potential drug interactions"""
        try:
            interactions = []
            
            # Get medicine details
            if medicine_ids:
                medicine_collection = await self.get_collection("medicine")
                medicines = await medicine_collection.find({"_id": {"$in": medicine_ids}}).to_list(length=None)
                
                # Get supplement details
                if supplement_ids:
                    supplement_collection = await self.get_collection("supplement")
                    supplements = await supplement_collection.find({"_id": {"$in": supplement_ids}}).to_list(length=None)
                    
                    # Check for interactions (simplified logic - in production, use a proper drug interaction database)
                    for medicine in medicines:
                        for supplement in supplements:
                            if medicine.get("interactions") and supplement.get("name") in medicine.get("interactions", []):
                                interactions.append({
                                    "type": "medicine_supplement",
                                    "medicine": medicine.get("name"),
                                    "supplement": supplement.get("name"),
                                    "severity": "moderate",
                                    "description": f"Potential interaction between {medicine.get('name')} and {supplement.get('name')}"
                                })
            
            return interactions
        except Exception as e:
            logger.error("Failed to check drug interactions: %s", str(e))
            raise

    # Factsheet Operations
    async def insert_factsheet(self, factsheet_data: Dict[str, Any]) -> str:
        """Insert a new factsheet"""
        try:
            collection = await self.get_collection("factsheets")
            result = await collection.insert_one(factsheet_data)
            logger.info("Factsheet inserted with ID: %s", str(result.inserted_id))
            return str(result.inserted_id)
        except Exception as e:
            logger.error("Failed to insert factsheet: %s", str(e))
            raise

    async def get_factsheet(self, factsheet_id: str) -> Optional[Dict[str, Any]]:
        """Get factsheet by ID"""
        try:
            collection = await self.get_collection("factsheets")
            factsheet = await collection.find_one({"_id": factsheet_id})
            if factsheet:
                factsheet = self._convert_mongo_types_to_json_safe(factsheet)
            return factsheet
        except Exception as e:
            logger.error("Failed to get factsheet: %s", str(e))
            raise

    async def search_factsheets(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Search factsheets by title, content, or keywords"""
        try:
            collection = await self.get_collection("factsheets")
            search_query = {
                "$or": [
                    {"title": {"$regex": query, "$options": "i"}},
                    {"content": {"$regex": query, "$options": "i"}},
                    {"keywords": {"$regex": query, "$options": "i"}}
                ]
            }
            cursor = collection.find(search_query).limit(limit)
            factsheets = await cursor.to_list(length=limit)
            factsheets = self._convert_mongo_types_to_json_safe(factsheets)
            logger.info("Found %d factsheets matching query: %s", len(factsheets), query)
            return factsheets
        except Exception as e:
            logger.error("Failed to search factsheets: %s", str(e))
            return []

    async def get_factsheet_by_topic(self, topic: str) -> Optional[Dict[str, Any]]:
        """Get factsheet by specific topic"""
        try:
            collection = await self.get_collection("factsheets")
            factsheet = await collection.find_one({
                "$or": [
                    {"title": {"$regex": topic, "$options": "i"}},
                    {"keywords": {"$regex": topic, "$options": "i"}}
                ]
            })
            if factsheet:
                factsheet = self._convert_mongo_types_to_json_safe(factsheet)
            return factsheet
        except Exception as e:
            logger.error("Failed to get factsheet by topic: %s", str(e))
            return None

# Global database instance
db = Database()
