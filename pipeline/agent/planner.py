"""
Agent Planner — Sense → Plan → Propose.

Reads live alerts + inventory state, calls Gemini in agentic mode to
produce a prioritised action queue, then validates and records every
proposed action.

This is the brain of the agentic loop.  It calls Gemini once per
planning cycle with the full operational picture.
"""
import json
import os
import traceback
from datetime import datetime
from typing import Any, Dict, List, Optional

from pipeline.agent.models import (
    ActionType,
    create_action,
    group_by_owner,
    prioritize_actions,
)
from pipeline.agent.prompts import (
    AGENT_FIX_USER_TEMPLATE,
    AGENT_PLAN_USER_TEMPLATE,
    AGENT_SYSTEM_PROMPT,
)
from pipeline.agent import audit


# ── Gemini client (reused from pipeline) ──────────────────────────────────────

def _get_gemini_client():
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY must be set")
    from google import genai
    return genai.Client(api_key=api_key)


# ── Internal helpers ──────────────────────────────────────────────────────────

_VALID_ACTION_TYPES = {at.value for at in ActionType}
_VALID_OWNER_ROLES = {"Purchasing", "Kitchen", "VendorOps"}
_VALID_RISK_LEVELS = {"low", "medium", "high"}


def _validate_raw_action(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Validate and normalise a single raw action dict from Gemini output."""
    action_type = raw.get("action_type", "")
    if action_type not in _VALID_ACTION_TYPES:
        return None

    owner = raw.get("owner_role", "Kitchen")
    if owner not in _VALID_OWNER_ROLES:
        owner = "Kitchen"

    risk = raw.get("risk_level", "medium")
    if risk not in _VALID_RISK_LEVELS:
        risk = "medium"

    payload = raw.get("payload", {})
    if not isinstance(payload, dict):
        payload = {}

    return create_action(
        action_type=action_type,
        payload=payload,
        owner_role=owner,
        risk_level=risk,
        expected_impact=raw.get("expected_impact", ""),
        reason=raw.get("reason", ""),
        source_alert_id=raw.get("source_alert_item"),
    )


def _parse_gemini_actions(text: str) -> List[Dict[str, Any]]:
    """Parse Gemini's JSON output into validated action list."""
    text = text.strip()

    # Strip markdown fences if Gemini wrapped output
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first and last fence lines
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()

    try:
        raw_list = json.loads(text)
    except json.JSONDecodeError:
        # Try to extract JSON array from mixed output
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1:
            try:
                raw_list = json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                return []
        else:
            return []

    if not isinstance(raw_list, list):
        raw_list = [raw_list]

    actions = []
    for raw in raw_list:
        if not isinstance(raw, dict):
            continue
        validated = _validate_raw_action(raw)
        if validated:
            actions.append(validated)

    return actions


# ── Deterministic fallback planner ────────────────────────────────────────────

def _fallback_plan(alerts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Generate a minimal action queue without Gemini (deterministic rules).
    Used when the LLM is unavailable.
    """
    actions = []
    for alert in alerts:
        ev = alert.get("risk_event", {})
        ctx = alert.get("historical_context", {})
        item = ev.get("item_id", "unknown")
        event_type = ev.get("event_type", "")
        confidence = ev.get("confidence", 0)
        days_until = ev.get("days_until", 99)
        avg_daily_use = ctx.get("avg_daily_use", 0)

        # Determine risk level
        if confidence >= 0.8 and days_until <= 2:
            risk = "high"
        elif confidence >= 0.6 or days_until <= 4:
            risk = "medium"
        else:
            risk = "low"

        if event_type == "STOCKOUT_RISK":
            # Draft PO
            reorder_qty = round(avg_daily_use * 5) if avg_daily_use > 0 else None
            max_safe = ctx.get("max_safe_order_qty")
            if reorder_qty and max_safe and reorder_qty > max_safe:
                reorder_qty = int(max_safe)

            actions.append(create_action(
                action_type="draft_po",
                payload={
                    "ingredient": item,
                    "quantity": reorder_qty,
                    "unit": "units",
                    "vendor": None,
                    "due_time": f"within {max(1, days_until - 1)} day(s)",
                    "notes": f"Avg daily use: {avg_daily_use}, supply est: {ctx.get('latest_days_of_supply_est', 'N/A')} days",
                },
                owner_role="Purchasing",
                risk_level=risk,
                expected_impact=f"Prevent stockout in ~{days_until} day(s) for {item.replace('_', ' ').title()}",
                reason=f"Stockout risk at {int(confidence * 100)}% confidence, {days_until} day(s) out. Trend: {ctx.get('trend', 'unknown')}.",
                source_alert_id=item,
            ))

            # Create kitchen check task
            actions.append(create_action(
                action_type="create_task",
                payload={
                    "ingredient": item,
                    "notes": "Verify actual on-hand count and report back.",
                    "due_time": "today",
                },
                owner_role="Kitchen",
                risk_level=risk,
                expected_impact="Accurate inventory count to validate ML prediction.",
                reason=f"ML predicts stockout for {item.replace('_', ' ').title()} — physical count needed.",
                source_alert_id=item,
            ))

        elif event_type == "SURPLUS_RISK":
            # Use-first task
            actions.append(create_action(
                action_type="create_task",
                payload={
                    "ingredient": item,
                    "notes": "Prioritise use in today's specials or prep. Consider small promotion.",
                    "due_time": "today",
                },
                owner_role="Kitchen",
                risk_level=risk,
                expected_impact=f"Reduce surplus/waste risk for {item.replace('_', ' ').title()}",
                reason=f"Surplus risk at {int(confidence * 100)}% confidence. Waste-to-use ratio: {ctx.get('waste_to_use_ratio', 'N/A')}.",
                source_alert_id=item,
            ))

            # Par adjustment (if usage declining)
            if ctx.get("trend") == "usage declining" and avg_daily_use > 0:
                actions.append(create_action(
                    action_type="adjust_par",
                    payload={
                        "ingredient": item,
                        "par_change_pct": -10,
                        "notes": "Usage declining — reduce par to align with demand.",
                    },
                    owner_role="Purchasing",
                    risk_level="low",
                    expected_impact="Reduce over-ordering by ~10%, cutting waste.",
                    reason=f"Usage trend is declining for {item.replace('_', ' ').title()}.",
                    source_alert_id=item,
                ))

    return prioritize_actions(actions)


# ── Public API ────────────────────────────────────────────────────────────────

def generate_plan(
    active_alerts: List[Dict[str, Any]],
    inventory_state: Optional[List[Dict[str, Any]]] = None,
    restaurant_id: str = "main",
    horizon_hours: int = 72,
    use_llm: bool = True,
) -> Dict[str, Any]:
    """
    Sense → Plan → Propose.

    1. Collects active alerts + inventory state.
    2. Fetches recent action history (for dedup / context).
    3. Calls Gemini in agentic mode to produce action queue.
    4. Validates, prioritises, records in audit log.

    Args:
        active_alerts: Current alerts from the pipeline.
        inventory_state: Optional current inventory snapshot.
        restaurant_id: Restaurant being planned for.
        horizon_hours: Planning horizon.
        use_llm: If False, use deterministic fallback only.

    Returns:
        Dict with action_queue, grouped_by_owner, and plan metadata.
    """
    if not active_alerts:
        return {
            "status": "no_alerts",
            "message": "No active alerts — no actions needed.",
            "action_queue": [],
            "grouped_by_owner": {},
            "plan_metadata": {
                "restaurant_id": restaurant_id,
                "planned_at": datetime.utcnow().isoformat() + "Z",
                "alerts_processed": 0,
                "actions_proposed": 0,
                "source": "none",
            },
        }

    # Fetch recent action history for dedup context
    recent_history = audit.get_recent_actions(limit=20)

    actions: List[Dict[str, Any]] = []

    if use_llm:
        try:
            actions = _plan_with_gemini(
                active_alerts, inventory_state, recent_history,
                restaurant_id, horizon_hours,
            )
        except Exception as e:
            print(f"[agent/planner] Gemini planning failed, using fallback: {e}")
            traceback.print_exc()
            actions = _fallback_plan(active_alerts)
            source = "fallback"
        else:
            source = "gemini"
    else:
        actions = _fallback_plan(active_alerts)
        source = "fallback"

    if use_llm and actions:
        source = "gemini"
    elif not use_llm:
        source = "fallback"

    # Prioritise
    actions = prioritize_actions(actions)

    # Record each proposed action in audit log
    for action in actions:
        audit.record(
            action_id=action["action_id"],
            event="proposed",
            action_snapshot=action,
            actor="agent-planner",
            notes=f"Source: {source}, restaurant: {restaurant_id}",
        )

    grouped = group_by_owner(actions)

    return {
        "status": "planned",
        "message": f"{len(actions)} action(s) proposed across {len(grouped)} role(s).",
        "action_queue": actions,
        "grouped_by_owner": grouped,
        "plan_metadata": {
            "restaurant_id": restaurant_id,
            "horizon_hours": horizon_hours,
            "planned_at": datetime.utcnow().isoformat() + "Z",
            "alerts_processed": len(active_alerts),
            "actions_proposed": len(actions),
            "source": source,
        },
    }


def generate_plan_from_command(
    command: str,
    active_alerts: List[Dict[str, Any]],
    inventory_state: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Handle operator commands like "Fix top 3 alerts" or "Draft PO for chicken".

    These commands trigger planning, not conversation.
    """
    if not active_alerts:
        return {
            "status": "no_alerts",
            "message": "No active alerts to act on.",
            "action_queue": [],
            "grouped_by_owner": {},
        }

    try:
        actions = _plan_with_command(command, active_alerts, inventory_state)
    except Exception as e:
        print(f"[agent/planner] Command planning failed: {e}")
        traceback.print_exc()
        # Fall back to standard planning
        return generate_plan(active_alerts, inventory_state)

    actions = prioritize_actions(actions)

    for action in actions:
        audit.record(
            action_id=action["action_id"],
            event="proposed",
            action_snapshot=action,
            actor="operator-command",
            notes=f"Command: {command}",
        )

    grouped = group_by_owner(actions)

    return {
        "status": "planned",
        "message": f"{len(actions)} action(s) proposed for command: '{command}'",
        "action_queue": actions,
        "grouped_by_owner": grouped,
        "plan_metadata": {
            "command": command,
            "planned_at": datetime.utcnow().isoformat() + "Z",
            "actions_proposed": len(actions),
            "source": "gemini-command",
        },
    }


# ── LLM planning internals ───────────────────────────────────────────────────

def _plan_with_gemini(
    alerts: List[Dict[str, Any]],
    inventory: Optional[List[Dict[str, Any]]],
    history: List[Dict[str, Any]],
    restaurant_id: str,
    horizon_hours: int,
) -> List[Dict[str, Any]]:
    """Call Gemini in agentic mode to generate the action queue."""
    from google.genai import types

    client = _get_gemini_client()

    user_prompt = AGENT_PLAN_USER_TEMPLATE.format(
        alerts_json=json.dumps(alerts, indent=2),
        inventory_json=json.dumps(inventory or [], indent=2),
        history_json=json.dumps(history[-10:], indent=2) if history else "[]",
        restaurant_id=restaurant_id,
        current_time=datetime.utcnow().isoformat() + "Z",
        horizon_hours=horizon_hours,
    )

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=AGENT_SYSTEM_PROMPT,
            response_mime_type="application/json",
        ),
    )

    text = getattr(response, "text", "") or ""
    return _parse_gemini_actions(text)


def _plan_with_command(
    command: str,
    alerts: List[Dict[str, Any]],
    inventory: Optional[List[Dict[str, Any]]],
) -> List[Dict[str, Any]]:
    """Call Gemini to resolve an operator command into actions."""
    from google.genai import types

    client = _get_gemini_client()

    user_prompt = AGENT_FIX_USER_TEMPLATE.format(
        command=command,
        alerts_json=json.dumps(alerts, indent=2),
        inventory_json=json.dumps(inventory or [], indent=2),
    )

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=AGENT_SYSTEM_PROMPT,
            response_mime_type="application/json",
        ),
    )

    text = getattr(response, "text", "") or ""
    return _parse_gemini_actions(text)
