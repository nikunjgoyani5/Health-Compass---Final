#!/usr/bin/env python3
"""
Initialize sample factsheet data for the health chatbot
"""

import asyncio
import sys
import os

# Add the current directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import db
from models import Factsheet
from datetime import datetime, timezone

async def init_factsheet_data():
    """Initialize sample factsheet data"""
    try:
        # Connect to database
        await db.connect()
        print("✅ Connected to database")
        
        # Sample factsheet data
        factsheets = [
            {
                "title": "Vitamin C (Ascorbic Acid)",
                "content": """Vitamin C, also known as ascorbic acid, is a water-soluble vitamin that plays a crucial role in maintaining good health. It is an essential nutrient that the body needs for various functions.

**Key Benefits:**
- Boosts immune system function
- Promotes healthy skin and wound healing
- Aids in iron absorption
- Acts as a powerful antioxidant
- Supports collagen production

**Food Sources:**
- Citrus fruits (oranges, lemons, grapefruits)
- Berries (strawberries, raspberries, blueberries)
- Bell peppers (especially red and yellow)
- Broccoli and Brussels sprouts
- Kiwi and papaya

**Recommended Daily Intake:**
- Adults: 65-90 mg per day
- Pregnant women: 85 mg per day
- Breastfeeding women: 120 mg per day

**Safety Notes:**
- Generally safe when taken in recommended amounts
- High doses may cause stomach upset
- Consult healthcare provider before starting supplements""",
                "summary": "Essential vitamin for immune support, skin health, and antioxidant protection",
                "keywords": ["vitamin c", "ascorbic acid", "immune system", "antioxidant", "collagen", "skin health"],
                "category": "supplement",
                "source": "NIH Office of Dietary Supplements",
                "last_updated": datetime.now(timezone.utc),
                "created_at": datetime.now(timezone.utc)
            },
            {
                "title": "Vitamin D3 (Cholecalciferol)",
                "content": """Vitamin D3, also known as cholecalciferol, is a crucial nutrient that helps regulate calcium and phosphate levels in the body. It plays a vital role in maintaining healthy bones, teeth, and muscles.

**Key Benefits:**
- Promotes calcium absorption for strong bones
- Supports immune system function
- Helps maintain muscle strength
- May reduce inflammation
- Supports cardiovascular health

**Natural Sources:**
- Sunlight exposure (UVB rays)
- Fatty fish (salmon, tuna, mackerel)
- Egg yolks
- Beef liver
- Fortified foods (milk, cereals)

**Recommended Daily Intake:**
- Adults: 600-800 IU per day
- Adults over 70: 800 IU per day
- May need more if limited sun exposure

**Safety Notes:**
- Safe when taken in recommended amounts
- Excessive intake can cause toxicity
- Blood levels should be monitored if taking high doses""",
                "summary": "Essential vitamin for bone health, immune function, and calcium regulation",
                "keywords": ["vitamin d3", "cholecalciferol", "bone health", "calcium", "immune system", "sunlight"],
                "category": "supplement",
                "source": "Mayo Clinic",
                "last_updated": datetime.now(timezone.utc),
                "created_at": datetime.now(timezone.utc)
            },
            {
                "title": "Omega-3 Fatty Acids",
                "content": """Omega-3 fatty acids are essential polyunsaturated fats that play important roles in brain function, heart health, and inflammation regulation. The three main types are ALA, EPA, and DHA.

**Key Benefits:**
- Supports heart health and reduces triglycerides
- Promotes brain development and function
- Reduces inflammation throughout the body
- Supports eye health and vision
- May improve mood and mental health

**Food Sources:**
- Fatty fish (salmon, sardines, mackerel)
- Flaxseeds and chia seeds
- Walnuts and almonds
- Soybeans and tofu
- Canola oil

**Recommended Daily Intake:**
- Adults: 250-500 mg EPA+DHA per day
- Pregnant women: 200-300 mg DHA per day
- May need more for specific health conditions

**Safety Notes:**
- Generally safe when taken as recommended
- High doses may increase bleeding risk
- Consult doctor if taking blood thinners""",
                "summary": "Essential fatty acids for heart health, brain function, and inflammation control",
                "keywords": ["omega-3", "fish oil", "epa", "dha", "heart health", "brain function", "inflammation"],
                "category": "supplement",
                "source": "American Heart Association",
                "last_updated": datetime.now(timezone.utc),
                "created_at": datetime.now(timezone.utc)
            },
            {
                "title": "Probiotics",
                "content": """Probiotics are live microorganisms that provide health benefits when consumed in adequate amounts. They are often called 'good bacteria' and help maintain a healthy balance in the gut microbiome.

**Key Benefits:**
- Supports digestive health and regularity
- Boosts immune system function
- May improve mental health and mood
- Helps maintain vaginal health
- Supports nutrient absorption

**Food Sources:**
- Yogurt and kefir
- Sauerkraut and kimchi
- Miso and tempeh
- Pickles (fermented)
- Some cheeses

**Recommended Daily Intake:**
- Varies by strain and product
- Typically 1-10 billion CFU per day
- Take with or without food as directed

**Safety Notes:**
- Generally safe for most people
- May cause mild digestive upset initially
- Consult doctor if you have a weakened immune system""",
                "summary": "Beneficial bacteria that support gut health, immunity, and overall wellness",
                "keywords": ["probiotics", "gut health", "digestive health", "immune system", "microbiome", "good bacteria"],
                "category": "supplement",
                "source": "Harvard Health",
                "last_updated": datetime.now(timezone.utc),
                "created_at": datetime.now(timezone.utc)
            }
        ]
        
        # Insert factsheets
        for factsheet_data in factsheets:
            try:
                factsheet_id = await db.insert_factsheet(factsheet_data)
                print(f"✅ Inserted factsheet: {factsheet_data['title']} (ID: {factsheet_id})")
            except Exception as e:
                print(f"❌ Failed to insert factsheet {factsheet_data['title']}: {e}")
        
        print(f"\n🎉 Successfully initialized {len(factsheets)} factsheets!")
        
    except Exception as e:
        print(f"❌ Error initializing factsheet data: {e}")
    finally:
        # Disconnect from database
        await db.disconnect()
        print("✅ Disconnected from database")

if __name__ == "__main__":
    print("🚀 Initializing sample factsheet data...")
    asyncio.run(init_factsheet_data())
