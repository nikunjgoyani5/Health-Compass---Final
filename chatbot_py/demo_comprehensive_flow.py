#!/usr/bin/env python3
"""
Demo Comprehensive Query Flow

This script demonstrates how to use the new comprehensive query processing system
that implements intelligent query routing for health-related questions.
"""

import asyncio
import json
import sys
import os

# Add the current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from ai_service import AIService

async def demo_comprehensive_flow():
    """Demonstrate the comprehensive query flow with various examples"""
    
    print("🚀 Health Compass - Comprehensive Query Flow Demo")
    
    # Initialize AI service
    ai_service = AIService()
    print("=" * 60)
    print("This demo shows the intelligent query routing system that:")
    print("1. ✅ Detects health-related queries")
    print("2. 🔍 Searches factsheets in database")
    print("3. 🤖 Falls back to GPT-4 when data not found")
    print("4. 📅 Handles personal queries (medicine schedules)")
    print("5. 🚫 Blocks non-health topics")
    print("=" * 60)
    
    # Demo queries with explanations
    demo_queries = [
        {
            "title": "🚫 Non-Health Query (Blocked)",
            "query": "How do I write a Python function?",
            "explanation": "This should be blocked as it's not health-related"
        },
        {
            "title": "🔍 Health Factsheet Query (Database Found)",
            "query": "What is vitamin C?",
            "explanation": "This should find factsheet data in the database"
        },
        {
            "title": "🤖 Health Factsheet Query (GPT Fallback)",
            "query": "What is quercetin?",
            "explanation": "This should use GPT-4 fallback as data not in DB"
        },
        {
            "title": "📅 Personal Medicine Schedule Query",
            "query": "What is my medicine schedule on 2025-08-11?",
            "explanation": "This should redirect to medicine schedule endpoint"
        },
        {
            "title": "💊 General Health Query",
            "query": "What are the benefits of regular exercise?",
            "explanation": "This should be processed as a general health question"
        }
    ]
    
    for i, demo in enumerate(demo_queries, 1):
        print(f"\n{'='*60}")
        print(f"🎯 Demo {i}: {demo['title']}")
        print(f"{'='*60}")
        print(f"Query: '{demo['query']}'")
        print(f"Explanation: {demo['explanation']}")
        print(f"{'-'*60}")
        
        try:
            # Process the query using comprehensive flow
            print("🔄 Processing query...")
            response_data = await ai_service.process_comprehensive_query(
                query=demo['query']
            )
            
            # Display results
            print("✅ Response received!")
            print(f"Flow Summary: {response_data.get('flow_summary', 'No flow summary')}")
            print(f"Query Type: {response_data.get('metadata', {}).get('query_type', 'Unknown')}")
            print(f"Model Used: {response_data.get('metadata', {}).get('model_used', 'Unknown')}")
            print(f"Tokens Used: {response_data.get('metadata', {}).get('tokens_used', 'Unknown')}")
            
            # Show response preview
            response_text = response_data.get("response", "No response")
            print(f"\n📝 Response Preview:")
            print(f"{response_text[:200]}...")
            
            # Show disclaimer if present
            disclaimer = response_data.get("disclaimer", "")
            if disclaimer:
                print(f"\n⚠️ Disclaimer: {disclaimer}")
            
            # Show context if present
            supplement_context = response_data.get("supplement_context")
            medicine_context = response_data.get("medicine_context")
            vaccine_context = response_data.get("vaccine_context")
            
            if supplement_context:
                print(f"\n💊 Supplement Context: {supplement_context.get('name', 'Unknown')}")
            if medicine_context:
                print(f"\n💊 Medicine Context: {medicine_context.get('name', 'Unknown')}")
            if vaccine_context:
                print(f"\n💉 Vaccine Context: {vaccine_context.get('name', 'Unknown')}")
            
        except Exception as e:
            print(f"❌ Error processing query: {str(e)}")
        
        print(f"\n{'='*60}")
        
        # Pause between demos
        if i < len(demo_queries):
            print("⏸️ Press Enter to continue to next demo...")
            input()

async def demo_api_usage():
    """Show how to use the comprehensive endpoint via API"""
    
    print(f"\n{'='*60}")
    print("🌐 API Usage Examples")
    print(f"{'='*60}")
    
    print("The comprehensive query endpoint is available at:")
    print("POST /api/bot/comprehensive")
    
    print("\n📋 Example API Request:")
    example_request = {
        "query": "What is vitamin D?",
        "anon_token": "optional_anonymous_token"
    }
    print(json.dumps(example_request, indent=2))
    
    print("\n📋 Example API Response:")
    example_response = {
        "response": "Vitamin D is a fat-soluble vitamin...",
        "metadata": {
            "model_used": "gpt-4",
            "tokens_used": 150,
            "query_type": "supplement_specific",
            "flow_step": "factsheet_found"
        },
        "disclaimer": "This information is for educational purposes...",
        "flow_summary": "Factsheet found - Database data for vitamin D"
    }
    print(json.dumps(example_response, indent=2))
    
    print("\n🔧 Testing the endpoint:")
    print("1. Start the FastAPI server: python3 main.py")
    print("2. Send POST request to: http://localhost:8000/api/bot/comprehensive")
    print("3. Include the query in the request body")
    print("4. The system will automatically route your query through the appropriate flow")

async def demo_flow_diagram():
    """Show the flow diagram of the comprehensive query system"""
    
    print(f"\n{'='*60}")
    print("📊 Comprehensive Query Flow Diagram")
    print(f"{'='*60}")
    
    flow_diagram = """
    User Query
        ↓
    ┌─────────────────────────────────────────────────────────┐
    │ 🔍 STEP 1: Health-Related Check                        │
    │    • Use GPT to determine if query is health-related   │
    │    • If NOT health-related → Show off-topic message    │
    └─────────────────────────────────────────────────────────┘
        ↓ (if health-related)
    ┌─────────────────────────────────────────────────────────┐
    │ 🔍 STEP 2: Personal Query Detection                    │
    │    • Check if asking about medicine schedule           │
    │    • If personal query → Redirect to appropriate      │
    │      endpoint with guidance                            │
    └─────────────────────────────────────────────────────────┘
        ↓ (if not personal)
    ┌─────────────────────────────────────────────────────────┐
    │ 🔍 STEP 3: Factsheet Search Detection                  │
    │    • Check if asking "What is [name]?"                 │
    │    • If factsheet query → Search database              │
    │    • If found → Return structured data                 │
    │    • If not found → Use GPT-4 fallback                 │
    └─────────────────────────────────────────────────────────┘
        ↓ (if not factsheet search)
    ┌─────────────────────────────────────────────────────────┐
    │ 🔍 STEP 4: General Health Query                        │
    │    • Process as general health question                │
    │    • Use standard AI response generation               │
    └─────────────────────────────────────────────────────────┘
        ↓
    Response with Flow Summary
    """
    
    print(flow_diagram)

if __name__ == "__main__":
    print("🎉 Welcome to the Comprehensive Query Flow Demo!")
    
    try:
        # Run the main demo
        asyncio.run(demo_comprehensive_flow())
        
        # Show API usage
        asyncio.run(demo_api_usage())
        
        # Show flow diagram
        asyncio.run(demo_flow_diagram())
        
        print(f"\n{'='*60}")
        print("🎯 Demo Complete!")
        print("The comprehensive query system is now ready to use.")
        print("You can test it with the new endpoint: /api/bot/comprehensive")
        print(f"{'='*60}")
        
    except KeyboardInterrupt:
        print("\n⏹️ Demo interrupted by user")
    except Exception as e:
        print(f"\n💥 Demo error: {str(e)}")
        print("Make sure the AI service is properly configured with OpenAI API key")
