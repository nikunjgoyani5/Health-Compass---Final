#!/usr/bin/env python3
"""
Health Compass AI System Demo

This script demonstrates the key features of the Health Compass AI system
including the chatbot, recommendations, analytics, and new management features.
"""

import asyncio
import logging
import json
from datetime import datetime, timedelta
from typing import Dict, Any

# Configure logging with lazy % formatting
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class HealthCompassDemo:
    """Demo class for Health Compass AI System"""
    
    def __init__(self):
        self.demo_data = {
            "supplements": {
                "vitamin_c": {
                    "id": "vitamin_c_001",
                    "name": "Premium Vitamin C",
                    "description": "High-potency vitamin C supplement for immune support",
                    "ingredients": ["Ascorbic Acid", "Bioflavonoids", "Rose Hips"],
                    "benefits": ["Immune system support", "Antioxidant protection", "Collagen synthesis"],
                    "risks": ["May cause stomach upset in some individuals"],
                    "usage": "Take 1 capsule daily with food",
                    "dosage": "1000mg daily",
                    "category": "Vitamins"
                },
                "omega_3": {
                    "id": "omega_3_001",
                    "name": "Fish Oil Omega-3",
                    "description": "Pure fish oil supplement rich in EPA and DHA",
                    "ingredients": ["Fish Oil", "EPA", "DHA", "Vitamin E"],
                    "benefits": ["Heart health", "Brain function", "Joint support"],
                    "risks": ["May interact with blood thinners"],
                    "usage": "Take 2 softgels daily with meals",
                    "dosage": "2000mg daily",
                    "category": "Essential Fatty Acids"
                }
            },
            "medicines": {
                "aspirin": {
                    "id": "aspirin_001",
                    "name": "Aspirin",
                    "generic_name": "Acetylsalicylic Acid",
                    "description": "Common pain reliever and blood thinner",
                    "active_ingredients": ["Acetylsalicylic Acid"],
                    "dosage_forms": ["Tablet", "Chewable", "Enteric-coated"],
                    "indications": ["Pain relief", "Fever reduction", "Blood thinning"],
                    "contraindications": ["Bleeding disorders", "Stomach ulcers"],
                    "side_effects": ["Stomach upset", "Bleeding risk", "Ringing in ears"],
                    "interactions": ["Blood thinners", "NSAIDs"]
                },
                "ibuprofen": {
                    "id": "ibuprofen_001",
                    "name": "Ibuprofen",
                    "generic_name": "Ibuprofen",
                    "description": "Non-steroidal anti-inflammatory drug",
                    "active_ingredients": ["Ibuprofen"],
                    "dosage_forms": ["Tablet", "Liquid", "Gel"],
                    "indications": ["Pain relief", "Inflammation reduction", "Fever"],
                    "contraindications": ["Kidney disease", "Heart disease"],
                    "side_effects": ["Stomach irritation", "Kidney problems", "Heart risk"],
                    "interactions": ["Blood pressure medications", "Diuretics"]
                }
            },
            "vaccines": {
                "flu_vaccine": {
                    "id": "flu_vaccine_001",
                    "name": "Influenza Vaccine",
                    "description": "Annual vaccine to prevent seasonal flu",
                    "target_disease": "Influenza",
                    "age_groups": ["6 months and older"],
                    "dosage_schedule": ["Annual", "2 doses for first-time recipients under 9"],
                    "contraindications": ["Severe egg allergy", "Previous severe reaction"],
                    "side_effects": ["Sore arm", "Mild fever", "Fatigue"],
                    "effectiveness": "40-60% effective against circulating strains"
                },
                "covid_vaccine": {
                    "id": "covid_vaccine_001",
                    "name": "COVID-19 Vaccine",
                    "description": "Vaccine to prevent COVID-19 infection",
                    "target_disease": "COVID-19",
                    "age_groups": ["5 years and older"],
                    "dosage_schedule": ["2 doses primary series", "Booster doses as recommended"],
                    "contraindications": ["Severe allergic reaction to vaccine components"],
                    "side_effects": ["Arm soreness", "Fatigue", "Headache", "Fever"],
                    "effectiveness": "Highly effective against severe disease and hospitalization"
                }
            }
        }
    
    async def demo_chatbot_general(self) -> Dict[str, Any]:
        """Demo general chatbot functionality"""
        logger.info("Demo: General Chatbot Query")
        
        # Simulate a general health question
        query = "What are the benefits of regular exercise for overall health?"
        
        # In a real system, this would call the AI service
        response = {
            "query": query,
            "response": "Regular exercise offers numerous health benefits including improved cardiovascular health, stronger muscles and bones, better mental health, weight management, and increased energy levels. It also helps reduce the risk of chronic diseases like heart disease, diabetes, and certain cancers.",
            "metadata": {
                "model_used": "gpt-4",
                "tokens_used": 45,
                "query_type": "general",
                "timestamp": datetime.utcnow().isoformat(),
                "has_supplement_context": False,
                "has_medicine_context": False,
                "has_vaccine_context": False
            },
            "disclaimer": "IMPORTANT: This information is for educational purposes only and should not be considered medical advice. Always consult with a qualified healthcare professional before starting any exercise program or making health decisions.",
            "supplement_context": None,
            "medicine_context": None,
            "vaccine_context": None
        }
        
        logger.info("General query processed successfully")
        return response
    
    async def demo_chatbot_supplement_specific(self, supplement_id: str) -> Dict[str, Any]:
        """Demo supplement-specific chatbot functionality"""
        logger.info("Demo: Supplement-Specific Chatbot Query")
        
        supplement = self.demo_data["supplements"].get(supplement_id)
        if not supplement:
            logger.error("Supplement not found: %s", supplement_id)
            return {}
        
        query = f"Tell me about the benefits and risks of {supplement['name']}"
        
        # Simulate AI response with supplement context
        response = {
            "query": query,
            "response": f"Based on the supplement information, {supplement['name']} contains {', '.join(supplement['ingredients'])}. The potential benefits include {', '.join(supplement['benefits'])}. However, it's important to note that {supplement['risks'][0]}. Always follow the usage instructions: {supplement['usage']}.",
            "metadata": {
                "model_used": "gpt-4",
                "tokens_used": 78,
                "query_type": "supplement_specific",
                "timestamp": datetime.utcnow().isoformat(),
                "has_supplement_context": True,
                "has_medicine_context": False,
                "has_vaccine_context": False
            },
            "disclaimer": "IMPORTANT: This information is for educational purposes only and should not be considered medical advice. Always consult with a qualified healthcare professional before starting any supplement regimen or making health decisions.",
            "supplement_context": {
                "supplement_info": supplement
            },
            "medicine_context": None,
            "vaccine_context": None
        }
        
        logger.info("Supplement-specific query processed successfully")
        return response

    async def demo_chatbot_medicine_specific(self, medicine_id: str) -> Dict[str, Any]:
        """Demo medicine-specific chatbot functionality"""
        logger.info("Demo: Medicine-Specific Chatbot Query")
        
        medicine = self.demo_data["medicines"].get(medicine_id)
        if not medicine:
            logger.error("Medicine not found: %s", medicine_id)
            return {}
        
        query = f"What should I know about {medicine['name']}?"
        
        # Simulate AI response with medicine context
        response = {
            "query": query,
            "response": f"Based on the medicine information, {medicine['name']} ({medicine['generic_name']}) is used for {', '.join(medicine['indications'])}. It comes in {', '.join(medicine['dosage_forms'])} forms. Important considerations include {', '.join(medicine['contraindications'])}. Common side effects may include {', '.join(medicine['side_effects'])}.",
            "metadata": {
                "model_used": "gpt-4",
                "tokens_used": 85,
                "query_type": "medicine_specific",
                "timestamp": datetime.utcnow().isoformat(),
                "has_supplement_context": False,
                "has_medicine_context": True,
                "has_vaccine_context": False
            },
            "disclaimer": "CRITICAL: This information is for educational purposes only and should not be considered medical advice. Never start, stop, or change medication without consulting your healthcare provider. Always follow your doctor's instructions.",
            "supplement_context": None,
            "medicine_context": {
                "medicine_info": medicine
            },
            "vaccine_context": None
        }
        
        logger.info("Medicine-specific query processed successfully")
        return response

    async def demo_chatbot_vaccine_specific(self, vaccine_id: str) -> Dict[str, Any]:
        """Demo vaccine-specific chatbot functionality"""
        logger.info("Demo: Vaccine-Specific Chatbot Query")
        
        vaccine = self.demo_data["vaccines"].get(vaccine_id)
        if not vaccine:
            logger.error("Vaccine not found: %s", vaccine_id)
            return {}
        
        query = f"Tell me about the {vaccine['name']}"
        
        # Simulate AI response with vaccine context
        response = {
            "query": query,
            "response": f"Based on the vaccine information, the {vaccine['name']} prevents {vaccine['target_disease']} and is recommended for {', '.join(vaccine['age_groups'])}. The dosage schedule is {', '.join(vaccine['dosage_schedule'])}. Common side effects include {', '.join(vaccine['side_effects'])}. The vaccine is {vaccine['effectiveness']}.",
            "metadata": {
                "model_used": "gpt-4",
                "tokens_used": 92,
                "query_type": "vaccine_specific",
                "timestamp": datetime.utcnow().isoformat(),
                "has_supplement_context": False,
                "has_medicine_context": False,
                "has_vaccine_context": True
            },
            "disclaimer": "IMPORTANT: This information is for educational purposes only and should not be considered medical advice. Always consult with a qualified healthcare professional regarding vaccination decisions and schedules.",
            "supplement_context": None,
            "medicine_context": None,
            "vaccine_context": {
                "vaccine_info": vaccine
            }
        }
        
        logger.info("Vaccine-specific query processed successfully")
        return response
    
    async def demo_supplement_management(self) -> Dict[str, Any]:
        """Demo supplement management functionality"""
        logger.info("Demo: Supplement Management")
        
        # Simulate supplement CRUD operations
        operations = [
            {
                "operation": "Create Supplement",
                "endpoint": "POST /api/supplements",
                "data": {
                    "name": "Demo Vitamin D3",
                    "description": "High-potency vitamin D3 supplement",
                    "ingredients": ["Vitamin D3", "MCT Oil"],
                    "benefits": ["Bone health", "Immune support"],
                    "risks": ["May cause nausea in high doses"],
                    "usage": "Take 1 softgel daily with food",
                    "dosage": "2000 IU daily",
                    "category": "Vitamins"
                }
            },
            {
                "operation": "Get Supplement",
                "endpoint": "GET /api/supplements/{id}",
                "description": "Retrieve supplement details"
            },
            {
                "operation": "Search Supplements",
                "endpoint": "GET /api/supplements/search/{query}",
                "description": "Search supplements by name or description"
            }
        ]
        
        logger.info("Supplement management operations demonstrated")
        return {"operations": operations, "total_operations": len(operations)}

    async def demo_medicine_management(self) -> Dict[str, Any]:
        """Demo medicine management functionality"""
        logger.info("Demo: Medicine Management")
        
        # Simulate medicine CRUD operations
        operations = [
            {
                "operation": "Create Medicine",
                "endpoint": "POST /api/medicines",
                "data": {
                    "name": "Demo Acetaminophen",
                    "generic_name": "Acetaminophen",
                    "description": "Pain reliever and fever reducer",
                    "active_ingredients": ["Acetaminophen"],
                    "dosage_forms": ["Tablet", "Liquid", "Suppository"],
                    "indications": ["Pain relief", "Fever reduction"],
                    "contraindications": ["Liver disease", "Alcohol abuse"],
                    "side_effects": ["Liver damage", "Allergic reactions"],
                    "interactions": ["Blood thinners", "Alcohol"]
                }
            },
            {
                "operation": "Get Medicine",
                "endpoint": "GET /api/medicines/{id}",
                "description": "Retrieve medicine details"
            },
            {
                "operation": "Search Medicines",
                "endpoint": "GET /api/medicines/search/{query}",
                "description": "Search medicines by name or description"
            }
        ]
        
        logger.info("Medicine management operations demonstrated")
        return {"operations": operations, "total_operations": len(operations)}

    async def demo_vaccine_management(self) -> Dict[str, Any]:
        """Demo vaccine management functionality"""
        logger.info("Demo: Vaccine Management")
        
        # Simulate vaccine CRUD operations
        operations = [
            {
                "operation": "Create Vaccine",
                "endpoint": "POST /api/vaccines",
                "data": {
                    "name": "Demo Tetanus Vaccine",
                    "description": "Vaccine to prevent tetanus infection",
                    "target_disease": "Tetanus",
                    "age_groups": ["All ages"],
                    "dosage_schedule": ["Primary series", "Booster every 10 years"],
                    "contraindications": ["Severe allergic reaction"],
                    "side_effects": ["Sore arm", "Mild fever"],
                    "effectiveness": "95% effective when properly administered"
                }
            },
            {
                "operation": "Get Vaccine",
                "endpoint": "GET /api/vaccines/{id}",
                "description": "Retrieve vaccine details"
            },
            {
                "operation": "Search Vaccines",
                "endpoint": "GET /api/vaccines/search/{query}",
                "description": "Search vaccines by name or target disease"
            }
        ]
        
        logger.info("Vaccine management operations demonstrated")
        return {"operations": operations, "total_operations": len(operations)}

    async def demo_scheduling_systems(self) -> Dict[str, Any]:
        """Demo scheduling systems"""
        logger.info("Demo: Scheduling Systems")
        
        # Simulate medicine scheduling
        medicine_schedule = {
            "medicine_id": "aspirin_001",
            "medicine_name": "Aspirin",
            "dosage": "81mg",
            "frequency": "Daily",
            "time_of_day": ["Morning"],
            "start_date": datetime.utcnow(),
            "end_date": datetime.utcnow() + timedelta(days=30),
            "instructions": "Take with food to prevent stomach upset",
            "anon_token": "demo_user_123"
        }
        
        # Simulate vaccine scheduling
        vaccine_schedule = {
            "vaccine_id": "flu_vaccine_001",
            "vaccine_name": "Influenza Vaccine",
            "dose_number": 1,
            "recommended_age": "Adult",
            "due_date": datetime.utcnow() + timedelta(days=7),
            "location": "Local Pharmacy",
            "notes": "Annual flu shot",
            "anon_token": "demo_user_123"
        }
        
        schedules = {
            "medicine_schedule": medicine_schedule,
            "vaccine_schedule": vaccine_schedule
        }
        
        logger.info("Scheduling systems demonstrated")
        return {"schedules": schedules, "total_schedules": len(schedules)}
    
    async def demo_factsheet_search(self):
        """Demonstrate factsheet search functionality"""
        logger.info("Demonstrating factsheet search functionality")
        
        try:
            # Test factsheet search queries
            search_queries = [
                "What is vitamin C?",
                "Tell me about aspirin",
                "Information about flu vaccine",
                "What's omega 3?",
                "Explain ibuprofen"
            ]
            
            results = []
            for query in search_queries:
                logger.info("Testing factsheet search: %s", query)
                
                # Simulate the search process
                search_term = query.lower().replace("what is ", "").replace("tell me about ", "").replace("information about ", "").replace("what's ", "").replace("explain ", "").rstrip("?.,!").strip()
                
                # Find matching items in demo data
                found_items = {}
                
                # Search supplements
                supplement_matches = []
                for key, supplement in self.demo_data["supplements"].items():
                    if search_term in supplement["name"].lower() or search_term in supplement["description"].lower():
                        supplement_matches.append(supplement)
                if supplement_matches:
                    found_items["supplements"] = supplement_matches
                
                # Search medicines
                medicine_matches = []
                for key, medicine in self.demo_data["medicines"].items():
                    if search_term in medicine["name"].lower() or search_term in medicine["description"].lower():
                        medicine_matches.append(medicine)
                if medicine_matches:
                    found_items["medicines"] = medicine_matches
                
                # Search vaccines
                vaccine_matches = []
                for key, vaccine in self.demo_data["vaccines"].items():
                    if search_term in vaccine["name"].lower() or search_term in vaccine["description"].lower():
                        vaccine_matches.append(vaccine)
                if vaccine_matches:
                    found_items["vaccines"] = vaccine_matches
                
                results.append({
                    "query": query,
                    "search_term": search_term,
                    "found_items": found_items,
                    "results_count": sum(len(items) for items in found_items.values())
                })
            
            # Test GPT-4 fallback for items not in database
            fallback_queries = [
                "What is quercetin?",
                "Tell me about zinc supplements",
                "Information about COVID booster"
            ]
            
            fallback_results = []
            for query in fallback_queries:
                logger.info("Testing GPT-4 fallback: %s", query)
                
                # Simulate GPT-4 fallback response
                fallback_response = {
                    "query": query,
                    "search_term": query.lower().replace("what is ", "").replace("tell me about ", "").replace("information about ", "").rstrip("?.,!").strip(),
                    "fallback_used": True,
                    "response_type": "gpt4_generated",
                    "database_found": False
                }
                fallback_results.append(fallback_response)
            
            logger.info("Factsheet search demo completed successfully")
            return {
                "total_queries": len(search_queries),
                "results": results,
                "successful_searches": len([r for r in results if r["results_count"] > 0]),
                "fallback_queries": len(fallback_queries),
                "fallback_results": fallback_results
            }
            
        except Exception as e:
            logger.error("Factsheet search demo failed: %s", str(e))
            raise
    
    async def demo_recommendations(self, tags: list, properties: Dict[str, Any]) -> Dict[str, Any]:
        """Demo supplement recommendations"""
        logger.info("Demo: Supplement Recommendations")
        
        # Simulate AI recommendation logic
        recommendations = []
        reasoning = f"Based on your health tags ({', '.join(tags)}) and properties ({json.dumps(properties)}), here are some supplements that may be beneficial for general wellness:"
        
        # Simple recommendation logic based on tags
        if "immune support" in tags:
            recommendations.append({
                "name": "Premium Vitamin C",
                "description": "High-potency vitamin C for immune system support",
                "reasoning": "Vitamin C is essential for immune function and antioxidant protection"
            })
        
        if "heart health" in tags:
            recommendations.append({
                "name": "Fish Oil Omega-3",
                "description": "Pure fish oil rich in EPA and DHA",
                "reasoning": "Omega-3 fatty acids support cardiovascular health and brain function"
            })
        
        # Add general recommendations if none specific
        if not recommendations:
            recommendations.append({
                "name": "Premium Vitamin C",
                "description": "Essential vitamin for overall health",
                "reasoning": "Vitamin C is a foundational nutrient that supports multiple body systems"
            })
        
        response = {
            "recommendations": recommendations,
            "reasoning": reasoning + " " + " ".join([f"{r['name']}: {r['reasoning']}" for r in recommendations])
        }
        
        logger.info("Generated %d recommendations", len(recommendations))
        return response
    
    async def demo_analytics_logging(self) -> Dict[str, Any]:
        """Demo analytics and logging functionality"""
        logger.info("Demo: Analytics and Logging")
        
        # Simulate logging various activities
        activities = [
            {
                "type": "supplement_view",
                "supplement_id": "vitamin_c_001",
                "timestamp": datetime.utcnow().isoformat(),
                "user_agent": "Demo Browser/1.0",
                "ip_address": "127.0.0.1"
            },
            {
                "type": "ai_query",
                "query": "What are the benefits of vitamin C?",
                "response": "Vitamin C supports immune function...",
                "model_used": "gpt-4",
                "tokens_used": 35,
                "success": True,
                "timestamp": datetime.utcnow().isoformat()
            },
            {
                "type": "recommendation_request",
                "tags": ["immune support", "vitamins"],
                "properties": {"age_group": "adult"},
                "timestamp": datetime.utcnow().isoformat()
            }
        ]
        
        logger.info("Logged %d demo activities", len(activities))
        return {"activities": activities, "total_logged": len(activities)}
    
    async def demo_rate_limiting(self) -> Dict[str, Any]:
        """Demo rate limiting functionality"""
        logger.info("Demo: Rate Limiting")
        
        # Simulate rate limit checks
        rate_limit_info = {
            "identifier": "demo_user_123",
            "remaining_requests": 95,
            "limit": 100,
            "reset_time": (datetime.utcnow().timestamp() + 3600),  # 1 hour from now
            "window_seconds": 3600
        }
        
        logger.info("Rate limit info retrieved: %d requests remaining", rate_limit_info["remaining_requests"])
        return rate_limit_info
    
    async def run_full_demo(self):
        """Run the complete demo"""
        logger.info("Starting Health Compass AI System Demo")
        logger.info("=" * 60)
        
        try:
            # 1. General Chatbot Demo
            logger.info("\n1. GENERAL CHATBOT DEMO")
            logger.info("-" * 30)
            general_response = await self.demo_chatbot_general()
            print(f"Query: {general_response['query']}")
            print(f"Response: {general_response['response'][:100]}...")
            print(f"Disclaimer: {general_response['disclaimer'][:80]}...")
            
            # 2. Supplement-Specific Chatbot Demo
            logger.info("\n2. SUPPLEMENT-SPECIFIC CHATBOT DEMO")
            logger.info("-" * 40)
            supplement_response = await self.demo_chatbot_supplement_specific("vitamin_c")
            print(f"Query: {supplement_response['query']}")
            print(f"Response: {supplement_response['response'][:100]}...")
            print(f"Has Supplement Context: {supplement_response['metadata']['has_supplement_context']}")
            
            # 3. Medicine-Specific Chatbot Demo
            logger.info("\n3. MEDICINE-SPECIFIC CHATBOT DEMO")
            logger.info("-" * 40)
            medicine_response = await self.demo_chatbot_medicine_specific("aspirin")
            print(f"Query: {medicine_response['query']}")
            print(f"Response: {medicine_response['response'][:100]}...")
            print(f"Has Medicine Context: {medicine_response['metadata']['has_medicine_context']}")
            
            # 4. Vaccine-Specific Chatbot Demo
            logger.info("\n4. VACCINE-SPECIFIC CHATBOT DEMO")
            logger.info("-" * 40)
            vaccine_response = await self.demo_chatbot_vaccine_specific("flu_vaccine")
            print(f"Query: {vaccine_response['query']}")
            print(f"Response: {vaccine_response['response'][:100]}...")
            print(f"Has Vaccine Context: {vaccine_response['metadata']['has_vaccine_context']}")
            
            # 5. Supplement Management Demo
            logger.info("\n5. SUPPLEMENT MANAGEMENT DEMO")
            logger.info("-" * 35)
            supplement_mgmt = await self.demo_supplement_management()
            print(f"Demonstrated {supplement_mgmt['total_operations']} supplement operations")
            
            # 6. Medicine Management Demo
            logger.info("\n6. MEDICINE MANAGEMENT DEMO")
            logger.info("-" * 35)
            medicine_mgmt = await self.demo_medicine_management()
            print(f"Demonstrated {medicine_mgmt['total_operations']} medicine operations")
            
            # 7. Vaccine Management Demo
            logger.info("\n7. VACCINE MANAGEMENT DEMO")
            logger.info("-" * 35)
            vaccine_mgmt = await self.demo_vaccine_management()
            print(f"Demonstrated {vaccine_mgmt['total_operations']} vaccine operations")
            
            # 8. Scheduling Systems Demo
            logger.info("\n8. SCHEDULING SYSTEMS DEMO")
            logger.info("-" * 35)
            scheduling = await self.demo_scheduling_systems()
            print(f"Demonstrated {scheduling['total_schedules']} scheduling systems")
            
            # 9. Factsheet Search Demo
            logger.info("\n9. FACTSHEET SEARCH DEMO")
            logger.info("-" * 35)
            factsheet_search = await self.demo_factsheet_search()
            print(f"Tested {factsheet_search['total_queries']} factsheet search queries")
            print(f"Successful searches: {factsheet_search['successful_searches']}")
            print(f"GPT-4 fallback queries: {factsheet_search['fallback_queries']}")
            print(f"Total responses: {factsheet_search['total_queries'] + factsheet_search['fallback_queries']}")
            
            # 10. Recommendations Demo
            logger.info("\n10. SUPPLEMENT RECOMMENDATIONS DEMO")
            logger.info("-" * 35)
            rec_response = await self.demo_recommendations(
                ["immune support", "heart health"],
                {"age_group": "adult", "dietary_restrictions": "none"}
            )
            print(f"Generated {len(rec_response['recommendations'])} recommendations:")
            for i, rec in enumerate(rec_response['recommendations'], 1):
                print(f"  {i}. {rec['name']}: {rec['description']}")
            
            # 11. Analytics Demo
            logger.info("\n11. ANALYTICS AND LOGGING DEMO")
            logger.info("-" * 35)
            analytics = await self.demo_analytics_logging()
            print(f"Logged {analytics['total_logged']} activities")
            
            # 12. Rate Limiting Demo
            logger.info("\n12. RATE LIMITING DEMO")
            logger.info("-" * 25)
            rate_limit = await self.demo_rate_limiting()
            print(f"Rate Limit: {rate_limit['remaining_requests']}/{rate_limit['limit']} requests remaining")
            print(f"Resets in: {rate_limit['window_seconds']/3600:.1f} hours")
            
            logger.info("\nDemo completed successfully!")
            logger.info("=" * 60)
            
        except Exception as e:
            logger.error("Demo failed: %s", str(e))
            raise

async def main():
    """Main demo function"""
    demo = HealthCompassDemo()
    await demo.run_full_demo()

if __name__ == "__main__":
    asyncio.run(main())
