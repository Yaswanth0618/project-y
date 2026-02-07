"""
Agent Executor — Approve → Execute → Log.

Manages the lifecycle of proposed actions:
  - approve / reject individual actions
  - execute approved actions (via backend API calls)
  - rollback executed actions
  - auto-approve low-risk actions when autopilot is on

This module is the ONLY place where action status transitions happen.
All transitions are recorded in the audit log.
"""
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from pipeline.agent.models import ActionStatus, ActionType, requires_approval
from pipeline.agent import audit


# ── In-memory action store ────────────────────────────────────────────────────
# Keyed by action_id. Populated by planner, mutated here.
_action_store: Dict[str, Dict[str, Any]] = {}


def store_actions(actions: List[Dict[str, Any]]) -> None:
    """Register proposed actions in the executor store."""
    for a in actions:
        _action_store[a["action_id"]] = a


def get_action(action_id: str) -> Optional[Dict[str, Any]]:
    """Look up an action by ID."""
    return _action_store.get(action_id)


def get_all_actions(status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return all actions, optionally filtered by status."""
    actions = list(_action_store.values())
    if status_filter:
        actions = [a for a in actions if a.get("status") == status_filter]
    actions.sort(key=lambda a: a.get("created_at", ""), reverse=True)
    return actions


def clear_store() -> None:
    """Clear all actions (testing only)."""
    _action_store.clear()


# ── Status transitions ────────────────────────────────────────────────────────

_VALID_TRANSITIONS = {
    ActionStatus.PROPOSED.value: {
        ActionStatus.APPROVED.value,
        ActionStatus.REJECTED.value,
    },
    ActionStatus.APPROVED.value: {
        ActionStatus.EXECUTING.value,
    },
    ActionStatus.EXECUTING.value: {
        ActionStatus.EXECUTED.value,
        ActionStatus.ROLLED_BACK.value,
    },
    ActionStatus.EXECUTED.value: {
        ActionStatus.ROLLED_BACK.value,
    },
}


def _transition(action: Dict[str, Any], new_status: str, actor: str = "system", notes: str = "") -> bool:
    """Validate and apply a status transition. Returns True on success."""
    current = action.get("status", "")
    allowed = _VALID_TRANSITIONS.get(current, set())

    if new_status not in allowed:
        audit.record(
            action_id=action["action_id"],
            event="error",
            action_snapshot=action,
            actor=actor,
            notes=f"Invalid transition: {current} → {new_status}. {notes}",
        )
        return False

    before_snapshot = dict(action)
    action["status"] = new_status
    action["updated_at"] = datetime.utcnow().isoformat() + "Z"

    audit.record(
        action_id=action["action_id"],
        event=new_status,
        action_snapshot=dict(action),
        before_state=before_snapshot,
        actor=actor,
        notes=notes,
    )
    return True


# ── Public API ────────────────────────────────────────────────────────────────

def approve_action(action_id: str, actor: str = "user") -> Dict[str, Any]:
    """Approve a proposed action for execution."""
    action = _action_store.get(action_id)
    if not action:
        return {"error": f"Action {action_id} not found.", "success": False}

    if action["status"] != ActionStatus.PROPOSED.value:
        return {"error": f"Action is '{action['status']}', not 'proposed'.", "success": False}

    ok = _transition(action, ActionStatus.APPROVED.value, actor=actor)
    return {"success": ok, "action": action}


def reject_action(action_id: str, actor: str = "user", reason: str = "") -> Dict[str, Any]:
    """Reject a proposed action."""
    action = _action_store.get(action_id)
    if not action:
        return {"error": f"Action {action_id} not found.", "success": False}

    if action["status"] != ActionStatus.PROPOSED.value:
        return {"error": f"Action is '{action['status']}', not 'proposed'.", "success": False}

    ok = _transition(action, ActionStatus.REJECTED.value, actor=actor, notes=reason)
    return {"success": ok, "action": action}


def execute_action(action_id: str, actor: str = "system") -> Dict[str, Any]:
    """
    Execute an approved action.

    In a real system this would call backend APIs (send PO, update par, etc.).
    For now it simulates execution and records the transition.
    """
    action = _action_store.get(action_id)
    if not action:
        return {"error": f"Action {action_id} not found.", "success": False}

    if action["status"] != ActionStatus.APPROVED.value:
        return {"error": f"Action is '{action['status']}', not 'approved'.", "success": False}

    # Mark as executing
    _transition(action, ActionStatus.EXECUTING.value, actor=actor)

    # Simulate execution based on action type
    exec_result = _simulate_execution(action)

    # Mark as executed (or rolled back on failure)
    if exec_result.get("success"):
        _transition(
            action,
            ActionStatus.EXECUTED.value,
            actor=actor,
            notes=json.dumps(exec_result.get("result", {})),
        )
    else:
        _transition(
            action,
            ActionStatus.ROLLED_BACK.value,
            actor=actor,
            notes=f"Execution failed: {exec_result.get('error', 'unknown')}",
        )

    return {"success": exec_result.get("success", False), "action": action, "exec_result": exec_result}


def rollback_action(action_id: str, actor: str = "user", reason: str = "") -> Dict[str, Any]:
    """Roll back an executed action."""
    action = _action_store.get(action_id)
    if not action:
        return {"error": f"Action {action_id} not found.", "success": False}

    if action["status"] not in (ActionStatus.EXECUTING.value, ActionStatus.EXECUTED.value):
        return {"error": f"Action is '{action['status']}', cannot rollback.", "success": False}

    ok = _transition(action, ActionStatus.ROLLED_BACK.value, actor=actor, notes=reason)
    return {"success": ok, "action": action}


def auto_approve_and_execute(actions: List[Dict[str, Any]], actor: str = "auto-approve") -> Dict[str, Any]:
    """
    For actions that don't require approval (low-risk), auto-approve and execute.

    Returns summary of what was auto-processed vs what needs human review.
    """
    auto_processed = []
    needs_review = []

    for action in actions:
        if not action.get("requires_approval", True):
            # Auto-approve
            approve_result = approve_action(action["action_id"], actor=actor)
            if approve_result.get("success"):
                # Auto-execute
                exec_result = execute_action(action["action_id"], actor=actor)
                auto_processed.append({
                    "action_id": action["action_id"],
                    "action_type": action["action_type"],
                    "status": action["status"],
                    "exec_success": exec_result.get("success", False),
                })
            else:
                needs_review.append(action)
        else:
            needs_review.append(action)

    return {
        "auto_processed": auto_processed,
        "needs_review": needs_review,
        "summary": f"{len(auto_processed)} auto-executed, {len(needs_review)} awaiting approval.",
    }


# ── Simulated execution ──────────────────────────────────────────────────────

def _simulate_execution(action: Dict[str, Any]) -> Dict[str, Any]:
    """
    Simulate executing an action.

    In production this would call real backend APIs:
      - draft_po → procurement system
      - create_task → task management
      - adjust_par → inventory config
      - update_delivery_eta → vendor portal
      - transfer_stock → logistics
      - acknowledge_alert → alert system

    For now, all simulations succeed.
    """
    action_type = action.get("action_type", "")
    payload = action.get("payload", {})
    ingredient = payload.get("ingredient", "unknown")

    result_map = {
        ActionType.DRAFT_PO.value: {
            "success": True,
            "result": {
                "po_number": f"PO-{action['action_id'][:8].upper()}",
                "ingredient": ingredient,
                "quantity": payload.get("quantity"),
                "status": "DRAFT",
                "message": f"Draft PO created for {ingredient}. Awaiting send approval.",
            },
        },
        ActionType.CREATE_TASK.value: {
            "success": True,
            "result": {
                "task_id": f"TASK-{action['action_id'][:8].upper()}",
                "ingredient": ingredient,
                "assigned_to": action.get("owner_role", "Kitchen"),
                "message": f"Task created: {payload.get('notes', 'No details')}",
            },
        },
        ActionType.ADJUST_PAR.value: {
            "success": True,
            "result": {
                "ingredient": ingredient,
                "par_change_pct": payload.get("par_change_pct", 0),
                "message": f"Par level adjusted by {payload.get('par_change_pct', 0)}% for {ingredient}.",
            },
        },
        ActionType.UPDATE_DELIVERY_ETA.value: {
            "success": True,
            "result": {
                "ingredient": ingredient,
                "new_eta": payload.get("due_time"),
                "message": f"Delivery ETA updated for {ingredient}.",
            },
        },
        ActionType.TRANSFER_STOCK.value: {
            "success": True,
            "result": {
                "ingredient": ingredient,
                "quantity": payload.get("quantity"),
                "message": f"Stock transfer initiated for {ingredient}.",
            },
        },
        ActionType.ACKNOWLEDGE_ALERT.value: {
            "success": True,
            "result": {
                "ingredient": ingredient,
                "message": f"Alert acknowledged for {ingredient}.",
            },
        },
    }

    return result_map.get(action_type, {"success": True, "result": {"message": "Action executed."}})
