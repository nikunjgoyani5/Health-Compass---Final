import aiohttp
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
import asyncio

logger = logging.getLogger(__name__)

class APIIntegrationService:
    """Service to integrate with Node.js APIs for user data"""
    
    def __init__(self):
        self.base_url = "http://localhost:8002/api/v1"
        self.session = None
        
    async def _get_session(self):
        """Get or create aiohttp session"""
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession()
        return self.session
    
    async def close_session(self):
        """Close the aiohttp session"""
        if self.session and not self.session.closed:
            await self.session.close()
    
    async def _make_request(self, method: str, endpoint: str, headers: Dict[str, str] = None, data: Dict[str, Any] = None) -> Dict[str, Any]:
        """Make HTTP request to Node.js API"""
        try:
            session = await self._get_session()
            url = f"{self.base_url}{endpoint}"
            
            # Default headers
            default_headers = {
                "Content-Type": "application/json"
            }
            if headers:
                default_headers.update(headers)
            
            async with session.request(method, url, headers=default_headers, json=data) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    logger.warning("API request failed: %s %s - Status: %s", method, endpoint, response.status)
                    return {"error": f"API request failed with status {response.status}"}
                    
        except Exception as e:
            logger.error("Error making API request: %s", str(e))
            return {"error": f"Request failed: {str(e)}"}
    
    async def get_user_medicine_schedule(self, user_token: str) -> Dict[str, Any]:
        """Get user's medicine schedule from Node.js API"""
        try:
            headers = {"Authorization": f"Bearer {user_token}"}
            result = await self._make_request("GET", "/medicine-schedule/list", headers=headers)
            
            if "error" not in result:
                logger.info("Successfully fetched medicine schedule for user")
                return {
                    "success": True,
                    "data": result.get("data", []),
                    "message": "Medicine schedule retrieved successfully"
                }
            else:
                return {
                    "success": False,
                    "error": result["error"],
                    "message": "Failed to fetch medicine schedule"
                }
                
        except Exception as e:
            logger.error("Error fetching medicine schedule: %s", str(e))
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to fetch medicine schedule"
            }
    
    async def get_user_vaccines(self, user_token: str) -> Dict[str, Any]:
        """Get user's vaccines from Node.js API"""
        try:
            headers = {"Authorization": f"Bearer {user_token}"}
            result = await self._make_request("GET", "/vaccine", headers=headers)
            
            if "error" not in result:
                logger.info("Successfully fetched vaccines for user")
                return {
                    "success": True,
                    "data": result.get("data", []),
                    "message": "Vaccines retrieved successfully"
                }
            else:
                return {
                    "success": False,
                    "error": result["error"],
                    "message": "Failed to fetch vaccines"
                }
                
        except Exception as e:
            logger.error("Error fetching vaccines: %s", str(e))
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to fetch vaccines"
            }
    
    async def get_user_vaccine_schedule(self, user_token: str) -> Dict[str, Any]:
        """Get user's vaccine schedule from Node.js API"""
        try:
            headers = {"Authorization": f"Bearer {user_token}"}
            result = await self._make_request("GET", "/vaccine-schedule", headers=headers)
            
            if "error" not in result:
                logger.info("Successfully fetched vaccine schedule for user")
                return {
                    "success": True,
                    "data": result.get("data", []),
                    "message": "Vaccine schedule retrieved successfully"
                }
            else:
                return {
                    "success": False,
                    "error": result["error"],
                    "message": "Failed to fetch vaccine schedule"
                }
                
        except Exception as e:
            logger.error("Error fetching vaccine schedule: %s", str(e))
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to fetch vaccine schedule"
            }
    
    async def get_user_comprehensive_data(self, user_token: str) -> Dict[str, Any]:
        """Get comprehensive user data from all APIs"""
        try:
            # Fetch all user data concurrently
            medicine_task = self.get_user_medicine_schedule(user_token)
            vaccine_task = self.get_user_vaccines(user_token)
            schedule_task = self.get_user_vaccine_schedule(user_token)
            
            medicine_result, vaccine_result, schedule_result = await asyncio.gather(
                medicine_task, vaccine_task, schedule_task, return_exceptions=True
            )
            
            # Process results
            comprehensive_data = {
                "medicines": medicine_result.get("data", []) if medicine_result.get("success") else [],
                "vaccines": vaccine_result.get("data", []) if vaccine_result.get("success") else [],
                "vaccine_schedule": schedule_result.get("data", []) if schedule_result.get("success") else [],
                "last_updated": datetime.now().isoformat()
            }
            
            return {
                "success": True,
                "data": comprehensive_data,
                "message": "Comprehensive user data retrieved successfully"
            }
            
        except Exception as e:
            logger.error("Error fetching comprehensive user data: %s", str(e))
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to fetch comprehensive user data"
            }

# Global instance
api_integration_service = APIIntegrationService()
