import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import json

logger = logging.getLogger(__name__)

class UserContextManager:
    """Manages user context and provides personalized responses"""
    
    def __init__(self):
        self.user_contexts = {}  # In-memory storage for user contexts
        self.context_ttl = timedelta(hours=24)  # Context expires after 24 hours
    
    def _extract_user_info(self, message: str) -> Dict[str, Any]:
        """Extract user information from message"""
        user_info = {}
        
        # Extract name
        name_patterns = [
            "my name is", "i'm", "i am", "call me", "this is"
        ]
        
        message_lower = message.lower()
        for pattern in name_patterns:
            if pattern in message_lower:
                # Find the name after the pattern
                start_idx = message_lower.find(pattern) + len(pattern)
                name_part = message[start_idx:].strip()
                
                # Extract first word as name
                if name_part:
                    name = name_part.split()[0].strip()
                    if name and len(name) > 1:  # Basic validation
                        user_info["name"] = name.title()
                        break
        
        # Extract age
        age_patterns = [
            "i'm", "i am", "age", "years old"
        ]
        
        for pattern in age_patterns:
            if pattern in message_lower:
                # Look for numbers that could be age
                import re
                age_match = re.search(r'(\d+)\s*(?:years?\s*old|y\.?o\.?)', message_lower)
                if age_match:
                    user_info["age"] = int(age_match.group(1))
                    break
        
        # Extract medical conditions
        condition_keywords = [
            "asthma", "diabetes", "hypertension", "allergies", "heart condition",
            "blood pressure", "cholesterol", "arthritis", "depression", "anxiety"
        ]
        
        conditions = []
        for keyword in condition_keywords:
            if keyword in message_lower:
                conditions.append(keyword)
        
        if conditions:
            user_info["medical_conditions"] = conditions
        
        # Extract current medicines
        medicine_patterns = [
            "i take", "taking", "currently on", "prescribed", "medication"
        ]
        
        medicines = []
        for pattern in medicine_patterns:
            if pattern in message_lower:
                # Look for medicine names after the pattern
                start_idx = message_lower.find(pattern) + len(pattern)
                medicine_part = message[start_idx:].strip()
                
                # Common medicine names
                common_medicines = [
                    "aspirin", "ibuprofen", "paracetamol", "vitamin d", "vitamin c",
                    "iron", "calcium", "omega 3", "probiotics", "multivitamin"
                ]
                
                for med in common_medicines:
                    if med in medicine_part.lower():
                        medicines.append(med.title())
        
        if medicines:
            user_info["current_medicines"] = medicines
        
        return user_info
    
    def update_user_context(self, user_id: str, message: str, api_data: Dict[str, Any] = None) -> Dict[str, Any]:
        """Update user context with new information"""
        try:
            # Get existing context or create new
            if user_id not in self.user_contexts:
                self.user_contexts[user_id] = {
                    "created_at": datetime.now(),
                    "last_updated": datetime.now(),
                    "messages": [],
                    "user_info": {},
                    "api_data": {},
                    "interaction_count": 0
                }
            
            context = self.user_contexts[user_id]
            
            # Update timestamp
            context["last_updated"] = datetime.now()
            context["interaction_count"] += 1
            
            # Add message to history
            context["messages"].append({
                "timestamp": datetime.now().isoformat(),
                "message": message
            })
            
            # Keep only last 10 messages
            if len(context["messages"]) > 10:
                context["messages"] = context["messages"][-10:]
            
            # Extract user info from message
            user_info = self._extract_user_info(message)
            if user_info:
                context["user_info"].update(user_info)
            
            # Update API data if provided
            if api_data:
                context["api_data"].update(api_data)
            
            logger.info("Updated user context for %s: %s", user_id, context["user_info"])
            return context
            
        except Exception as e:
            logger.error("Error updating user context: %s", str(e))
            return {}
    
    def get_user_context(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user context if it exists and hasn't expired"""
        try:
            if user_id not in self.user_contexts:
                return None
            
            context = self.user_contexts[user_id]
            
            # Check if context has expired
            if datetime.now() - context["last_updated"] > self.context_ttl:
                logger.info("User context expired for %s, removing", user_id)
                del self.user_contexts[user_id]
                return None
            
            return context
            
        except Exception as e:
            logger.error("Error getting user context: %s", str(e))
            return None
    
    def get_personalized_greeting(self, user_id: str, message: str) -> str:
        """Generate personalized greeting based on user context"""
        try:
            context = self.get_user_context(user_id)
            if not context:
                return self._get_default_greeting()
            
            user_info = context.get("user_info", {})
            name = user_info.get("name", "there")
            
            # Check if this is a first-time greeting
            if context["interaction_count"] == 1:
                return self._get_welcome_greeting(name, user_info)
            else:
                return self._get_return_greeting(name, user_info)
                
        except Exception as e:
            logger.error("Error generating personalized greeting: %s", str(e))
            return self._get_default_greeting()
    
    def _get_welcome_greeting(self, name: str, user_info: Dict[str, Any]) -> str:
        """Generate welcome greeting for new users (short form)"""
        greeting = f"Hi {name}! 👋 I'm your personal health assistant."
        return greeting
    
    def _get_return_greeting(self, name: str, user_info: Dict[str, Any]) -> str:
        """Generate greeting for returning users"""
        greeting = f"Welcome back {name}! 👋 "
        
        # Check if we have recent API data
        if user_info.get("current_medicines"):
            medicines = ", ".join(user_info["current_medicines"])
            greeting += f"I remember you're taking {medicines}. "
        
        greeting += "How can I help you today with your health questions?"
        
        return greeting
    
    def _get_default_greeting(self) -> str:
        """Default greeting when no user context is available (short form)"""
        return "Hello! 👋 I'm your personal health assistant."
    
    def get_context_summary(self, user_id: str) -> str:
        """Get a summary of user context for AI prompts"""
        try:
            context = self.get_user_context(user_id)
            if not context:
                return "No user context available."
            
            user_info = context.get("user_info", {})
            api_data = context.get("api_data", {})
            
            summary = f"User Context Summary:\n"
            
            if user_info.get("name"):
                summary += f"- Name: {user_info['name']}\n"
            
            if user_info.get("age"):
                summary += f"- Age: {user_info['age']} years\n"
            
            if user_info.get("medical_conditions"):
                conditions = ", ".join(user_info["medical_conditions"])
                summary += f"- Medical Conditions: {conditions}\n"
            
            if user_info.get("current_medicines"):
                medicines = ", ".join(user_info["current_medicines"])
                summary += f"- Current Medicines: {medicines}\n"
            
            # Add API data summary (counts and names when available)
            if api_data.get("medicines"):
                summary += f"- Medicine Schedule: {len(api_data['medicines'])} active medicines\n"
                try:
                    med_names = []
                    for item in api_data["medicines"][:5]:
                        name = item.get("name") or item.get("medicine_name") or item.get("medicine") or item.get("title")
                        if name:
                            med_names.append(str(name))
                    if med_names:
                        summary += f"  Medicines: {', '.join(med_names)}\n"
                except Exception:
                    pass
            
            if api_data.get("vaccines"):
                summary += f"- Vaccines: {len(api_data['vaccines'])} vaccines\n"
                try:
                    vac_names = []
                    for item in api_data["vaccines"][:5]:
                        name = item.get("name") or item.get("vaccine_name") or item.get("vaccine") or item.get("title")
                        if name:
                            vac_names.append(str(name))
                    if vac_names:
                        summary += f"  Vaccines: {', '.join(vac_names)}\n"
                except Exception:
                    pass
            
            if api_data.get("vaccine_schedule"):
                summary += f"- Vaccine Schedule: {len(api_data['vaccine_schedule'])} scheduled\n"
            # Include supplements if provided by API data
            if api_data.get("supplements"):
                try:
                    supp_names = []
                    for item in api_data["supplements"][:5]:
                        name = item.get("name") or item.get("supplement_name") or item.get("title")
                        if name:
                            supp_names.append(str(name))
                    if supp_names:
                        summary += f"- Supplements: {', '.join(supp_names)}\n"
                except Exception:
                    pass
            
            summary += f"- Total Interactions: {context['interaction_count']}\n"
            summary += f"- Last Updated: {context['last_updated'].strftime('%Y-%m-%d %H:%M')}\n"
            
            return summary
            
        except Exception as e:
            logger.error("Error generating context summary: %s", str(e))
            return "Error generating context summary."
    
    def cleanup_expired_contexts(self):
        """Remove expired user contexts"""
        try:
            current_time = datetime.now()
            expired_users = []
            
            for user_id, context in self.user_contexts.items():
                if current_time - context["last_updated"] > self.context_ttl:
                    expired_users.append(user_id)
            
            for user_id in expired_users:
                del self.user_contexts[user_id]
                logger.info("Cleaned up expired context for user: %s", user_id)
                
        except Exception as e:
            logger.error("Error cleaning up expired contexts: %s", str(e))

# Global instance
user_context_manager = UserContextManager()
