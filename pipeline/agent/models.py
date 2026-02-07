"""
Agent Action Models — structured schemas for the agentic inventory layer.

Every action the agent proposes or executes conforms to these types.
This module is pure data — no side effects, no I/O.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


# ── Enums ──────────────────────────────────────────────────────────────────────

class ActionType(str, Enum):
    DRAFT_PO = "draft_po"
    CREATE_TASK = "create_task"
    ADJUST_PAR = "adjust_par"
    UPDATE_DELIVERY_ETA = "update_delivery_eta"
    TRANSFER_STOCK = "transfer_stock"
    ACKNOWLEDGE_ALERT = "acknowledge_alert"


class OwnerRole(str, Enum):
    PURCHASING = "Purchasing"
    KITCHEN = "Kitchen"
    VENDOR_OPS = "VendorOps"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ActionStatus(str, Enum):
    PROPOSED = "proposed"
    APPROVED = "approved"
    EXECUTING = "executing"
    EXECUTED = "executed"
    ROLLED_BACK = "rolled_back"
    REJECTED = "rejected"


# ── Auto-approve policy ───────────────────────────────────────────────────────

# Actions that can be auto-executed without human approval
AUTO_APPROVE_RULES = {
    ActionType.ACKNOWLEDGE_ALERT: True,
    ActionType.CREATE_TASK: True,
    ActionType.DRAFT_PO: True,          # DRAFT only, not sent
    ActionType.ADJUST_PAR: "threshold",  # only if change ≤ 10%
    ActionType.UPDATE_DELIVERY_ETA: False,
    ActionType.TRANSFER_STOCK: False,
}

PAR_AUTO_APPROVE_MAX_PCT = 10  # auto-approve par changes ≤ 10%


def requires_approval(action_type: ActionType, payload: Dict[str, Any]) -> bool:
    """Determine whether an action needs human approval."""
    rule = AUTO_APPROVE_RULES.get(action_type, True)

    if rule is True:
        return False  # auto-approvable
    if rule is False:
        return True   # always needs approval

    # Threshold-based (par adjustment)
    if rule == "threshold" and action_type == ActionType.ADJUST_PAR:
        pct_change = abs(payload.get("par_change_pct", 100))
        return pct_change > PAR_AUTO_APPROVE_MAX_PCT

    return True  # default: require approval


# ── Action object ─────────────────────────────────────────────────────────────

def create_action(
    action_type: str,
    payload: Dict[str, Any],
    owner_role: str,
    risk_level: str,
    expected_impact: str,
    reason: str,
    source_alert_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build a fully-formed action dict conforming to the agentic schema.

    All actions start as status = "proposed".
    """
    at = ActionType(action_type)
    needs_approval = requires_approval(at, payload)

    return {
        "action_id": str(uuid.uuid4()),
        "action_type": at.value,
        "payload": payload,
        "owner_role": owner_role,
        "risk_level": risk_level,
        "requires_approval": needs_approval,
        "expected_impact": expected_impact,
        "reason": reason,
        "status": ActionStatus.PROPOSED.value,
        "source_alert_id": source_alert_id,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }


# ── Action Queue helpers ──────────────────────────────────────────────────────

_RISK_PRIORITY = {RiskLevel.HIGH.value: 0, RiskLevel.MEDIUM.value: 1, RiskLevel.LOW.value: 2}


def prioritize_actions(actions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Sort actions: high risk first, then by creation time."""
    return sorted(
        actions,
        key=lambda a: (_RISK_PRIORITY.get(a.get("risk_level", "low"), 9), a.get("created_at", "")),
    )


def group_by_owner(actions: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Group actions by owner_role."""
    groups: Dict[str, List[Dict[str, Any]]] = {}
    for a in actions:
        role = a.get("owner_role", "Unknown")
        groups.setdefault(role, []).append(a)
    return groups
