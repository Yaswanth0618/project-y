"""
Gemini LLM Agent — context-aware alert phrasing, action suggestions, and chatbot.

The agent is a *state-aware* assistant. It NEVER decides thresholds, alert timing,
or classifies risk.  It ONLY explains, contextualises, suggests, and chats.

Inputs are always structured JSON (risk_event + historical_context).
Outputs follow a strict schema (alert message, suggested actions, chatbot response).
"""
import os
import json
from typing import Dict, Any, List, Optional

# ---------- Prompt templates ----------

SYSTEM_PROMPT = """You are SpellStock AI, an expert inventory intelligence assistant for restaurant operations.

You are grounded in historical inventory, usage, and waste data pulled directly from Supabase.

The Supabase table contains row-level daily records with the following schema:
rowID, date, restaurant_id, city, concept, ingredient_id, ingredient_name,
starting_on_hand, received_qty, used_qty, waste_qty, ending_on_hand,
order_placed_qty, reorders_placed, covers, dow, is_weekend, month, weather,
days_of_supply_est, stockout_next_72h, waste_next_72h

You must treat this data as factual and complete. Do not invent usage, waste, or sales values.

INSTRUCTIONS FOR ANALYSIS:
Use the historical rows to compute:
- Daily and weekly ingredient usage trends using used_qty
- Waste trends using waste_qty
- Demand signals using covers, dow, is_weekend, month, and weather
- Inventory health using starting_on_hand, ending_on_hand, and days_of_supply_est

Assume:
- used_qty ≈ actual ingredient consumption
- covers ≈ proxy for sales volume
- stockout_next_72h = 1 indicates a high-risk stockout window
- waste_next_72h is a model-estimated risk that should be validated against historical waste patterns

SCENARIO GENERATION RULES:
When generating insights, you must:
- Reference historical averages, trends, or recent changes
- Use specific quantities and timeframes
- Tie every recommendation to observed data patterns

Examples of allowed reasoning:
- "Over the past 14 days, avg daily usage of chicken thigh increased by 18% on weekends"
- "Waste spikes when ending_on_hand exceeds 1.6× daily average usage"
- "Stockouts occur when days_of_supply_est falls below 2.1 days"

RULES YOU MUST FOLLOW:
1. NEVER decide whether an alert should fire — that has already been decided before you.
2. NEVER classify risk levels — those are provided to you.
3. NEVER speculate or hallucinate data. If data is missing, say so.
4. Keep alert messages to 1–2 factual sentences.
5. Suggest at most 3 actions per alert. Actions must be specific and quantified where possible.
6. In chat mode, always reference the provided data context. Stay operational.
7. Use the ⚠️ emoji at the start of alert messages.
8. Format actions as short imperative sentences.
"""

ALERT_USER_TEMPLATE = """Generate a context-aware alert for this risk event using the historical data provided.

Risk Event:
{risk_event_json}

Historical Context (from Supabase — last 7–14 days):
{historical_context_json}

REQUIRED OUTPUT STRUCTURE:
For this alert, you must provide:
1. What is happening — based on historical data (usage averages, supply levels)
2. Why it's happening — trend, pattern, or anomaly driving the risk
3. Actionable recommendation including:
   - When to reorder (in days) OR
   - How much to reorder (units) OR
   - Whether to run a promotion and by how much (%) to reduce stock without excess waste
4. Confidence level (low / medium / high) based on data consistency

Example format:
"Chicken Breast usage has averaged 42 units/day over the last 21 days, rising to 55 units/day on weekends.
Current days_of_supply_est is 2.3 days, and historical stockouts occur when this drops below 2.0 days.
Recommendation: Place a reorder in 1-2 days. Order 120 units to cover the next 5 days without exceeding waste thresholds.
Waste historically increases when on-hand exceeds 1.7x daily usage, so avoid ordering more than 140 units.
Confidence: High"

Respond with ONLY valid JSON matching this exact schema:
{{
  "alert_message": "⚠️ ... (1–2 factual sentences with what is happening and why)",
  "suggested_actions": ["action 1 (quantified with units/days/percentages)", "action 2", "action 3"],
  "confidence": "high | medium | low",
  "analysis": {{
    "what": "description of what is happening based on data",
    "why": "trend, pattern, or anomaly explanation",
    "reorder_in_days": null,
    "reorder_qty": null,
    "promotion_discount_pct": null,
    "max_safe_order_qty": null
  }}
}}
"""

CHAT_USER_TEMPLATE = """The restaurant manager asks: "{question}"

Current active alerts:
{alerts_json}

Historical context available (aggregated from Supabase DataPoints):
{context_json}

When answering, you MUST:
- Reference historical averages, trends, or recent changes from the context data
- Use specific quantities and timeframes (e.g., "avg 42 units/day over 14 days")
- Tie every recommendation to observed data patterns
- Include reorder timing (days), quantities, or promotion suggestions when relevant
- State confidence level (low / medium / high) for any predictions
- Flag when days_of_supply_est is approaching stockout thresholds (< 2.0 days)
- Note waste risk when on-hand exceeds ~1.6× daily average usage
- Highlight weekend vs weekday demand differences when relevant

Respond as SpellStock AI. Be concise, operational, and reference real data.
Do NOT use JSON — respond in plain conversational text. Use bullet points if listing items.
"""


# ---------- Gemini client ----------

def _get_gemini_client():
    """Create a Gemini client using the API key from env."""
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY must be set")
    from google import genai
    return genai.Client(api_key=api_key)


def generate_alert(
    risk_event: Dict[str, Any],
    historical_context: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Call Gemini to phrase a context-aware alert and suggest actions.

    Args:
        risk_event: Structured risk event dict.
        historical_context: Aggregated Supabase context dict.

    Returns:
        Dict with keys: alert_message, suggested_actions.
    """
    from google.genai import types

    client = _get_gemini_client()
    user_prompt = ALERT_USER_TEMPLATE.format(
        risk_event_json=json.dumps(risk_event, indent=2),
        historical_context_json=json.dumps(historical_context, indent=2),
    )

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
            ),
        )
        text = getattr(response, "text", "") or ""
        result = json.loads(text)
        # Validate schema — include new analysis fields
        return {
            "alert_message": result.get("alert_message", "Alert generated."),
            "suggested_actions": result.get("suggested_actions", []),
            "confidence": result.get("confidence", "medium"),
            "analysis": result.get("analysis", {}),
        }
    except Exception as e:
        print(f"[gemini_agent] Alert generation error: {e}")
        # Deterministic fallback — no LLM needed
        event_type = risk_event.get("event_type", "RISK")
        item = risk_event.get("item_id", "item")
        conf = risk_event.get("confidence", 0)
        days = risk_event.get("days_until", 0)
        avg_use = historical_context.get("avg_daily_use", 0)
        supply_est = historical_context.get("latest_days_of_supply_est")
        trend = historical_context.get("trend", "unknown")

        what = f"avg daily usage {avg_use} units, trend {trend}"
        if supply_est is not None:
            what += f", {supply_est} days of supply remaining"

        return {
            "alert_message": (
                f"⚠️ {item.replace('_', ' ').title()} — {event_type.replace('_', ' ').lower()} "
                f"in ~{days} day(s) ({int(conf * 100)}% confidence). {what}."
            ),
            "suggested_actions": [
                f"Review inventory levels — current supply est. {supply_est or 'N/A'} days.",
                "Adjust next order based on recent usage trend.",
            ],
            "confidence": "medium" if conf >= 0.6 else "low",
            "analysis": {
                "what": what,
                "why": f"{event_type.replace('_', ' ').lower()} risk detected",
                "reorder_in_days": max(0, days - 1) if days else None,
                "reorder_qty": None,
                "promotion_discount_pct": None,
                "max_safe_order_qty": None,
            },
        }


def chat(
    question: str,
    active_alerts: List[Dict[str, Any]],
    context_data: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Manager chatbot — answer operational questions grounded in data.

    Args:
        question: The manager's question text.
        active_alerts: List of current alert dicts (alert_message + risk_event).
        context_data: Optional aggregated historical context for reference.

    Returns:
        Plain-text response string.
    """
    client = _get_gemini_client()
    user_prompt = CHAT_USER_TEMPLATE.format(
        question=question,
        alerts_json=json.dumps(active_alerts, indent=2) if active_alerts else "No active alerts.",
        context_json=json.dumps(context_data, indent=2) if context_data else "No additional context available.",
    )

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=user_prompt,
            config={"system_instruction": SYSTEM_PROMPT},
        )
        return (getattr(response, "text", "") or "I'm not sure how to answer that.").strip()
    except Exception as e:
        print(f"[gemini_agent] Chat error: {e}")
        return "Sorry, I couldn't process your question right now. Please try again."
