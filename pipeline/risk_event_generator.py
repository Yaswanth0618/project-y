"""
Risk Event Generator — deterministic conversion of classifier outputs into Risk Events.

Reads classifier_output.txt (one JSON object per line) and converts each prediction
into a structured Risk Event by selecting the dominant probability and applying
confidence thresholds.

This module NEVER makes subjective decisions. It only transforms data shapes.
"""
import json
import os
from typing import List, Dict, Any, Optional


def load_classifier_output(filepath: Optional[str] = None) -> List[Dict[str, Any]]:
    """Load classifier predictions from file. Each line is one JSON object."""
    if filepath is None:
        filepath = os.path.join(os.path.dirname(os.path.dirname(__file__)), "classifier_output.txt")
    predictions = []
    with open(filepath, "r") as f:
        for line in f:
            line = line.strip()
            if line:
                predictions.append(json.loads(line))
    return predictions


def generate_risk_events(
    predictions: List[Dict[str, Any]],
    confidence_threshold: float = 0.6,
) -> List[Dict[str, Any]]:
    """
    Convert classifier outputs into Risk Events.

    Rules (deterministic):
    1. Choose the dominant probability (stockout vs surplus).
    2. Apply confidence threshold — drop items below it.
    3. Return structured Risk Event objects.

    Args:
        predictions: List of classifier output dicts with stockout_probability,
                     surplus_probability, days_until_event, item_id, expected_units.
        confidence_threshold: Minimum probability to qualify as a risk event.

    Returns:
        List of Risk Event dicts.
    """
    events = []
    for pred in predictions:
        stockout_prob = pred.get("stockout_probability", 0.0)
        surplus_prob = pred.get("surplus_probability", 0.0)

        # Choose dominant probability
        if stockout_prob >= surplus_prob:
            event_type = "STOCKOUT_RISK"
            confidence = stockout_prob
        else:
            event_type = "SURPLUS_RISK"
            confidence = surplus_prob

        # Apply confidence threshold — drop items below it
        if confidence < confidence_threshold:
            continue

        events.append({
            "event_type": event_type,
            "item_id": pred["item_id"],
            "confidence": round(confidence, 2),
            "days_until": pred.get("days_until_event", 0),
            "metadata": {
                "expected_units": pred.get("expected_units", 0),
                "stockout_probability": stockout_prob,
                "surplus_probability": surplus_prob,
            },
        })

    return events
