#!/usr/bin/env python3
"""
Clear test conversation states from database
"""

import asyncio
from database import Database

async def clear_test_states():
    try:
        db = Database()
        await db.connect()
        
        # Delete specific test tokens
        test_tokens = [
            "test_field_order_123",
            "test_token_debug",
            "test_token_1234",
            "test_exact_123",
            "test_rapid_123"
        ]
        
        for token in test_tokens:
            try:
                await db.delete_conversation_state(token)
                print(f"✅ Cleared state for token: {token}")
            except Exception as e:
                print(f"⚠️ Could not clear {token}: {e}")
        
        print("✅ Test state cleanup completed!")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(clear_test_states())
