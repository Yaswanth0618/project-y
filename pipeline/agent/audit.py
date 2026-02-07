"""
Agent Audit Logger — immutable append-only log with before/after snapshots.

All proposed, executed, approved, rejected, and rolled-back actions are
recorded here.  The log is stored in-memory and persisted to JSON.

This module does NOT make decisions.  It only records facts.
"""
import json
import os
import threading
from datetime import datetime
from typing import Any, Dict, List, Optional

_LOG_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "agent_audit_log.json",
)

_lock = threading.Lock()
_audit_log: List[Dict[str, Any]] = []


def _load() -> None:
    """Load persisted audit log from disk."""
    global _audit_log
    try:
        if os.path.exists(_LOG_FILE):
            with open(_LOG_FILE, "r") as f:
                _audit_log = json.load(f)
    except (json.JSONDecodeError, IOError):
        _audit_log = []


def _save() -> None:
    """Persist audit log to disk."""
    try:
        with open(_LOG_FILE, "w") as f:
            json.dump(_audit_log, f, indent=2)
    except IOError:
        pass


def record(
    action_id: str,
    event: str,
    action_snapshot: Dict[str, Any],
    before_state: Optional[Dict[str, Any]] = None,
    after_state: Optional[Dict[str, Any]] = None,
    actor: str = "system",
    notes: str = "",
) -> Dict[str, Any]:
    """
    Append an immutable audit entry.

    Args:
        action_id: UUID of the action.
        event: One of proposed | approved | rejected | executing |
               executed | rolled_back | error.
        action_snapshot: Full copy of the action dict at this moment.
        before_state: Optional snapshot of state before execution.
        after_state: Optional snapshot of state after execution.
        actor: Who triggered this event (system, user, auto-approve).
        notes: Free-text operational notes.

    Returns:
        The audit entry dict.
    """
    entry = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "action_id": action_id,
        "event": event,
        "actor": actor,
        "action_snapshot": action_snapshot,
        "before_state": before_state,
        "after_state": after_state,
        "notes": notes,
    }
    with _lock:
        _load()
        _audit_log.append(entry)
        _save()
    return entry


def get_log(
    limit: int = 100,
    action_id: Optional[str] = None,
    event_filter: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Retrieve audit entries, most recent first.

    Args:
        limit: Max entries to return.
        action_id: Filter to a specific action.
        event_filter: Filter to a specific event type.
    """
    with _lock:
        _load()
        log = list(_audit_log)

    if action_id:
        log = [e for e in log if e.get("action_id") == action_id]
    if event_filter:
        log = [e for e in log if e.get("event") == event_filter]

    log.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
    return log[:limit]


def get_recent_actions(limit: int = 50) -> List[Dict[str, Any]]:
    """Return the most recently *proposed* action snapshots (for history context)."""
    with _lock:
        _load()
        proposed = [
            e["action_snapshot"]
            for e in _audit_log
            if e.get("event") == "proposed"
        ]
    return proposed[-limit:]


def clear_log() -> None:
    """Clear the audit log (testing only)."""
    global _audit_log
    with _lock:
        _audit_log = []
        if os.path.exists(_LOG_FILE):
            os.remove(_LOG_FILE)
