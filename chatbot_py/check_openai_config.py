#!/usr/bin/env python3
"""
OpenAI Configuration Checker
This script helps validate your OpenAI configuration and shows available models.
"""

import os
import openai
from dotenv import load_dotenv

def check_openai_config():
    """Check OpenAI configuration and available models"""
    print("🔍 Checking OpenAI Configuration...")
    print("=" * 50)
    
    # Load environment variables
    load_dotenv()
    
    # Check API key
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("❌ ERROR: OPENAI_API_KEY not found in environment")
        return False
    
    if api_key.startswith("sk-"):
        print("✅ OPENAI_API_KEY found and looks valid")
    else:
        print("⚠️  WARNING: OPENAI_API_KEY format looks unusual")
    
    # Check model
    model = os.getenv("OPENAI_MODEL", "gpt-4")
    print(f"📋 OPENAI_MODEL: {model}")
    
    # List of currently available models
    available_models = [
        "gpt-4", "gpt-4-turbo-preview", "gpt-4-32k",
        "gpt-3.5-turbo", "gpt-3.5-turbo-16k",
        "gpt-3.5-turbo-0613", "gpt-3.5-turbo-0301"
    ]
    
    if model in available_models:
        print(f"✅ Model '{model}' is valid and available")
    else:
        print(f"❌ ERROR: Model '{model}' is NOT available!")
        print(f"Available models: {', '.join(available_models)}")
        print(f"Recommendation: Change OPENAI_MODEL to 'gpt-4' or 'gpt-3.5-turbo'")
        return False
    
    # Test API connection
    try:
        client = openai.AsyncOpenAI(api_key=api_key)
        print("✅ OpenAI client created successfully")
        
        # Try a simple API call to test connection
        print("🧪 Testing API connection...")
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Hello"}],
            max_tokens=10
        )
        print("✅ API connection test successful!")
        return True
        
    except openai.AuthenticationError:
        print("❌ ERROR: Authentication failed - check your API key")
        return False
    except openai.BadRequestError as e:
        if "model" in str(e).lower():
            print(f"❌ ERROR: Invalid model '{model}' - {str(e)}")
        else:
            print(f"❌ ERROR: Bad request - {str(e)}")
        return False
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        return False

def fix_config():
    """Provide instructions to fix configuration"""
    print("\n🔧 How to Fix Configuration:")
    print("=" * 50)
    
    print("1. Create or update your .env file:")
    print("   OPENAI_MODEL=gpt-4")
    print("   OPENAI_API_KEY=your_actual_api_key_here")
    
    print("\n2. Available models you can use:")
    print("   - gpt-4 (recommended for best quality)")
    print("   - gpt-4-turbo-preview (faster, cheaper)")
    print("   - gpt-3.5-turbo (fastest, cheapest)")
    
    print("\n3. Restart your application after making changes")
    
    print("\n4. Test with a simple query:")
    print("   curl -X POST 'http://localhost:8000/api/bot/ask' \\")
    print("        -H 'Content-Type: application/json' \\")
    print("        -d '{\"query\": \"Hello\"}'")

if __name__ == "__main__":
    print("🚀 Health Compass AI - OpenAI Configuration Checker")
    print("=" * 60)
    
    success = check_openai_config()
    
    if not success:
        fix_config()
    else:
        print("\n🎉 Configuration looks good! You can now run your application.")
        print("   python main.py")
