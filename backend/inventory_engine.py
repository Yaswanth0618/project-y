"""
SpellStock inventory risk simulation. Produces risk-percent and status per ingredient.
"""
from typing import List, Dict, Any

BASE_INVENTORY = [
    {"name": "Fresh Salmon", "currentStock": 12, "unit": "kg", "reason": "High perishability"},
    {"name": "Avocados", "currentStock": 45, "unit": "units", "reason": "Rapid ripening"},
    {"name": "Whole Milk", "currentStock": 20, "unit": "liters", "reason": "Daily usage peak"},
    {"name": "Sourdough Bread", "currentStock": 8, "unit": "loaves", "reason": "Short shelf life"},
    {"name": "Chicken Breast", "currentStock": 50, "unit": "kg", "reason": "Steady demand"},
    {"name": "Heavy Cream", "currentStock": 15, "unit": "liters", "reason": "Low stock alert"},
    {"name": "Cherry Tomatoes", "currentStock": 5, "unit": "kg", "reason": "Critically low"},
    {"name": "Unsalted Butter", "currentStock": 12, "unit": "kg", "reason": "Baking dependency"},
]


def _status(risk: float) -> str:
    if risk > 85:
        return "CRITICAL"
    if risk > 65:
        return "HIGH"
    if risk > 35:
        return "MODERATE"
    return "LOW"


def simulate_risk(params: Dict[str, Any]) -> List[Dict[str, Any]]:
    demand_multiplier = params.get("demand_multiplier", 1.0)
    horizon_hours = params.get("horizon_hours", 72)

    out = []
    for index, item in enumerate(BASE_INVENTORY):
        base_risk = (index * 13) % 40 + 10
        calculated_risk = base_risk * demand_multiplier
        calculated_risk += (horizon_hours / 24) * 10
        calculated_risk = min(100, max(5, calculated_risk))
        status = _status(calculated_risk)
        reason = item.get("reason") or ""
        if demand_multiplier > 1.3 and status == "CRITICAL":
            reason = f"Spike in demand exceeds {horizon_hours}h supply"
        out.append({
            "id": f"item-{index}",
            "name": item["name"],
            "currentStock": item["currentStock"],
            "unit": item["unit"],
            "riskPercent": round(calculated_risk),
            "status": status,
            "reason": reason,
        })
    out.sort(key=lambda x: x["riskPercent"], reverse=True)
    return out
