"""
Alert Eligibility Logic — deterministic anti-spam for alerts.

Prevents alert fatigue by enforcing:
- One alert per ingredient per 24 hours.
- Re-alert only if confidence increases OR days_until decreases.

Alert history is stored in-memory (dict) and optionally persisted to JSON.
This module NEVER makes subjective decisions. It only applies timing rules.
"""
import json
import os
import time
from typing import List, Dict, Any, Optional


# In-memory alert history: { item_id: { "last_alert_ts": float, "confidence": float, "days_until": int } }
_alert_history: Dict[str, Dict[str, Any]] = {}

HISTORY_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "alert_history.json")
COOLDOWN_SECONDS = 24 * 60 * 60  # 24 hours


def _load_history() -> None:
    """Load persisted alert history from JSON file."""
    global _alert_history
    try:
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, "r") as f:
                _alert_history = json.load(f)
    except (json.JSONDecodeError, IOError):
        _alert_history = {}


def _save_history() -> None:
    """Persist alert history to JSON file."""
    try:
        with open(HISTORY_FILE, "w") as f:
            json.dump(_alert_history, f, indent=2)
    except IOError:
        pass


def reset_history() -> None:
    """Clear all alert history (useful for testing)."""
    global _alert_history
    _alert_history = {}
    if os.path.exists(HISTORY_FILE):
        os.remove(HISTORY_FILE)


def filter_eligible_alerts(
    risk_events: List[Dict[str, Any]],
    now: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """
    Filter risk events to only those eligible for alerting.

    Eligibility rules (deterministic):
    1. No alert sent for this ingredient in the last 24 hours, OR
    2. Confidence has increased since last alert, OR
    3. days_until has decreased since last alert.

    Args:
        risk_events: List of Risk Events that passed the rule engine.
        now: Current timestamp (defaults to time.time()). Overridable for testing.

    Returns:
        List of Risk Events eligible for alert generation.
    """
    if now is None:
        now = time.time()

    _load_history()

    eligible = []
    for event in risk_events:
        item_id = event.get("item_id", "")
        confidence = event.get("confidence", 0)
        days_until = event.get("days_until", 999)

        prev = _alert_history.get(item_id)

        if prev is None:
            # Never alerted — eligible
            eligible.append(event)
        else:
            elapsed = now - prev.get("last_alert_ts", 0)
            prev_confidence = prev.get("confidence", 0)
            prev_days = prev.get("days_until", 999)

            if elapsed >= COOLDOWN_SECONDS:
                # Cooldown expired — eligible
                eligible.append(event)
            elif confidence > prev_confidence:
                # Confidence increased — re-alert
                eligible.append(event)
            elif days_until < prev_days:
                # Situation more urgent — re-alert
                eligible.append(event)
            # else: suppressed (spam prevention)

    # Update history for eligible alerts
    for event in eligible:
        item_id = event["item_id"]
        _alert_history[item_id] = {
            "last_alert_ts": now,
            "confidence": event["confidence"],
            "days_until": event["days_until"],
        }

    _save_history()
    return eligible
