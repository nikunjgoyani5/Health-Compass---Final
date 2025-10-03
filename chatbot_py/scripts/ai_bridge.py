#!/usr/bin/env python3
"""
Node ↔ Python bridge: reads JSON from stdin and returns JSON to stdout.

Input example (via stdin):
  {"query": "What is vitamin C?"}

Output example:
  {"ok": true, "data": {...}}
"""

import sys
import json
import asyncio
import logging
from pathlib import Path


# Configure logging with lazy % formatting
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def _ensure_project_root_on_path() -> None:
    """Ensure the project root is importable when running from scripts/"""
    project_root = Path(__file__).resolve().parents[1]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))


_ensure_project_root_on_path()

# Now we can import project modules
try:
    from ai_service import AIService
    ai_service = AIService()
except Exception as e:
    # If imports fail, return a structured error to Node
    logger.error("Failed to import AI service: %s", str(e))
    print(json.dumps({"ok": False, "error": f"AI service initialization error: {str(e)}"}))
    sys.exit(0)


async def _handle_request(payload: dict) -> dict:
    """Process the incoming payload and call the AI service."""
    query: str = payload.get("query", "").strip()

    if not query:
        return {"ok": False, "error": "Missing 'query'"}

    # Optional future: inject supplement/medicine/vaccine context here
    # For now, just call the base AI response generator
    result = await ai_service.generate_response(query=query)
    return {"ok": True, "data": result}


def main() -> None:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw else {}

        response = asyncio.run(_handle_request(payload))
        print(json.dumps(response))
    except Exception as e:
        logger.error("Bridge error: %s", str(e))
        print(json.dumps({"ok": False, "error": str(e)}))


if __name__ == "__main__":
    main()


