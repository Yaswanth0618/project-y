"""
Supabase Integration — historical context retrieval for Risk Events.

Queries the Supabase `data_points` table for the last 7–14 days of data
for a given restaurant + ingredient, then aggregates usage velocity,
waste trends, covers vs inventory, and weekend vs weekday behavior.

Backend-only: uses service_role key.  All secrets loaded from env vars.

This module retrieves and summarises data. It does NOT interpret or decide.
"""
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

# ---------- Supabase client setup ----------

_supabase_client = None


def _get_client():
    """Lazy-initialise the Supabase client (backend service_role)."""
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

    from supabase import create_client
    _supabase_client = create_client(url, key)
    return _supabase_client


# ---------- Query helpers ----------

def _get_latest_date(client) -> Optional[str]:
    """Find the most recent date in the DataPoints table."""
    try:
        resp = client.table("DataPoints").select("date").order("date", desc=True).limit(1).execute()
        if resp.data:
            return resp.data[0]["date"]
    except Exception as e:
        print(f"[supabase_client] Could not fetch latest date: {e}")
    return None


def fetch_ingredient_history(
    ingredient_id: str,
    restaurant_id: Any = 1,
    days_back: int = 14,
) -> List[Dict[str, Any]]:
    """
    Pull the last `days_back` days of DataPoints rows for a specific
    restaurant and ingredient.

    Uses the latest available date in the table as the reference point
    (not utcnow) so historical datasets are always queryable.

    Returns raw rows as list of dicts (may be empty).
    """
    client = _get_client()

    # Determine reference date: latest row in table, fallback to utcnow
    latest_date_str = _get_latest_date(client)
    if latest_date_str:
        try:
            reference_date = datetime.strptime(latest_date_str, "%Y-%m-%d")
        except ValueError:
            reference_date = datetime.utcnow()
    else:
        reference_date = datetime.utcnow()

    cutoff = (reference_date - timedelta(days=days_back)).strftime("%Y-%m-%d")

    # Build base query — restaurant_id is bigint in DB, always cast to int
    query = client.table("DataPoints").select("*")

    try:
        rid = int(restaurant_id)
    except (ValueError, TypeError):
        rid = 1  # fallback to default restaurant
    query = query.eq("restaurant_id", rid)

    # Match ingredient by name (ingredient_name is text, ingredient_id may be int)
    # Convert classifier item_id (e.g. "chicken_breast") to a search pattern
    search_name = ingredient_id.replace("_", " ")
    query = query.ilike("ingredient_name", f"%{search_name}%")

    response = (
        query
        .gte("date", cutoff)
        .order("date", desc=False)
        .limit(100)
        .execute()
    )
    return response.data if response.data else []


def aggregate_context(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build a historical-context summary from raw data_points rows.

    Returns a dict ready to be injected into the Gemini prompt.
    All calculations are deterministic arithmetic — no ML.
    """
    if not rows:
        return {
            "avg_daily_use": 0,
            "avg_daily_waste": 0,
            "last_week_covers": 0,
            "trend": "no data",
            "is_weekend_approaching": _is_weekend_approaching(),
            "weather_pattern": "unknown",
            "days_of_data": 0,
        }

    n = len(rows)

    # ---- Usage velocity ----
    total_used = sum(float(r.get("used_qty", 0) or 0) for r in rows)
    avg_daily_use = round(total_used / n, 2)

    # ---- Waste trend ----
    total_waste = sum(float(r.get("waste_qty", 0) or 0) for r in rows)
    avg_daily_waste = round(total_waste / n, 2)

    # ---- Covers ----
    total_covers = sum(int(r.get("covers", 0) or 0) for r in rows)
    # Last-7-day covers
    last_7 = rows[-7:] if len(rows) >= 7 else rows
    last_week_covers = sum(int(r.get("covers", 0) or 0) for r in last_7)

    # ---- Usage trend (simple: compare first half vs second half) ----
    mid = n // 2 or 1
    first_half_use = sum(float(r.get("used_qty", 0) or 0) for r in rows[:mid]) / mid
    second_half_use = sum(float(r.get("used_qty", 0) or 0) for r in rows[mid:]) / max(n - mid, 1)
    if second_half_use > first_half_use * 1.10:
        trend = "usage increasing"
    elif second_half_use < first_half_use * 0.90:
        trend = "usage declining"
    else:
        trend = "usage stable"

    # ---- Weekend vs weekday ----
    weekend_rows = [r for r in rows if r.get("is_weekend") in (True, 1, "1")]
    weekday_rows = [r for r in rows if r.get("is_weekend") in (False, 0, "0")]
    weekend_avg_use = (
        sum(float(r.get("used_qty", 0) or 0) for r in weekend_rows) / max(len(weekend_rows), 1)
    )
    weekday_avg_use = (
        sum(float(r.get("used_qty", 0) or 0) for r in weekday_rows) / max(len(weekday_rows), 1)
    )

    # ---- Weather (mode of recent entries) ----
    weather_vals = [r.get("weather", "") for r in rows[-7:] if r.get("weather")]
    weather_pattern = _mode(weather_vals) if weather_vals else "unknown"

    # ---- Days of supply estimate (latest row) ----
    latest_supply_est = rows[-1].get("days_of_supply_est", None)

    # ---- Stockout risk indicators ----
    stockout_flags = [r for r in rows if r.get("stockout_next_72h") in (1, True, "1")]
    stockout_rate = round(len(stockout_flags) / n, 2)

    # ---- Waste-to-use ratio ----
    waste_to_use_ratio = round(total_waste / total_used, 3) if total_used > 0 else 0

    # ---- Waste spike threshold: ending_on_hand vs daily avg use ----
    waste_spike_rows = [
        r for r in rows
        if float(r.get("ending_on_hand", 0) or 0) > avg_daily_use * 1.6
        and float(r.get("waste_qty", 0) or 0) > avg_daily_waste * 1.3
    ]
    waste_spike_ratio = round(len(waste_spike_rows) / max(n, 1), 2)

    # ---- Latest ending_on_hand and on-hand-to-use ratio ----
    latest_ending_on_hand = float(rows[-1].get("ending_on_hand", 0) or 0)
    on_hand_to_daily_use = round(latest_ending_on_hand / avg_daily_use, 2) if avg_daily_use > 0 else None

    # ---- Reorder history ----
    total_reorders = sum(int(r.get("reorders_placed", 0) or 0) for r in rows)
    avg_order_qty = 0
    order_rows = [r for r in rows if float(r.get("order_placed_qty", 0) or 0) > 0]
    if order_rows:
        avg_order_qty = round(
            sum(float(r.get("order_placed_qty", 0) or 0) for r in order_rows) / len(order_rows), 1
        )

    # ---- Weekly usage breakdown (last 7 days vs prior 7 days) ----
    last_7 = rows[-7:] if len(rows) >= 7 else rows
    prior_7 = rows[-14:-7] if len(rows) >= 14 else []
    last_7_avg_use = round(
        sum(float(r.get("used_qty", 0) or 0) for r in last_7) / max(len(last_7), 1), 2
    )
    prior_7_avg_use = round(
        sum(float(r.get("used_qty", 0) or 0) for r in prior_7) / max(len(prior_7), 1), 2
    ) if prior_7 else None
    week_over_week_change_pct = None
    if prior_7_avg_use and prior_7_avg_use > 0:
        week_over_week_change_pct = round(
            ((last_7_avg_use - prior_7_avg_use) / prior_7_avg_use) * 100, 1
        )

    # ---- Max safe order qty (avoid exceeding 1.6x daily avg in on-hand) ----
    max_safe_order_qty = None
    if avg_daily_use > 0:
        target_days = 5
        max_on_hand_safe = avg_daily_use * 1.6
        max_safe_order_qty = round(max(target_days * avg_daily_use, max_on_hand_safe), 0)

    return {
        "avg_daily_use": avg_daily_use,
        "avg_daily_waste": avg_daily_waste,
        "waste_to_use_ratio": waste_to_use_ratio,
        "last_week_covers": last_week_covers,
        "total_covers": total_covers,
        "trend": trend,
        "is_weekend_approaching": _is_weekend_approaching(),
        "weather_pattern": weather_pattern,
        "days_of_data": n,
        "weekend_avg_use": round(weekend_avg_use, 2),
        "weekday_avg_use": round(weekday_avg_use, 2),
        "latest_days_of_supply_est": latest_supply_est,
        "latest_ending_on_hand": latest_ending_on_hand,
        "on_hand_to_daily_use_ratio": on_hand_to_daily_use,
        "stockout_risk_rate": stockout_rate,
        "waste_spike_ratio": waste_spike_ratio,
        "total_reorders": total_reorders,
        "avg_order_qty": avg_order_qty,
        "last_7_avg_use": last_7_avg_use,
        "prior_7_avg_use": prior_7_avg_use,
        "week_over_week_change_pct": week_over_week_change_pct,
        "max_safe_order_qty": max_safe_order_qty,
    }


# ---------- Utilities ----------

def _mode(values: list):
    """Return the most common element in a list."""
    from collections import Counter
    if not values:
        return None
    c = Counter(values)
    return c.most_common(1)[0][0]


def _is_weekend_approaching() -> bool:
    """Return True if today is Thursday (3) or Friday (4)."""
    return datetime.utcnow().weekday() in (3, 4)


def get_historical_context(
    item_id: str,
    restaurant_id: Any = 1,
    days_back: int = 14,
) -> Dict[str, Any]:
    """
    High-level helper: fetch rows then aggregate into a context dict.
    Falls back gracefully if Supabase is unreachable.
    """
    try:
        rows = fetch_ingredient_history(item_id, restaurant_id, days_back)
        return aggregate_context(rows)
    except Exception as e:
        print(f"[supabase_client] Error fetching context for {item_id}: {e}")
        return {
            "avg_daily_use": 0,
            "avg_daily_waste": 0,
            "last_week_covers": 0,
            "trend": "no data",
            "is_weekend_approaching": _is_weekend_approaching(),
            "weather_pattern": "unknown",
            "days_of_data": 0,
            "error": str(e),
        }
