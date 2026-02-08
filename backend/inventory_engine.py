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
        
        # Calculate avgDailyUse based on current stock and a simulated usage pattern
        # Using a base daily usage that varies by index to create diversity across items
        # Formula: (index * 0.7 + 2.5) creates values ranging from 2.5 to ~8.1 for 8 items
        BASE_USAGE_OFFSET = 2.5  # Minimum daily usage
        USAGE_VARIANCE_FACTOR = 0.7  # Multiplier for index-based variance
        base_daily_use = (index * USAGE_VARIANCE_FACTOR + BASE_USAGE_OFFSET) * demand_multiplier
        avg_daily_use = round(base_daily_use, 1)
        
        # Calculate daysOfSupply based on currentStock and avgDailyUse
        # If usage is 0, treat as very high supply (999 days) rather than 0
        days_of_supply = round(item["currentStock"] / avg_daily_use, 1) if avg_daily_use > 0 else 999
        
        out.append({
            "id": f"item-{index}",
            "name": item["name"],
            "ingredient": item["name"],  # Add ingredient field for table display
            "currentStock": item["currentStock"],
            "unit": item["unit"],
            "riskPercent": round(calculated_risk),
            "status": status,
            "reason": reason,
            "avgDailyUse": avg_daily_use,
            "daysOfSupply": days_of_supply,
        })
    out.sort(key=lambda x: x["riskPercent"], reverse=True)
    return out
