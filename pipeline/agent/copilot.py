"""
Agent Copilot — A REAL Gemini-powered autonomous agent with tool calling.

Unlike the static planner that does one Gemini call → flat JSON, the Copilot
runs a multi-turn reasoning loop:

    User message → Gemini thinks → calls tools → observes results → thinks again
    → calls more tools (or responds) → ... → final answer + proposed actions

Gemini decides WHICH tools to use, WHEN to use them, and HOW to chain them.
The agent shows its thinking process transparently.

Tools available to the agent:
  - check_inventory: Look up current stock levels for an ingredient
  - get_alerts: Retrieve active ML risk alerts
  - get_historical_data: Pull Supabase historical usage/waste data
  - draft_purchase_order: Create a draft PO for an ingredient
  - create_task: Assign a task to Kitchen or Purchasing
  - adjust_par_level: Change par levels for an ingredient
  - analyze_trend: Analyze usage trend for an ingredient
  - get_action_queue: See all current proposed/executed actions
  - execute_action: Execute an approved action
"""

import json
import os
import traceback
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pipeline.agent.models import (
    ActionType,
    create_action,
    prioritize_actions,
)
from pipeline.agent import audit
from pipeline.agent.executor import (
    store_actions,
    get_all_actions,
    get_action,
    execute_action,
    approve_action,
    reject_action,
    rollback_action,
    auto_approve_and_execute,
)


# ── Gemini client ─────────────────────────────────────────────────────────────

def _get_gemini_client():
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY must be set")
    from google import genai
    return genai.Client(api_key=api_key)


# ── Tool Definitions (Gemini function declarations) ──────────────────────────

TOOL_DECLARATIONS = [
    {
        "name": "check_inventory",
        "description": "Check current stock levels, days of supply, and risk status for a specific ingredient or all ingredients. Use this to understand what's on hand before making decisions.",
        "parameters": {
            "type": "object",
            "properties": {
                "ingredient": {
                    "type": "string",
                    "description": "Ingredient name to look up (e.g., 'chicken_breast', 'lettuce'). Use 'all' to get a summary of all items.",
                },
            },
            "required": ["ingredient"],
        },
    },
    {
        "name": "get_alerts",
        "description": "Retrieve the current active ML-generated risk alerts. These are stockout and surplus warnings from the prediction pipeline. Always check alerts first to understand the current risk landscape.",
        "parameters": {
            "type": "object",
            "properties": {
                "filter_type": {
                    "type": "string",
                    "description": "Filter alerts by type: 'stockout', 'surplus', or 'all'.",
                    "enum": ["stockout", "surplus", "all"],
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_historical_data",
        "description": "Pull historical usage, waste, and supply data from Supabase for a specific ingredient. Use this to analyze trends, compute averages, and make data-backed decisions about reorder quantities.",
        "parameters": {
            "type": "object",
            "properties": {
                "ingredient": {
                    "type": "string",
                    "description": "The ingredient to get historical data for.",
                },
                "days": {
                    "type": "integer",
                    "description": "Number of days of history to retrieve (default: 14).",
                },
            },
            "required": ["ingredient"],
        },
    },
    {
        "name": "draft_purchase_order",
        "description": "Create a DRAFT purchase order for an ingredient. This does NOT send the order — it proposes it for human review. Use historical data to calculate the right quantity. Always explain your reasoning.",
        "parameters": {
            "type": "object",
            "properties": {
                "ingredient": {
                    "type": "string",
                    "description": "The ingredient to order.",
                },
                "quantity": {
                    "type": "number",
                    "description": "Number of units to order. Base this on avg_daily_use × days_to_cover.",
                },
                "unit": {
                    "type": "string",
                    "description": "Unit of measurement (e.g., 'units', 'kg', 'liters').",
                },
                "urgency": {
                    "type": "string",
                    "description": "How urgent: 'today', 'within 24h', 'within 48h', 'this week'.",
                },
                "reason": {
                    "type": "string",
                    "description": "Data-backed justification for this order.",
                },
            },
            "required": ["ingredient", "quantity", "reason"],
        },
    },
    {
        "name": "create_kitchen_task",
        "description": "Assign a task to the kitchen team (physical inventory count, use-first rotation, prep adjustment, etc.). Tasks are immediately visible to staff.",
        "parameters": {
            "type": "object",
            "properties": {
                "ingredient": {
                    "type": "string",
                    "description": "The ingredient this task is about.",
                },
                "task_description": {
                    "type": "string",
                    "description": "Clear, actionable description of what needs to be done.",
                },
                "priority": {
                    "type": "string",
                    "description": "Priority level: 'low', 'medium', 'high'.",
                    "enum": ["low", "medium", "high"],
                },
                "due": {
                    "type": "string",
                    "description": "When this should be done: 'immediately', 'today', 'tomorrow'.",
                },
            },
            "required": ["ingredient", "task_description", "priority"],
        },
    },
    {
        "name": "adjust_par_level",
        "description": "Propose a par level adjustment for an ingredient. Par levels are reorder thresholds. Adjustments > 10% require human approval. Base changes on usage trend data.",
        "parameters": {
            "type": "object",
            "properties": {
                "ingredient": {
                    "type": "string",
                    "description": "The ingredient to adjust par for.",
                },
                "change_percent": {
                    "type": "number",
                    "description": "Percentage to change par level by (positive = increase, negative = decrease).",
                },
                "reason": {
                    "type": "string",
                    "description": "Data-backed reason for this adjustment.",
                },
            },
            "required": ["ingredient", "change_percent", "reason"],
        },
    },
    {
        "name": "analyze_trend",
        "description": "Perform a quick trend analysis on an ingredient's usage pattern. Returns whether usage is increasing, decreasing, or stable, plus weekend vs weekday patterns.",
        "parameters": {
            "type": "object",
            "properties": {
                "ingredient": {
                    "type": "string",
                    "description": "The ingredient to analyze.",
                },
            },
            "required": ["ingredient"],
        },
    },
    {
        "name": "get_action_queue",
        "description": "View the current action queue — all proposed, approved, executed, or rejected actions. Use this to check what has already been done to avoid duplicates.",
        "parameters": {
            "type": "object",
            "properties": {
                "status_filter": {
                    "type": "string",
                    "description": "Filter by status: 'proposed', 'approved', 'executed', 'rejected', or 'all'.",
                    "enum": ["proposed", "approved", "executed", "rejected", "all"],
                },
            },
            "required": [],
        },
    },
    {
        "name": "query_actions",
        "description": "Search and filter the action queue by any combination of criteria: owner (Kitchen, Purchasing, VendorOps), action type (draft_po, create_task, adjust_par, etc.), status (proposed, approved, executed, rejected, rolled_back), ingredient name, risk level (low, medium, high), or reason keywords. Use this whenever a user asks about specific actions — e.g. 'show kitchen tasks', 'what POs are pending?', 'actions for chicken', 'high risk actions'. Returns matching actions with full details.",
        "parameters": {
            "type": "object",
            "properties": {
                "owner": {
                    "type": "string",
                    "description": "Filter by owner role: 'Kitchen', 'Purchasing', or 'VendorOps'. Case-insensitive partial match works.",
                },
                "action_type": {
                    "type": "string",
                    "description": "Filter by action type: 'draft_po', 'create_task', 'adjust_par', 'update_delivery_eta', 'transfer_stock', 'acknowledge_alert'.",
                },
                "status": {
                    "type": "string",
                    "description": "Filter by status: 'proposed', 'approved', 'executed', 'rejected', 'rolled_back'.",
                },
                "ingredient": {
                    "type": "string",
                    "description": "Filter by ingredient name (partial match, case-insensitive). E.g., 'chicken', 'lettuce'.",
                },
                "risk_level": {
                    "type": "string",
                    "description": "Filter by risk level: 'low', 'medium', 'high'.",
                },
                "reason_contains": {
                    "type": "string",
                    "description": "Search for keywords in the action's reason field.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "execute_action",
        "description": "Execute a specific action by its action_id. If the action is still 'proposed' and doesn't require approval, it will be auto-approved first. Use this when the user says 'execute action X', 'run action X', or 'do action X'. You can get action IDs from query_actions or get_action_queue.",
        "parameters": {
            "type": "object",
            "properties": {
                "action_id": {
                    "type": "string",
                    "description": "The full or partial action_id to execute. If partial (first 8 chars), will try to match.",
                },
            },
            "required": ["action_id"],
        },
    },
    {
        "name": "approve_action",
        "description": "Approve a proposed action without executing it. Moves status from 'proposed' to 'approved'. Use when user says 'approve action X'.",
        "parameters": {
            "type": "object",
            "properties": {
                "action_id": {
                    "type": "string",
                    "description": "The full or partial action_id to approve.",
                },
            },
            "required": ["action_id"],
        },
    },
    {
        "name": "reject_action",
        "description": "Reject a proposed action. Moves status from 'proposed' to 'rejected'. Use when user says 'reject action X', 'cancel action X', 'remove action X'.",
        "parameters": {
            "type": "object",
            "properties": {
                "action_id": {
                    "type": "string",
                    "description": "The full or partial action_id to reject.",
                },
                "reason": {
                    "type": "string",
                    "description": "Reason for rejection.",
                },
            },
            "required": ["action_id"],
        },
    },
    {
        "name": "rollback_action",
        "description": "Roll back an executed action. Use when user says 'undo action X', 'rollback action X', 'revert action X'.",
        "parameters": {
            "type": "object",
            "properties": {
                "action_id": {
                    "type": "string",
                    "description": "The full or partial action_id to rollback.",
                },
                "reason": {
                    "type": "string",
                    "description": "Reason for rollback.",
                },
            },
            "required": ["action_id"],
        },
    },
    {
        "name": "bulk_action",
        "description": "Perform a bulk operation on multiple actions matching filter criteria. Supports: 'execute' (approve+execute all matching), 'approve' (approve all matching), 'reject' (reject all matching). Use this when user says things like 'execute all kitchen actions', 'approve all POs', 'reject all low priority actions', 'execute everything from Purchasing'. Filters work the same as query_actions.",
        "parameters": {
            "type": "object",
            "properties": {
                "operation": {
                    "type": "string",
                    "description": "The bulk operation: 'execute', 'approve', or 'reject'.",
                    "enum": ["execute", "approve", "reject"],
                },
                "owner": {
                    "type": "string",
                    "description": "Filter by owner role.",
                },
                "action_type": {
                    "type": "string",
                    "description": "Filter by action type.",
                },
                "status": {
                    "type": "string",
                    "description": "Filter by current status (defaults to 'proposed' for approve/reject, 'approved' for execute).",
                },
                "ingredient": {
                    "type": "string",
                    "description": "Filter by ingredient (partial match).",
                },
                "risk_level": {
                    "type": "string",
                    "description": "Filter by risk level.",
                },
            },
            "required": ["operation"],
        },
    },
    {
        "name": "generate_action_plan",
        "description": "Automatically generate an action plan from all active ML alerts. Creates draft POs for stockout risks, par adjustments and use-first tasks for surplus risks, and kitchen verification tasks. IMPORTANT: Call this FIRST whenever the action queue is empty and there are active alerts. This populates the queue so the user can then query, approve, execute, or filter actions. Fast — creates actions deterministically.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
]


# ── Tool Implementations ─────────────────────────────────────────────────────

def _tool_check_inventory(args: Dict, context: Dict) -> Dict:
    """Check inventory levels using active alerts + Supabase data."""
    ingredient = args.get("ingredient", "all")
    alerts = context.get("active_alerts", [])

    if ingredient == "all":
        summary = []
        for alert in alerts:
            ev = alert.get("risk_event", {})
            ctx = alert.get("historical_context", {})
            summary.append({
                "ingredient": ev.get("item_id", "unknown"),
                "event_type": ev.get("event_type", ""),
                "confidence": ev.get("confidence", 0),
                "days_until": ev.get("days_until", 99),
                "avg_daily_use": ctx.get("avg_daily_use", 0),
                "days_of_supply": ctx.get("latest_days_of_supply_est"),
                "trend": ctx.get("trend", "unknown"),
            })
        return {
            "total_items_tracked": len(summary),
            "items": summary,
            "note": "Showing all items with active risk events.",
        }

    # Find specific ingredient
    for alert in alerts:
        ev = alert.get("risk_event", {})
        ctx = alert.get("historical_context", {})
        if ev.get("item_id") == ingredient or ingredient.lower() in ev.get("item_id", "").lower():
            return {
                "ingredient": ev.get("item_id"),
                "event_type": ev.get("event_type"),
                "confidence": ev.get("confidence"),
                "days_until": ev.get("days_until"),
                "expected_units": ev.get("expected_units"),
                "avg_daily_use": ctx.get("avg_daily_use"),
                "days_of_supply": ctx.get("latest_days_of_supply_est"),
                "trend": ctx.get("trend"),
                "weekend_avg": ctx.get("weekend_avg_use"),
                "weekday_avg": ctx.get("weekday_avg_use"),
                "waste_to_use_ratio": ctx.get("waste_to_use_ratio"),
            }

    return {"error": f"No data found for '{ingredient}'. Available items: " +
            ", ".join(a.get("risk_event", {}).get("item_id", "") for a in alerts)}


def _tool_get_alerts(args: Dict, context: Dict) -> Dict:
    """Get active alerts, optionally filtered."""
    filter_type = args.get("filter_type", "all")
    alerts = context.get("active_alerts", [])

    result = []
    for alert in alerts:
        ev = alert.get("risk_event", {})
        event_type = ev.get("event_type", "")

        if filter_type == "stockout" and "STOCKOUT" not in event_type:
            continue
        if filter_type == "surplus" and "SURPLUS" not in event_type:
            continue

        result.append({
            "ingredient": ev.get("item_id"),
            "type": event_type,
            "confidence": ev.get("confidence"),
            "days_until": ev.get("days_until"),
            "alert_message": alert.get("alert_message", "")[:200],
            "suggested_actions": alert.get("suggested_actions", []),
        })

    return {
        "total_alerts": len(result),
        "filter": filter_type,
        "alerts": result,
    }


def _tool_get_historical(args: Dict, context: Dict) -> Dict:
    """Fetch historical data from Supabase."""
    ingredient = args.get("ingredient", "")
    days = args.get("days", 14)

    try:
        from pipeline.supabase_client import get_historical_context
        from pipeline.rule_engine import load_rules
        rules = load_rules()
        restaurant_id = rules.get("restaurant_id", 1)
        ctx = get_historical_context(ingredient, restaurant_id)
        return {
            "ingredient": ingredient,
            "avg_daily_use": ctx.get("avg_daily_use"),
            "days_of_supply": ctx.get("latest_days_of_supply_est"),
            "trend": ctx.get("trend"),
            "weekend_avg_use": ctx.get("weekend_avg_use"),
            "weekday_avg_use": ctx.get("weekday_avg_use"),
            "waste_to_use_ratio": ctx.get("waste_to_use_ratio"),
            "max_safe_order_qty": ctx.get("max_safe_order_qty"),
            "data_days_available": days,
        }
    except Exception as e:
        return {"error": f"Failed to fetch historical data: {str(e)}"}


def _tool_draft_po(args: Dict, context: Dict) -> Dict:
    """Create a draft purchase order and register it in the action queue."""
    ingredient = args.get("ingredient", "unknown")
    quantity = args.get("quantity", 0)
    unit = args.get("unit", "units")
    urgency = args.get("urgency", "within 48h")
    reason = args.get("reason", "")

    # Determine risk level from alerts
    risk = "medium"
    for alert in context.get("active_alerts", []):
        ev = alert.get("risk_event", {})
        if ev.get("item_id") == ingredient:
            conf = ev.get("confidence", 0)
            days = ev.get("days_until", 99)
            if conf >= 0.8 and days <= 2:
                risk = "high"
            elif conf < 0.6 and days > 4:
                risk = "low"
            break

    action = create_action(
        action_type="draft_po",
        payload={
            "ingredient": ingredient,
            "quantity": quantity,
            "unit": unit,
            "due_time": urgency,
            "notes": reason,
        },
        owner_role="Purchasing",
        risk_level=risk,
        expected_impact=f"Draft PO for {quantity} {unit} of {ingredient.replace('_', ' ').title()}",
        reason=reason,
        source_alert_id=ingredient,
    )

    store_actions([action])
    audit.record(
        action_id=action["action_id"],
        event="proposed",
        action_snapshot=action,
        actor="copilot-agent",
        notes=f"Drafted by Gemini Copilot: {reason}",
    )

    return {
        "status": "draft_created",
        "action_id": action["action_id"],
        "po_number": f"PO-{action['action_id'][:8].upper()}",
        "ingredient": ingredient,
        "quantity": quantity,
        "unit": unit,
        "urgency": urgency,
        "risk_level": risk,
        "requires_approval": action.get("requires_approval", False),
        "message": f"Draft PO created for {quantity} {unit} of {ingredient}. Status: proposed.",
    }


def _tool_create_task(args: Dict, context: Dict) -> Dict:
    """Create a kitchen/ops task."""
    ingredient = args.get("ingredient", "unknown")
    description = args.get("task_description", "")
    priority = args.get("priority", "medium")
    due = args.get("due", "today")

    action = create_action(
        action_type="create_task",
        payload={
            "ingredient": ingredient,
            "notes": description,
            "due_time": due,
        },
        owner_role="Kitchen",
        risk_level=priority,
        expected_impact=f"Task for kitchen: {description[:80]}",
        reason=description,
        source_alert_id=ingredient,
    )

    store_actions([action])
    audit.record(
        action_id=action["action_id"],
        event="proposed",
        action_snapshot=action,
        actor="copilot-agent",
        notes=f"Task created by Gemini Copilot",
    )

    return {
        "status": "task_created",
        "action_id": action["action_id"],
        "task_id": f"TASK-{action['action_id'][:8].upper()}",
        "ingredient": ingredient,
        "description": description,
        "priority": priority,
        "due": due,
        "message": f"Task created for {ingredient}: {description[:60]}",
    }


def _tool_adjust_par(args: Dict, context: Dict) -> Dict:
    """Propose a par level adjustment."""
    ingredient = args.get("ingredient", "unknown")
    change_pct = args.get("change_percent", 0)
    reason = args.get("reason", "")

    risk = "low" if abs(change_pct) <= 10 else "medium"

    action = create_action(
        action_type="adjust_par",
        payload={
            "ingredient": ingredient,
            "par_change_pct": change_pct,
            "notes": reason,
        },
        owner_role="Purchasing",
        risk_level=risk,
        expected_impact=f"Adjust par level by {change_pct:+.0f}% for {ingredient.replace('_', ' ').title()}",
        reason=reason,
        source_alert_id=ingredient,
    )

    store_actions([action])
    audit.record(
        action_id=action["action_id"],
        event="proposed",
        action_snapshot=action,
        actor="copilot-agent",
        notes=f"Par adjustment by Gemini Copilot",
    )

    needs_approval = abs(change_pct) > 10
    return {
        "status": "par_adjustment_proposed",
        "action_id": action["action_id"],
        "ingredient": ingredient,
        "change_percent": change_pct,
        "requires_approval": needs_approval,
        "message": f"Par level adjustment of {change_pct:+.0f}% proposed for {ingredient}." +
                   (" Requires human approval (>10%)." if needs_approval else " Auto-approvable."),
    }


def _tool_analyze_trend(args: Dict, context: Dict) -> Dict:
    """Analyze usage trend for an ingredient."""
    ingredient = args.get("ingredient", "")
    alerts = context.get("active_alerts", [])

    for alert in alerts:
        ev = alert.get("risk_event", {})
        ctx = alert.get("historical_context", {})
        if ev.get("item_id") == ingredient or ingredient.lower() in ev.get("item_id", "").lower():
            avg_use = ctx.get("avg_daily_use", 0)
            weekend = ctx.get("weekend_avg_use", 0)
            weekday = ctx.get("weekday_avg_use", 0)
            trend = ctx.get("trend", "unknown")
            waste_ratio = ctx.get("waste_to_use_ratio", 0)

            analysis = {
                "ingredient": ev.get("item_id"),
                "trend_direction": trend,
                "avg_daily_use": avg_use,
                "weekend_avg": weekend,
                "weekday_avg": weekday,
                "weekend_vs_weekday": f"{((weekend / weekday - 1) * 100):+.1f}% on weekends" if weekday and weekday > 0 else "N/A",
                "waste_to_use_ratio": waste_ratio,
                "waste_assessment": "High waste risk" if waste_ratio and waste_ratio > 0.15 else "Normal waste levels",
                "supply_estimate_days": ctx.get("latest_days_of_supply_est"),
            }
            return analysis

    return {"error": f"No trend data available for '{ingredient}'."}


def _tool_get_action_queue(args: Dict, context: Dict) -> Dict:
    """Get current action queue."""
    status_filter = args.get("status_filter", "all")
    sf = None if status_filter == "all" else status_filter
    actions = get_all_actions(status_filter=sf)

    return {
        "total": len(actions),
        "filter": status_filter,
        "actions": [
            {
                "action_id": a["action_id"][:8],
                "full_id": a["action_id"],
                "type": a.get("action_type"),
                "ingredient": a.get("payload", {}).get("ingredient", "—"),
                "status": a.get("status"),
                "risk": a.get("risk_level"),
                "owner": a.get("owner_role"),
                "reason": (a.get("reason") or "")[:80],
                "requires_approval": a.get("requires_approval", False),
            }
            for a in actions[:20]
        ],
    }


# ── Helper: resolve partial action ID ────────────────────────────────────────

def _resolve_action_id(partial_id: str) -> Optional[str]:
    """Resolve a partial action_id (first 8 chars) to the full UUID."""
    partial = partial_id.strip().lower()
    all_actions = get_all_actions()
    for a in all_actions:
        full_id = a["action_id"]
        if full_id == partial_id or full_id.lower().startswith(partial):
            return full_id
    return None


def _filter_actions(args: Dict) -> List[Dict]:
    """Filter actions by multiple criteria. Shared logic for query + bulk."""
    all_actions = get_all_actions()
    filtered = all_actions

    owner = args.get("owner", "")
    if owner:
        owner_lower = owner.lower()
        filtered = [
            a for a in filtered
            if owner_lower in (a.get("owner_role") or "").lower()
        ]

    action_type = args.get("action_type", "")
    if action_type:
        at_lower = action_type.lower()
        filtered = [
            a for a in filtered
            if at_lower in (a.get("action_type") or "").lower()
        ]

    status = args.get("status", "")
    if status:
        st_lower = status.lower()
        filtered = [
            a for a in filtered
            if st_lower in (a.get("status") or "").lower()
        ]

    ingredient = args.get("ingredient", "")
    if ingredient:
        ing_lower = ingredient.lower()
        filtered = [
            a for a in filtered
            if ing_lower in (a.get("payload", {}).get("ingredient") or "").lower()
            or ing_lower in (a.get("source_alert_id") or "").lower()
        ]

    risk_level = args.get("risk_level", "")
    if risk_level:
        rl_lower = risk_level.lower()
        filtered = [
            a for a in filtered
            if rl_lower == (a.get("risk_level") or "").lower()
        ]

    reason_contains = args.get("reason_contains", "")
    if reason_contains:
        kw_lower = reason_contains.lower()
        filtered = [
            a for a in filtered
            if kw_lower in (a.get("reason") or "").lower()
        ]

    return filtered


def _tool_query_actions(args: Dict, context: Dict) -> Dict:
    """Search and filter the action queue by any combination of criteria."""
    filtered = _filter_actions(args)

    # Build a readable summary of applied filters
    filters_applied = []
    for key in ["owner", "action_type", "status", "ingredient", "risk_level", "reason_contains"]:
        if args.get(key):
            filters_applied.append(f"{key}={args[key]}")

    return {
        "total_matching": len(filtered),
        "filters": filters_applied or ["none (showing all)"],
        "actions": [
            {
                "action_id": a["action_id"][:8],
                "full_id": a["action_id"],
                "type": a.get("action_type"),
                "ingredient": a.get("payload", {}).get("ingredient", "—"),
                "status": a.get("status"),
                "risk": a.get("risk_level"),
                "owner": a.get("owner_role"),
                "reason": (a.get("reason") or "")[:120],
                "requires_approval": a.get("requires_approval", False),
                "expected_impact": (a.get("expected_impact") or "")[:100],
            }
            for a in filtered[:30]
        ],
    }


def _tool_execute_action(args: Dict, context: Dict) -> Dict:
    """Execute a specific action by ID."""
    partial_id = args.get("action_id", "")
    if not partial_id:
        return {"error": "No action_id provided.", "success": False}

    full_id = _resolve_action_id(partial_id)
    if not full_id:
        return {"error": f"No action found matching ID '{partial_id}'.", "success": False}

    action = get_action(full_id)
    if not action:
        return {"error": f"Action {full_id} not found.", "success": False}

    # If proposed and doesn't need approval, approve first
    if action.get("status") == "proposed":
        if action.get("requires_approval"):
            return {
                "error": f"Action {full_id[:8]} requires human approval before execution. It's a {action.get('action_type')} with risk level '{action.get('risk_level')}'.",
                "success": False,
                "action_id": full_id[:8],
                "status": action.get("status"),
            }
        approve_result = approve_action(full_id, actor="copilot-agent")
        if not approve_result.get("success"):
            return {"error": f"Failed to auto-approve: {approve_result.get('error')}", "success": False}

    result = execute_action(full_id, actor="copilot-agent")

    audit.record(
        action_id=full_id,
        event="copilot_execute",
        action_snapshot=action,
        actor="copilot-agent",
        notes=f"Executed via Copilot conversation",
    )

    return {
        "success": result.get("success", False),
        "action_id": full_id[:8],
        "action_type": action.get("action_type"),
        "ingredient": action.get("payload", {}).get("ingredient", "—"),
        "new_status": action.get("status"),
        "message": f"Action {full_id[:8]} ({action.get('action_type')}) executed successfully." if result.get("success") else f"Execution failed: {result.get('error', 'unknown')}",
        "exec_result": result.get("exec_result", {}),
    }


def _tool_approve_action_fn(args: Dict, context: Dict) -> Dict:
    """Approve a proposed action."""
    partial_id = args.get("action_id", "")
    if not partial_id:
        return {"error": "No action_id provided.", "success": False}

    full_id = _resolve_action_id(partial_id)
    if not full_id:
        return {"error": f"No action found matching ID '{partial_id}'.", "success": False}

    result = approve_action(full_id, actor="copilot-agent")

    if result.get("success"):
        action = result.get("action", {})
        audit.record(
            action_id=full_id,
            event="copilot_approve",
            action_snapshot=action,
            actor="copilot-agent",
            notes="Approved via Copilot conversation",
        )
        return {
            "success": True,
            "action_id": full_id[:8],
            "action_type": action.get("action_type"),
            "ingredient": action.get("payload", {}).get("ingredient", "—"),
            "new_status": action.get("status"),
            "message": f"Action {full_id[:8]} approved. It can now be executed.",
        }
    else:
        return {"success": False, "error": result.get("error", "Approval failed."), "action_id": partial_id}


def _tool_reject_action_fn(args: Dict, context: Dict) -> Dict:
    """Reject a proposed action."""
    partial_id = args.get("action_id", "")
    reason = args.get("reason", "Rejected via Copilot agent")
    if not partial_id:
        return {"error": "No action_id provided.", "success": False}

    full_id = _resolve_action_id(partial_id)
    if not full_id:
        return {"error": f"No action found matching ID '{partial_id}'.", "success": False}

    result = reject_action(full_id, actor="copilot-agent", reason=reason)

    if result.get("success"):
        action = result.get("action", {})
        audit.record(
            action_id=full_id,
            event="copilot_reject",
            action_snapshot=action,
            actor="copilot-agent",
            notes=f"Rejected via Copilot: {reason}",
        )
        return {
            "success": True,
            "action_id": full_id[:8],
            "action_type": action.get("action_type"),
            "ingredient": action.get("payload", {}).get("ingredient", "—"),
            "new_status": "rejected",
            "message": f"Action {full_id[:8]} rejected. Reason: {reason}",
        }
    else:
        return {"success": False, "error": result.get("error", "Rejection failed."), "action_id": partial_id}


def _tool_rollback_action_fn(args: Dict, context: Dict) -> Dict:
    """Rollback an executed action."""
    partial_id = args.get("action_id", "")
    reason = args.get("reason", "Rolled back via Copilot agent")
    if not partial_id:
        return {"error": "No action_id provided.", "success": False}

    full_id = _resolve_action_id(partial_id)
    if not full_id:
        return {"error": f"No action found matching ID '{partial_id}'.", "success": False}

    result = rollback_action(full_id, actor="copilot-agent", reason=reason)

    if result.get("success"):
        action = result.get("action", {})
        audit.record(
            action_id=full_id,
            event="copilot_rollback",
            action_snapshot=action,
            actor="copilot-agent",
            notes=f"Rolled back via Copilot: {reason}",
        )
        return {
            "success": True,
            "action_id": full_id[:8],
            "action_type": action.get("action_type"),
            "ingredient": action.get("payload", {}).get("ingredient", "—"),
            "new_status": "rolled_back",
            "message": f"Action {full_id[:8]} rolled back. Reason: {reason}",
        }
    else:
        return {"success": False, "error": result.get("error", "Rollback failed."), "action_id": partial_id}


def _tool_bulk_action(args: Dict, context: Dict) -> Dict:
    """Perform bulk operations on actions matching filters."""
    operation = args.get("operation", "")
    if operation not in ("execute", "approve", "reject"):
        return {"error": f"Invalid operation '{operation}'. Use 'execute', 'approve', or 'reject'."}

    # Set default status filter based on operation
    if not args.get("status"):
        if operation in ("approve", "reject"):
            args["status"] = "proposed"
        elif operation == "execute":
            # Execute can work on both proposed (auto-approve) and approved
            pass

    matching = _filter_actions(args)

    if not matching:
        filters_desc = ", ".join(f"{k}={v}" for k, v in args.items() if v and k != "operation")
        return {
            "success": True,
            "message": f"No actions found matching filters: {filters_desc or 'none'}",
            "processed": 0,
            "failed": 0,
            "results": [],
        }

    results = []
    success_count = 0
    fail_count = 0

    for action in matching:
        aid = action["action_id"]
        action_summary = {
            "action_id": aid[:8],
            "action_type": action.get("action_type"),
            "ingredient": action.get("payload", {}).get("ingredient", "—"),
            "owner": action.get("owner_role"),
        }

        if operation == "approve":
            if action.get("status") != "proposed":
                action_summary["result"] = f"Skipped (status is '{action.get('status')}', not 'proposed')"
                fail_count += 1
            else:
                r = approve_action(aid, actor="copilot-agent")
                if r.get("success"):
                    action_summary["result"] = "Approved"
                    success_count += 1
                else:
                    action_summary["result"] = f"Failed: {r.get('error')}"
                    fail_count += 1

        elif operation == "reject":
            if action.get("status") != "proposed":
                action_summary["result"] = f"Skipped (status is '{action.get('status')}', not 'proposed')"
                fail_count += 1
            else:
                r = reject_action(aid, actor="copilot-agent", reason=f"Bulk rejected via Copilot")
                if r.get("success"):
                    action_summary["result"] = "Rejected"
                    success_count += 1
                else:
                    action_summary["result"] = f"Failed: {r.get('error')}"
                    fail_count += 1

        elif operation == "execute":
            current_status = action.get("status")
            if current_status == "proposed":
                if action.get("requires_approval"):
                    action_summary["result"] = "Skipped (requires human approval)"
                    fail_count += 1
                    results.append(action_summary)
                    continue
                # Auto-approve first
                ar = approve_action(aid, actor="copilot-agent")
                if not ar.get("success"):
                    action_summary["result"] = f"Auto-approve failed: {ar.get('error')}"
                    fail_count += 1
                    results.append(action_summary)
                    continue

            if action.get("status") not in ("approved",):
                # Re-check after potential approve
                refreshed = get_action(aid)
                if refreshed and refreshed.get("status") != "approved":
                    action_summary["result"] = f"Skipped (status is '{refreshed.get('status')}', not 'approved')"
                    fail_count += 1
                    results.append(action_summary)
                    continue

            r = execute_action(aid, actor="copilot-agent")
            if r.get("success"):
                action_summary["result"] = "Executed"
                success_count += 1
            else:
                action_summary["result"] = f"Failed: {r.get('error')}"
                fail_count += 1

        results.append(action_summary)

    audit.record(
        action_id="bulk",
        event=f"copilot_bulk_{operation}",
        action_snapshot={"operation": operation, "count": len(matching)},
        actor="copilot-agent",
        notes=f"Bulk {operation}: {success_count} succeeded, {fail_count} failed",
    )

    return {
        "success": True,
        "operation": operation,
        "processed": success_count,
        "failed": fail_count,
        "total_matched": len(matching),
        "message": f"Bulk {operation}: {success_count} succeeded, {fail_count} failed/skipped out of {len(matching)} matching actions.",
        "results": results,
    }


# ── Tool dispatcher ──────────────────────────────────────────────────────────

def _tool_generate_plan(args: Dict, context: Dict) -> Dict:
    """Generate an action plan from active alerts — populates the action queue."""
    alerts = context.get("active_alerts", [])
    if not alerts:
        return {"error": "No active alerts to plan from.", "actions_created": 0}

    # Check what already exists to avoid duplicates
    existing = get_all_actions()
    existing_ingredients = {
        a.get("payload", {}).get("ingredient", "")
        for a in existing
        if a.get("status") in ("proposed", "approved", "executing", "executed")
    }

    created = []
    for alert in alerts:
        ev = alert.get("risk_event", {})
        ctx = alert.get("historical_context", {})
        ingredient = ev.get("item_id", "unknown")
        event_type = ev.get("event_type", "")
        confidence = ev.get("confidence", 0)
        days_until = ev.get("days_until", 99)
        avg_daily_use = ctx.get("avg_daily_use", 0)

        # Skip if we already have an action for this ingredient
        if ingredient in existing_ingredients:
            continue

        # Determine risk level
        if confidence >= 0.8 and days_until <= 2:
            risk = "high"
        elif confidence >= 0.6 or days_until <= 4:
            risk = "medium"
        else:
            risk = "low"

        if "STOCKOUT" in event_type:
            # Create a single Purchase Order action (the primary action for stockouts)
            reorder_qty = round(avg_daily_use * 5, 1) if avg_daily_use else 10
            action = create_action(
                action_type="draft_po",
                payload={"ingredient": ingredient, "quantity": reorder_qty, "unit": "units",
                         "due_time": "within 48h",
                         "notes": f"Auto-planned: {event_type} at {confidence:.0%} confidence. Verify stock before ordering."},
                owner_role="Purchasing",
                risk_level=risk,
                expected_impact=f"Draft PO for {reorder_qty} units of {ingredient.replace('_', ' ').title()}",
                reason=f"ML prediction: {event_type} at {confidence:.0%} confidence, ~{days_until} days until event. Avg daily use: {avg_daily_use:.1f}",
                source_alert_id=ingredient,
            )
            store_actions([action])
            audit.record(action_id=action["action_id"], event="proposed", action_snapshot=action, actor="copilot-planner", notes="Auto-generated from alert")
            created.append({"action_id": action["action_id"][:8], "type": "draft_po", "ingredient": ingredient, "risk": risk, "owner": "Purchasing"})

        elif "SURPLUS" in event_type:
            # Create a single Par Adjustment action (the primary action for surpluses)
            action = create_action(
                action_type="adjust_par",
                payload={"ingredient": ingredient, "par_change_pct": -10,
                         "notes": f"Reduce par due to surplus risk at {confidence:.0%} confidence. Consider specials to move stock."},
                owner_role="Purchasing",
                risk_level=risk,
                expected_impact=f"Reduce par by 10% for {ingredient.replace('_', ' ').title()} to cut waste",
                reason=f"ML prediction: surplus at {confidence:.0%} confidence. Reducing par to match actual usage.",
                source_alert_id=ingredient,
            )
            store_actions([action])
            audit.record(action_id=action["action_id"], event="proposed", action_snapshot=action, actor="copilot-planner", notes="Auto-generated from alert")
            created.append({"action_id": action["action_id"][:8], "type": "adjust_par", "ingredient": ingredient, "risk": risk, "owner": "Purchasing"})

    return {
        "success": True,
        "actions_created": len(created),
        "total_alerts_processed": len(alerts),
        "actions": created,
        "message": f"Generated {len(created)} actions from {len(alerts)} active alerts.",
    }


TOOL_FUNCTIONS = {
    "check_inventory": _tool_check_inventory,
    "get_alerts": _tool_get_alerts,
    "get_historical_data": _tool_get_historical,
    "draft_purchase_order": _tool_draft_po,
    "create_kitchen_task": _tool_create_task,
    "adjust_par_level": _tool_adjust_par,
    "analyze_trend": _tool_analyze_trend,
    "get_action_queue": _tool_get_action_queue,
    "query_actions": _tool_query_actions,
    "execute_action": _tool_execute_action,
    "approve_action": _tool_approve_action_fn,
    "reject_action": _tool_reject_action_fn,
    "rollback_action": _tool_rollback_action_fn,
    "bulk_action": _tool_bulk_action,
    "generate_action_plan": _tool_generate_plan,
}


def _execute_tool(tool_name: str, tool_args: Dict, context: Dict) -> str:
    """Execute a tool and return JSON result string."""
    fn = TOOL_FUNCTIONS.get(tool_name)
    if not fn:
        return json.dumps({"error": f"Unknown tool: {tool_name}"})
    try:
        result = fn(tool_args, context)
        return json.dumps(result, indent=2)
    except Exception as e:
        return json.dumps({"error": f"Tool '{tool_name}' failed: {str(e)}"})


# ── Copilot System Prompt ─────────────────────────────────────────────────────

COPILOT_SYSTEM = """\
You are SpellStock Copilot — an autonomous AI agent that translates natural language into executable operations on an Action Queue for restaurant inventory management.

You are NOT a chatbot. You are an AGENT that THINKS, ACTS, and OBSERVES.

YOUR WORKFLOW (MANDATORY):
1. THINK — Parse the user's request. Determine their INTENT.
2. ACT  — Call the right tools to fulfill their intent. You MUST call at least one tool per request.
3. OBSERVE — Read tool results. Decide if you need more info.
4. ACT AGAIN — If needed, call more tools based on what you learned.
5. RESPOND — Summarize what you did in a brief structured way.

═══ INTENT CATEGORIES ═══

For every message, determine the user's intent:

A. VIEW / QUERY — user wants to see data or actions
   "show me all actions", "what's in the queue?", "what POs are pending?"
   → ALWAYS call get_action_queue first. If empty, call generate_action_plan. Then query_actions.

B. FILTER / REFINE — user is narrowing existing results
   "only kitchen tasks", "high risk only", "actions for chicken"
   → Use query_actions with appropriate filters

C. ADD — user wants new structured actions created
   "order chicken", "draft a PO for lettuce", "create a task for kitchen"
   → check_inventory → get_historical_data → draft_purchase_order / create_kitchen_task / adjust_par_level

D. MODIFY — user is editing items already in the queue
   "approve action abc123"
   → approve_action, reject_action

E. EXECUTE — user wants actions triggered
   "execute all POs", "run action abc123", "do it"
   → execute_action or bulk_action with operation="execute"

F. REMOVE / REJECT — user wants to discard actions
   "reject the lettuce task", "cancel all surplus actions"
   → reject_action or bulk_action with operation="reject"

G. RESET — user wants to discard current queue and rebuild
   "start over", "reset the queue"
   → generate_action_plan

═══ FILTER MAPPING ═══

Map natural language to query_actions parameters:
- Owner: "kitchen"→ owner="Kitchen", "purchasing"→ owner="Purchasing", "vendor"→ owner="VendorOps"
- Type: "PO"/"purchase order"→ action_type="draft_po", "task"→ action_type="create_task", "par"→ action_type="adjust_par"
- Status: "pending"/"proposed"→ status="proposed", "approved"→ status="approved", "done"/"executed"→ status="executed", "rejected"→ status="rejected"
- Risk: "urgent"/"critical"/"high"→ risk_level="high", "medium"→ risk_level="medium", "low"→ risk_level="low"
- Ingredient: food item name → ingredient="name"

═══ CRITICAL RULES ═══

1. **FIRST REQUEST**: Call get_action_queue as your FIRST tool. If 0 actions, call generate_action_plan.
2. **REFINEMENT REQUEST**: If conversation shows previous actions, use query_actions with filters. DO NOT regenerate.
3. **Execution with pronouns**: "execute those"/"do it" → Look at conversation history for last filter, apply same filters to bulk_action.
4. **Filter accumulation**: When refining (FILTER intent), combine previous filters with new ones unless user says "only" or "just".
5. For bulk operations, use bulk_action with appropriate filters.
6. NEVER respond without calling tools. You MUST call at least one tool.
7. After ANY queue modification, briefly state what changed AND provide suggested next actions.
8. **Be specific in responses**: Always mention ingredient names, counts, and action IDs.

═══ RESPONSE STYLE ═══

After all tool calls, respond with a brief summary. Include:
- What intent you detected (VIEW/FILTER/ADD/EXECUTE/etc.)
- **Context awareness**: If refining, mention "narrowing from X to Y actions"
- What actions are in the queue (count, types, owners, ingredients)
- What you executed/modified/created (if anything) with SPECIFIC details
- Action IDs (first 8 chars) and full ingredient names
- **Suggested next steps**: "You can now: execute these, approve X, or filter further"

Be concise but informative. Use bullet points. Reference actual IDs and ingredient names from tool results.

**FORMATTING**:
- Use action IDs: "Action a1b2c3d4"
- Use full ingredient names: "Chicken Breast", not "chicken"
- Be specific: "2 high-risk stockout alerts" not "some alerts"
- Suggest actions: "Ready to execute? Say 'execute high risk actions'"

═══ SAFETY ═══
- Draft POs are DRAFTS, not live orders.
- Par adjustments > 10% need human approval.
- Never suggest actions without data backing.
"""


# ── Conversation history (in-memory, per-session) ────────────────────────────

_sessions: Dict[str, List[Dict]] = {}


def _get_session(session_id: str) -> List[Dict]:
    """Get or create a conversation session."""
    if session_id not in _sessions:
        _sessions[session_id] = []
    return _sessions[session_id]


def clear_session(session_id: str) -> None:
    """Clear a conversation session."""
    _sessions.pop(session_id, None)


def get_session_history(session_id: str) -> List[Dict]:
    """Get conversation history for a session (for API)."""
    return _sessions.get(session_id, [])


# ── Main Agent Loop ──────────────────────────────────────────────────────────

def run_copilot(
    user_message: str,
    session_id: str,
    active_alerts: List[Dict],
    max_turns: int = 8,
) -> Dict[str, Any]:
    """
    Run the Gemini Copilot agent loop.

    This is the core agentic loop:
    1. User sends a message
    2. Gemini reasons and may call tools
    3. We execute tools and feed results back
    4. Repeat until Gemini responds with text (no more tool calls)

    Returns:
        Dict with: response (final text), tool_calls (list of tool interactions),
                   actions_created (list of any actions the agent created),
                   session_id, turn_count
    """
    from google import genai
    from google.genai import types

    client = _get_gemini_client()
    session = _get_session(session_id)

    # Context for tool implementations
    tool_context = {
        "active_alerts": active_alerts,
    }

    # Build the tool declarations for Gemini
    tools = types.Tool(function_declarations=[
        types.FunctionDeclaration(
            name=td["name"],
            description=td["description"],
            parameters=td.get("parameters"),
        )
        for td in TOOL_DECLARATIONS
    ])

    # Build conversation contents from session history
    contents = []
    for msg in session:
        if msg["role"] == "user":
            contents.append(types.Content(
                role="user",
                parts=[types.Part.from_text(text=msg["text"])],
            ))
        elif msg["role"] == "assistant":
            contents.append(types.Content(
                role="model",
                parts=[types.Part.from_text(text=msg["text"])],
            ))
        # Tool call/result pairs are already embedded in conversation

    # Add the new user message
    contents.append(types.Content(
        role="user",
        parts=[types.Part.from_text(text=user_message)],
    ))

    # Record user message in session
    session.append({
        "role": "user",
        "text": user_message,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    })

    # Agent loop — keep going until Gemini responds with text (no tool calls)
    tool_trace: List[Dict] = []
    actions_created: List[Dict] = []
    final_response = ""
    turn_count = 0

    for turn in range(max_turns):
        turn_count += 1

        try:
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=COPILOT_SYSTEM,
                    tools=[tools],
                    temperature=0.3,
                ),
            )
        except Exception as e:
            final_response = f"Agent error: {str(e)}"
            break

        # Check if Gemini wants to call tools
        candidate = response.candidates[0] if response.candidates else None
        if not candidate or not candidate.content or not candidate.content.parts:
            final_response = "Agent produced no response."
            break

        parts = candidate.content.parts

        # Check for function calls in the response
        function_calls = [p for p in parts if p.function_call]
        text_parts = [p for p in parts if p.text]

        if not function_calls:
            # No tool calls — this is the final response
            final_response = "\n".join(p.text for p in text_parts if p.text)
            break

        # There are function calls — execute them and feed results back
        # First, add the model's response (with function calls) to contents
        contents.append(candidate.content)

        # Execute each tool call and build function response parts
        function_response_parts = []
        for fc_part in function_calls:
            fc = fc_part.function_call
            tool_name = fc.name
            tool_args = dict(fc.args) if fc.args else {}

            # Execute the tool
            result_str = _execute_tool(tool_name, tool_args, tool_context)

            # Parse result to check if an action was created
            try:
                result_data = json.loads(result_str)
                if result_data.get("action_id"):
                    actions_created.append(result_data)
            except:
                result_data = {}

            # Record in trace
            tool_trace.append({
                "tool": tool_name,
                "args": tool_args,
                "result": result_data or result_str,
                "turn": turn_count,
            })

            # Build the function response part
            function_response_parts.append(
                types.Part.from_function_response(
                    name=tool_name,
                    response={"result": result_str},
                )
            )

        # Add tool results to conversation
        contents.append(types.Content(
            role="user",
            parts=function_response_parts,
        ))

        # Also capture any text the model said alongside tool calls
        if text_parts:
            inline_text = "\n".join(p.text for p in text_parts if p.text)
            if inline_text.strip():
                tool_trace[-1]["agent_thought"] = inline_text

    # If we hit max turns without a final text response, synthesize one
    if not final_response and turn_count >= max_turns:
        final_response = json.dumps({
            "intent": "VIEW",
            "queue_operation": "NONE",
            "filters_applied": {},
            "actions_queue": [],
            "executions_triggered": [],
            "notes": "Max agent turns reached. Check tool trace for details.",
        })

    # ── Post-process into structured JSON format ──────────────────────────
    structured = _build_structured_response(
        final_response, tool_trace, actions_created, user_message
    )

    # Record assistant response in session
    session.append({
        "role": "assistant",
        "text": json.dumps(structured),
        "tool_calls": tool_trace,
        "actions_created": actions_created,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    })

    return {
        "response": json.dumps(structured),
        "structured": structured,
        "tool_calls": tool_trace,
        "actions_created": actions_created,
        "session_id": session_id,
        "turn_count": turn_count,
    }


# ── Structured response builder ──────────────────────────────────────────────

def _build_structured_response(
    raw_response: str,
    tool_trace: List[Dict],
    actions_created: List[Dict],
    user_message: str,
) -> Dict[str, Any]:
    """
    Ensure the final response is always in the structured JSON schema.

    If Gemini already returned valid JSON matching the schema, use it directly.
    Otherwise, infer intent from tool trace and build the structure ourselves.
    """

    # 1. Try to parse Gemini's response as JSON
    parsed = None
    try:
        # Strip markdown code fences if present
        cleaned = raw_response.strip()
        if cleaned.startswith("```"):
            # Remove ```json ... ``` wrapping
            lines = cleaned.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            cleaned = "\n".join(lines).strip()
        parsed = json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        parsed = None

    # 2. If parsed has the expected schema keys, use it (validate & augment)
    if parsed and isinstance(parsed, dict) and "intent" in parsed:
        # Ensure all required keys exist
        structured = {
            "intent": parsed.get("intent", "VIEW"),
            "queue_operation": parsed.get("queue_operation", "NONE"),
            "filters_applied": parsed.get("filters_applied", {}),
            "actions_queue": parsed.get("actions_queue", []),
            "executions_triggered": parsed.get("executions_triggered", []),
            "notes": parsed.get("notes", ""),
        }
        return structured

    # 3. Fallback: infer structure from tool trace
    return _infer_structured_response(raw_response, tool_trace, actions_created, user_message)


def _infer_structured_response(
    raw_response: str,
    tool_trace: List[Dict],
    actions_created: List[Dict],
    user_message: str,
) -> Dict[str, Any]:
    """
    Build structured response by analyzing the tool calls that were made.

    This is the fallback when Gemini doesn't return perfect JSON.
    Enhanced with context awareness and better execution reporting.
    """
    tools_used = [tc.get("tool", "") for tc in tool_trace]

    # ── Detect intent from tools used ──
    mutating_tools = {
        "execute_action", "approve_action", "reject_action", "rollback_action", "bulk_action",
    }
    creating_tools = {
        "draft_purchase_order", "create_kitchen_task", "adjust_par_level", "generate_action_plan",
    }
    query_tools = {
        "get_action_queue", "query_actions", "check_inventory", "get_alerts",
        "get_historical_data", "analyze_trend",
    }

    intent = "VIEW"
    queue_operation = "NONE"
    executions_triggered = []
    execution_details = []  # NEW: Detailed execution results
    filters_applied = {}
    context_note = ""  # NEW: Context about refinement vs new request

    # Detect if this is a refinement (FILTER) vs new request
    has_query_actions = "query_actions" in tools_used
    has_filters = False
    
    for tc in tool_trace:
        if tc.get("tool") == "query_actions" and tc.get("args"):
            filters = tc.get("args", {})
            has_filters = any(filters.get(k) for k in ["owner", "action_type", "status", "ingredient", "risk_level"])
            if has_filters:
                filters_applied = {k: v for k, v in filters.items() if v}
                break

    # Determine intent from which tools were called
    if any(t in mutating_tools for t in tools_used):
        # Check specifics
        if "execute_action" in tools_used or any(
            tc.get("tool") == "bulk_action" and tc.get("args", {}).get("operation") == "execute"
            for tc in tool_trace
        ):
            intent = "EXECUTE"
            queue_operation = "EXECUTE"
            context_note = "Actions executed. Status updated in queue."
        elif "approve_action" in tools_used or any(
            tc.get("tool") == "bulk_action" and tc.get("args", {}).get("operation") == "approve"
            for tc in tool_trace
        ):
            intent = "MODIFY"
            queue_operation = "UPDATE"
            context_note = "Actions approved and ready for execution."
        elif "reject_action" in tools_used or any(
            tc.get("tool") == "bulk_action" and tc.get("args", {}).get("operation") == "reject"
            for tc in tool_trace
        ):
            intent = "REMOVE"
            queue_operation = "UPDATE"
            context_note = "Actions rejected and removed from active queue."
        elif "rollback_action" in tools_used:
            intent = "MODIFY"
            queue_operation = "UPDATE"
            context_note = "Action rolled back. Changes reverted."

    elif any(t in creating_tools for t in tools_used):
        if "generate_action_plan" in tools_used:
            intent = "RESET"
            queue_operation = "REPLACE"
            context_note = "Action plan regenerated from active alerts."
        else:
            intent = "ADD"
            queue_operation = "APPEND"
            context_note = "New actions added to queue based on your request."

    elif any(t in query_tools for t in tools_used):
        # Check if filters were applied
        if has_query_actions and has_filters:
            intent = "FILTER"
            queue_operation = "NONE"
            filter_summary = ", ".join(f"{k}={v}" for k, v in filters_applied.items())
            context_note = f"Filtered results: {filter_summary}"
        else:
            intent = "VIEW"
            queue_operation = "NONE"
            context_note = "Showing current action queue."

    # ── Collect execution IDs and details from tool results ──
    for tc in tool_trace:
        tool_name = tc.get("tool", "")
        result = tc.get("result", {})
        if isinstance(result, dict):
            if tool_name in ("execute_action", "approve_action", "reject_action", "rollback_action"):
                aid = result.get("action_id", "")
                if aid:
                    executions_triggered.append(aid)
                    # Collect execution details
                    execution_details.append({
                        "action_id": aid,
                        "operation": tool_name.replace("_action", ""),
                        "action_type": result.get("action_type", ""),
                        "ingredient": result.get("ingredient", ""),
                        "status": result.get("new_status", result.get("status", "")),
                        "success": result.get("success", False),
                        "message": result.get("message", ""),
                    })
            elif tool_name == "bulk_action":
                operation = result.get("operation", "")
                for r in result.get("results", []):
                    aid = r.get("action_id", "")
                    if aid:
                        executions_triggered.append(aid)
                        execution_details.append({
                            "action_id": aid,
                            "operation": operation,
                            "action_type": r.get("action_type", ""),
                            "ingredient": r.get("ingredient", ""),
                            "result": r.get("result", ""),
                            "success": "Failed" not in r.get("result", ""),
                        })

    # ── Collect filters from query_actions calls ──
    for tc in tool_trace:
        if tc.get("tool") == "query_actions" and tc.get("args"):
            for k in ["owner", "action_type", "status", "ingredient", "risk_level", "reason_contains"]:
                v = tc["args"].get(k)
                if v:
                    filters_applied[k] = v

    # ── Build actions_queue from the latest queue state ──
    actions_queue = []

    # Prefer the last query_actions or get_action_queue result
    last_queue_result = None
    for tc in reversed(tool_trace):
        if tc.get("tool") in ("query_actions", "get_action_queue"):
            last_queue_result = tc.get("result", {})
            break
        elif tc.get("tool") == "generate_action_plan":
            last_queue_result = tc.get("result", {})
            break

    if last_queue_result and isinstance(last_queue_result, dict):
        raw_actions = last_queue_result.get("actions", [])
        for a in raw_actions:
            actions_queue.append(_format_action_for_queue(a))

    # Also include any newly created actions if they weren't in the query results
    created_ids = {a.get("action_id", "")[:8] for a in actions_queue}
    for ac in actions_created:
        short_id = ac.get("action_id", "")[:8]
        if short_id and short_id not in created_ids:
            actions_queue.append({
                "action_id": short_id,
                "Type": _action_type_to_display(ac.get("type", ac.get("action_type", ""))),
                "Ingredient": ac.get("ingredient", ac.get("payload", {}).get("ingredient", "—")),
                "Risk": ac.get("risk_level", ac.get("risk", "medium")),
                "Owner": ac.get("owner", ac.get("owner_role", "—")),
                "Status": ac.get("status", ac.get("new_status", "Proposed")).title(),
                "Reason": ac.get("reason", ac.get("message", "")),
                "Actions": [ac.get("message", "")],
            })

    # ── Build comprehensive notes with execution feedback ──
    notes_parts = []
    if context_note:
        notes_parts.append(context_note)
    
    # Add execution summary if operations were performed
    if execution_details:
        success_count = sum(1 for e in execution_details if e.get("success", False))
        total_count = len(execution_details)
        if intent == "EXECUTE":
            notes_parts.append(f"Executed {success_count}/{total_count} actions successfully.")
            # List specific ingredients affected
            ingredients = list(set(e.get("ingredient", "") for e in execution_details if e.get("ingredient")))
            if ingredients:
                notes_parts.append(f"Affected: {', '.join(ingredients[:5])}")
        elif intent == "MODIFY":
            notes_parts.append(f"Modified {total_count} action(s).")
        elif intent == "REMOVE":
            notes_parts.append(f"Rejected {total_count} action(s).")
    
    # Add action count summary
    if actions_queue:
        notes_parts.append(f"Queue contains {len(actions_queue)} action(s).")
    else:
        notes_parts.append("Queue is empty. Try 'generate action plan' to populate.")
    
    notes = " ".join(notes_parts) or f"Processed request: {user_message[:100]}"

    return {
        "intent": intent,
        "queue_operation": queue_operation,
        "filters_applied": filters_applied,
        "actions_queue": actions_queue,
        "executions_triggered": executions_triggered,
        "execution_details": execution_details,  # NEW: Include detailed execution results
        "notes": notes,
    }


def _format_action_for_queue(action: Dict) -> Dict:
    """Convert an internal action dict to the public queue schema."""
    action_type = action.get("type", action.get("action_type", ""))
    ingredient = action.get("ingredient", action.get("payload", {}).get("ingredient", "—"))
    status = action.get("status", "proposed")

    # Build Actions list from action details
    actions_list = []
    if action_type == "draft_po":
        qty = action.get("quantity", action.get("payload", {}).get("quantity", ""))
        unit = action.get("unit", action.get("payload", {}).get("unit", "units"))
        if qty:
            actions_list.append(f"Order {qty} {unit}")
        else:
            actions_list.append("Draft purchase order")
    elif action_type == "create_task":
        desc = action.get("description", action.get("payload", {}).get("notes", ""))
        actions_list.append(desc or "Kitchen task")
    elif action_type == "adjust_par":
        pct = action.get("change_percent", action.get("payload", {}).get("par_change_pct", 0))
        actions_list.append(f"Adjust par level by {pct:+.0f}%")
    else:
        impact = action.get("expected_impact", "")
        if impact:
            actions_list.append(impact)

    return {
        "action_id": (action.get("action_id", "") or "")[:8],
        "Type": _action_type_to_display(action_type),
        "Ingredient": ingredient.replace("_", " ").title() if ingredient else "—",
        "Risk": action.get("risk", action.get("risk_level", "medium")),
        "Owner": action.get("owner", action.get("owner_role", "—")),
        "Status": status.replace("_", " ").title(),
        "Reason": (action.get("reason", "") or "")[:120],
        "Actions": actions_list,
    }


def _action_type_to_display(action_type: str) -> str:
    """Map internal action_type to display-friendly Type."""
    mapping = {
        "draft_po": "Purchase Order",
        "create_task": "Kitchen Task",
        "adjust_par": "Par Adjustment",
        "update_delivery_eta": "Delivery ETA Update",
        "transfer_stock": "Stock Transfer",
        "acknowledge_alert": "Alert Acknowledgement",
    }
    return mapping.get(action_type, action_type.replace("_", " ").title() if action_type else "Action")
