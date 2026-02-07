"""
Rule Engine — deterministic rule evaluation for Risk Events.

Applies configurable rules from rules.json to filter risk events.
Rules include minimum confidence, maximum days-out window, and ignored ingredients.

This module NEVER makes subjective decisions. It only applies pass/fail rules.
"""
import json
import os
from typing import List, Dict, Any, Optional


DEFAULT_RULES = {
    "min_confidence": 0.6,
    "max_days_out": 7,
    "ignored_ingredients": [],
    "restaurant_id": "main",
}


def load_rules(filepath: Optional[str] = None) -> Dict[str, Any]:
    """Load rule configuration from rules.json."""
    if filepath is None:
        filepath = os.path.join(os.path.dirname(os.path.dirname(__file__)), "rules.json")
    try:
        with open(filepath, "r") as f:
            rules = json.load(f)
        # Merge with defaults for any missing keys
        merged = {**DEFAULT_RULES, **rules}
        return merged
    except (FileNotFoundError, json.JSONDecodeError):
        return DEFAULT_RULES.copy()


def apply_rules(
    risk_events: List[Dict[str, Any]],
    rules: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Filter risk events through the rule engine.

    Rules (all deterministic):
    1. Confidence must meet minimum threshold.
    2. days_until must be within the max_days_out window.
    3. Ignored ingredients are dropped.

    Args:
        risk_events: List of Risk Event dicts from the generator.
        rules: Rule configuration dict. Loaded from rules.json if None.

    Returns:
        List of Risk Events that passed all rules.
    """
    if rules is None:
        rules = load_rules()

    min_confidence = rules.get("min_confidence", 0.6)
    max_days_out = rules.get("max_days_out", 7)
    ignored = set(rules.get("ignored_ingredients", []))

    passed = []
    for event in risk_events:
        # Rule 1: minimum confidence
        if event.get("confidence", 0) < min_confidence:
            continue

        # Rule 2: maximum days-out window
        if event.get("days_until", 0) > max_days_out:
            continue

        # Rule 3: ignored ingredients
        if event.get("item_id", "") in ignored:
            continue

        passed.append(event)

    return passed
