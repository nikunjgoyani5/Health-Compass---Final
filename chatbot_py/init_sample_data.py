#!/usr/bin/env python3
"""
Initialize Sample Data for Health Compass AI System

This script populates the database with sample supplements, medicines, and vaccines
to test the factsheet search functionality.
"""

import asyncio
import logging
from datetime import datetime
from database import db

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def init_sample_data():
    """Initialize database with sample data"""
    
    try:
        # Connect to database
        await db.connect()
        logger.info("Connected to database for sample data initialization")
        
        # Sample supplements
        sample_supplements = [
            {
                "name": "Vitamin C",
                "description": "Essential vitamin for immune system support and antioxidant protection",
                "ingredients": ["Ascorbic Acid", "Bioflavonoids", "Rose Hips"],
                "benefits": ["Immune system support", "Antioxidant protection", "Collagen synthesis", "Iron absorption"],
                "risks": ["May cause stomach upset in high doses", "Diarrhea in excessive amounts"],
                "usage": "Take 1-2 capsules daily with food",
                "dosage": "500-1000mg daily",
                "category": "Vitamins",
                "factsheet": "Vitamin C is a water-soluble vitamin that plays a crucial role in maintaining a healthy immune system. It acts as an antioxidant, protecting cells from damage caused by free radicals. Vitamin C is also essential for the production of collagen, a protein that helps maintain skin, bones, and connective tissues."
            },
            {
                "name": "Omega-3 Fish Oil",
                "description": "Essential fatty acids for heart and brain health",
                "ingredients": ["Fish Oil", "EPA", "DHA", "Vitamin E"],
                "benefits": ["Heart health", "Brain function", "Joint support", "Eye health"],
                "risks": ["May interact with blood thinners", "Fishy aftertaste"],
                "usage": "Take 2 softgels daily with meals",
                "dosage": "2000mg daily",
                "category": "Essential Fatty Acids",
                "factsheet": "Omega-3 fatty acids are essential nutrients that the body cannot produce on its own. EPA and DHA, found in fish oil, support cardiovascular health, brain function, and reduce inflammation. These fatty acids are particularly important for heart health and cognitive function."
            },
            {
                "name": "Vitamin D3",
                "description": "Sunshine vitamin for bone health and immune support",
                "ingredients": ["Vitamin D3 (Cholecalciferol)", "MCT Oil"],
                "benefits": ["Bone health", "Immune support", "Mood regulation", "Muscle function"],
                "risks": ["May cause nausea in high doses", "Kidney problems in excessive amounts"],
                "usage": "Take 1 softgel daily with food",
                "dosage": "2000-4000 IU daily",
                "category": "Vitamins",
                "factsheet": "Vitamin D3 is a fat-soluble vitamin that helps the body absorb calcium and phosphorus, essential for building and maintaining strong bones. It also plays a role in immune function and has been linked to mood regulation and muscle strength."
            }
        ]
        
        # Sample medicines
        sample_medicines = [
            {
                "name": "Aspirin",
                "generic_name": "Acetylsalicylic Acid",
                "description": "Common pain reliever and blood thinner",
                "active_ingredients": ["Acetylsalicylic Acid"],
                "dosage_forms": ["Tablet", "Chewable", "Enteric-coated"],
                "indications": ["Pain relief", "Fever reduction", "Blood thinning", "Heart attack prevention"],
                "contraindications": ["Bleeding disorders", "Stomach ulcers", "Allergy to aspirin"],
                "side_effects": ["Stomach upset", "Bleeding risk", "Ringing in ears", "Nausea"],
                "interactions": ["Blood thinners", "NSAIDs", "Alcohol"],
                "factsheet": "Aspirin is a non-steroidal anti-inflammatory drug (NSAID) that works by blocking certain natural substances in your body. It's commonly used to relieve pain, reduce fever, and prevent blood clots. Low-dose aspirin is often prescribed to reduce the risk of heart attack and stroke."
            },
            {
                "name": "Ibuprofen",
                "generic_name": "Ibuprofen",
                "description": "Non-steroidal anti-inflammatory drug for pain and inflammation",
                "active_ingredients": ["Ibuprofen"],
                "dosage_forms": ["Tablet", "Liquid", "Gel", "Capsule"],
                "indications": ["Pain relief", "Inflammation reduction", "Fever", "Arthritis"],
                "contraindications": ["Kidney disease", "Heart disease", "Stomach ulcers"],
                "side_effects": ["Stomach irritation", "Kidney problems", "Heart risk", "Dizziness"],
                "interactions": ["Blood pressure medications", "Diuretics", "Other NSAIDs"],
                "factsheet": "Ibuprofen is an NSAID that reduces hormones that cause inflammation and pain in the body. It's effective for treating various types of pain, including headaches, muscle aches, arthritis, and menstrual cramps. It also helps reduce fever and inflammation."
            }
        ]
        
        # Sample vaccines
        sample_vaccines = [
            {
                "name": "Influenza Vaccine",
                "description": "Annual vaccine to prevent seasonal flu",
                "target_disease": "Influenza",
                "age_groups": ["6 months and older"],
                "dosage_schedule": ["Annual", "2 doses for first-time recipients under 9"],
                "contraindications": ["Severe egg allergy", "Previous severe reaction", "Guillain-Barré syndrome"],
                "side_effects": ["Sore arm", "Mild fever", "Fatigue", "Headache"],
                "effectiveness": "40-60% effective against circulating strains",
                "factsheet": "The influenza vaccine is designed to protect against the most common flu viruses expected during the upcoming flu season. It's recommended annually as flu viruses constantly change. The vaccine helps reduce the severity of illness and prevents complications in high-risk individuals."
            },
            {
                "name": "COVID-19 Vaccine",
                "description": "Vaccine to prevent COVID-19 infection and severe disease",
                "target_disease": "COVID-19",
                "age_groups": ["5 years and older"],
                "dosage_schedule": ["2 doses primary series", "Booster doses as recommended"],
                "contraindications": ["Severe allergic reaction to vaccine components", "Previous severe reaction"],
                "side_effects": ["Arm soreness", "Fatigue", "Headache", "Fever", "Chills"],
                "effectiveness": "Highly effective against severe disease and hospitalization",
                "factsheet": "COVID-19 vaccines work by teaching the immune system to recognize and fight the virus that causes COVID-19. They significantly reduce the risk of severe illness, hospitalization, and death. The vaccines are safe and have been thoroughly tested in clinical trials."
            }
        ]
        
        # Insert sample data
        logger.info("Inserting sample supplements...")
        for supplement in sample_supplements:
            try:
                supplement_id = await db.insert_supplement(supplement)
                logger.info("Inserted supplement: %s (ID: %s)", supplement["name"], supplement_id)
            except Exception as e:
                logger.error("Failed to insert supplement %s: %s", supplement["name"], str(e))
        
        logger.info("Inserting sample medicines...")
        for medicine in sample_medicines:
            try:
                medicine_id = await db.insert_medicine(medicine)
                logger.info("Inserted medicine: %s (ID: %s)", medicine["name"], medicine_id)
            except Exception as e:
                logger.error("Failed to insert medicine %s: %s", medicine["name"], str(e))
        
        logger.info("Inserting sample vaccines...")
        for vaccine in sample_vaccines:
            try:
                vaccine_id = await db.insert_vaccine(vaccine)
                logger.info("Inserted vaccine: %s (ID: %s)", vaccine["name"], vaccine_id)
            except Exception as e:
                logger.error("Failed to insert vaccine %s: %s", vaccine["name"], str(e))
        
        logger.info("Sample data initialization completed successfully!")
        
    except Exception as e:
        logger.error("Failed to initialize sample data: %s", str(e))
        raise
    finally:
        await db.disconnect()
        logger.info("Disconnected from database")

async def main():
    """Main function"""
    try:
        await init_sample_data()
        print("✅ Sample data initialization completed successfully!")
        print("🚀 You can now test the factsheet search with queries like:")
        print("   • 'What is vitamin C?'")
        print("   • 'Tell me about aspirin'")
        print("   • 'Information about flu vaccine'")
        
    except Exception as e:
        logger.error("Sample data initialization failed: %s", str(e))
        print("❌ Sample data initialization failed. Check the logs for details.")

if __name__ == "__main__":
    asyncio.run(main())
