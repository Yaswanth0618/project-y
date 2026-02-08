"""
SpellStock Intelligence Layer: transform human intent into simulation parameters.
Uses Gemini API when available; falls back to baseline otherwise.
"""
import os
import json

VALID_HOURS = (24, 48, 72)
SYSTEM_INSTRUCTION = """You are the high-fidelity Intelligence Layer for SpellStock.
Your job is to transform human intent into structured simulation parameters.

Rules:
1. horizon_hours MUST be exactly 24, 48, or 72.
2. demand_multiplier MUST be between 0.5 (low) and 2.5 (extreme spike).
3. notes MUST be a short, high-fidelity description (max 6 words).
4. Use material-inspired language for notes (e.g., "Volatile weekend surge", "Calm reservoir state").

Output MUST be valid JSON with keys: horizon_hours (int), demand_multiplier (float), notes (string)."""


def parse_scenario(user_input: str) -> dict:
    """Parse scenario text into structured params. Uses Gemini if API key set."""
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("API_KEY")
    try:
        if api_key:
            try:
                import google.generativeai as genai
                # For newer versions, use this instead:
                # from google import genai
                # from google.genai import types
            except ImportError:
                result = {}
                api_key = None
            if api_key:
                client = genai.Client(api_key=api_key)
                response = client.models.generate_content(
                    model="gemini-2.0-flash",
                    contents=user_input,
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_INSTRUCTION,
                        response_mime_type="application/json",
                    ),
                )
                text = getattr(response, "text", None) or ""
                result = json.loads(text or "{}")
        else:
            result = {}
    except Exception as e:
        print("Gemini Intel Layer Error:", e)
        result = {}

    hours = result.get("horizon_hours", 72)
    if hours not in VALID_HOURS:
        hours = 72
    multiplier = float(result.get("demand_multiplier", 1.0))
    multiplier = max(0.5, min(2.5, multiplier))
    notes = result.get("notes") or "Auto-calibrated baseline"

    return {
        "horizon_hours": hours,
        "demand_multiplier": multiplier,
        "notes": notes,
    }
