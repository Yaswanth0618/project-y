"""
SpellStock AI | Predictive Inventory — Flask app.

Endpoints:
  GET  /                        → main UI
  POST /api/simulate            → legacy scenario simulation
  POST /api/gemini_explain      → Gemini proxy for frontend alert explanations
  GET  /api/inventory/restaurants → Inventory Hub charts
  POST /run-inventory-check     → full pipeline: classifier → risk → rules → eligibility → Gemini
  GET  /alerts                  → current active alerts
  POST /chat                    → manager chatbot (Gemini)

Agent (Agentic Inventory Mode):
  POST /agent/plan              → Sense → Plan → Propose action queue
  POST /agent/command           → Operator command → action queue
  POST /agent/execute           → Approve & execute one action
  POST /agent/approve           → Approve one action (no execute)
  POST /agent/reject            → Reject one action
  POST /agent/rollback          → Roll back one executed action
  POST /agent/auto              → Auto-approve & execute low-risk actions
  GET  /agent/actions           → All actions (optionally filtered by status)
  GET  /agent/history           → Audit log
  GET  /agent/status            → Agent system status
"""
import os
from dotenv import load_dotenv

# Load .env BEFORE any module that reads env vars
load_dotenv()

from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

from backend.gemini_style import parse_scenario
from backend.inventory_engine import simulate_risk

# ── Pipeline imports ──────────────────────────────────────────────────────────
from pipeline.risk_event_generator import load_classifier_output, generate_risk_events
from pipeline.rule_engine import load_rules, apply_rules
from pipeline.alert_eligibility import filter_eligible_alerts, reset_history
from pipeline.supabase_client import get_historical_context
from pipeline.gemini_agent import generate_alert, chat as gemini_chat

# ── Agent imports ─────────────────────────────────────────────────────────────
from pipeline.agent.planner import generate_plan, generate_plan_from_command
from pipeline.agent.executor import (
    store_actions,
    get_action,
    get_all_actions,
    approve_action,
    reject_action,
    execute_action,
    rollback_action,
    auto_approve_and_execute,
)
from pipeline.agent import audit as agent_audit

# ── In-memory alert store (survives until restart) ────────────────────────────
_active_alerts: list = []


from concurrent.futures import ThreadPoolExecutor, as_completed


def _build_alert_for_event(event, restaurant_id):
    """Fetch Supabase context + Gemini alert for a single event.
    Designed to be called in parallel via ThreadPoolExecutor."""
    ctx = get_historical_context(event["item_id"], restaurant_id)
    gemini_risk = {
        "event_type": event["event_type"],
        "ingredient": event["item_id"],
        "confidence": event["confidence"],
        "days_until": event["days_until"],
        "avg_daily_use": ctx.get("avg_daily_use"),
        "latest_days_of_supply_est": ctx.get("latest_days_of_supply_est"),
        "trend": ctx.get("trend"),
        "weekend_avg_use": ctx.get("weekend_avg_use"),
        "weekday_avg_use": ctx.get("weekday_avg_use"),
    }
    gemini_result = generate_alert(gemini_risk, ctx)
    return {
        "risk_event": event,
        "historical_context": ctx,
        "alert_message": gemini_result.get("alert_message", ""),
        "suggested_actions": gemini_result.get("suggested_actions", []),
        "confidence": gemini_result.get("confidence", "medium"),
        "analysis": gemini_result.get("analysis", {}),
    }


def _bootstrap_alerts():
    """Run the full pipeline once at startup to pre-populate _active_alerts.
    Resets the anti-spam history so a fresh server always produces alerts."""
    global _active_alerts
    try:
        reset_history()  # clear cooldown so alerts fire immediately
        predictions = load_classifier_output()
        rules = load_rules()
        risk_events = generate_risk_events(predictions, confidence_threshold=rules.get("min_confidence", 0.6))
        filtered_events = apply_rules(risk_events, rules)
        eligible_events = filter_eligible_alerts(filtered_events)
        if not eligible_events:
            print("[bootstrap] No eligible events after pipeline.")
            return
        restaurant_id = rules.get("restaurant_id", 1)
        # Parallel Supabase + Gemini calls (all events at once)
        with ThreadPoolExecutor(max_workers=min(len(eligible_events), 8)) as pool:
            futures = {pool.submit(_build_alert_for_event, ev, restaurant_id): ev for ev in eligible_events}
            for future in as_completed(futures):
                try:
                    _active_alerts.append(future.result())
                except Exception as exc:
                    print(f"[bootstrap] Alert build failed for {futures[future].get('item_id')}: {exc}")
        print(f"[bootstrap] Pre-loaded {len(_active_alerts)} alert(s) at startup.")
    except Exception as e:
        print(f"[bootstrap] Alert pre-load failed: {e}")


_bootstrap_alerts()


# ═══════════════════════  EXISTING ROUTES  ═══════════════════════════════════

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/simulate', methods=['POST'])
def api_simulate():
    """Parse scenario (Gemini when API key set), run inventory simulation."""
    data = request.get_json() or {}
    scenario = (data.get('scenario') or '').strip()
    if not scenario:
        return jsonify({'error': 'Missing scenario'}), 400
    try:
        params = parse_scenario(scenario)
        inventory = simulate_risk(params)
        return jsonify({'params': params, 'inventory': inventory})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/gemini_explain', methods=['POST'])
def api_gemini_explain():
    """
    Gemini proxy for frontend alerts.js — generate a 3-4 sentence explanation
    for a stockout/waste alert.
    
    Request body:
        ingredient_name, alert_type, restaurant_id, city, concept,
        stockout, waste, eta_hours_stockout, model (optional)
    
    Response:
        { "text": "..." }
    """
    data = request.get_json() or {}
    
    ingredient = data.get("ingredient_name", "Unknown ingredient")
    alert_type = data.get("alert_type", "stockout")
    stockout = data.get("stockout", 0)
    waste = data.get("waste", 0)
    eta_hours = data.get("eta_hours_stockout", 0)
    city = data.get("city", "")
    concept = data.get("concept", "")
    restaurant_id = data.get("restaurant_id", "")
    
    # Build a short prompt for Gemini
    if alert_type == "stockout":
        context = f"Stockout probability is {stockout:.0%}. ETA to stockout: ~{int(eta_hours)} hours."
    else:
        context = f"Predicted waste: ~{waste:.1f} units."
    
    prompt = f"""You are an inventory management AI assistant. Write a brief, actionable 2-3 sentence explanation for a restaurant manager about this alert.

Ingredient: {ingredient}
Alert Type: {alert_type.upper()}
{context}
Location: {city} ({concept})
Restaurant ID: {restaurant_id}

Be specific, mention the ingredient name, and suggest one concrete action. Do not use JSON — respond with plain text only."""

    try:
        from google import genai
        from google.genai import types
        
        api_key = os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            # Fallback if no API key
            fallback = f"Risk is elevated for {ingredient}. Review current on-hand levels and consider placing an order soon to avoid disruption."
            return jsonify({"text": fallback})
        
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                max_output_tokens=150,
            ),
        )
        text = getattr(response, "text", "") or ""
        return jsonify({"text": text.strip()})
    except Exception as e:
        print(f"[api_gemini_explain] Error: {e}")
        fallback = f"Risk is elevated for {ingredient}. Review on-hand vs demand. Consider ordering soon to reduce disruption."
        return jsonify({"text": fallback})


@app.route('/api/inventory/restaurants', methods=['GET'])
def api_restaurant_inventory():
    """Return inventory data per restaurant for Inventory Hub charts."""
    try:
        restaurants = [
            {'id': 'main', 'name': 'Main Kitchen', 'params': {'demand_multiplier': 1.0, 'horizon_hours': 72}},
            {'id': 'downtown', 'name': 'Downtown Branch', 'params': {'demand_multiplier': 1.2, 'horizon_hours': 48}},
            {'id': 'harbor', 'name': 'Harbor View', 'params': {'demand_multiplier': 0.8, 'horizon_hours': 72}},
        ]
        out = []
        for r in restaurants:
            inv = simulate_risk(r['params'])
            out.append({'id': r['id'], 'name': r['name'], 'inventory': inv})
        return jsonify({'restaurants': out})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ═══════════════════════  NEW PIPELINE ROUTES  ═══════════════════════════════

@app.route('/run-inventory-check', methods=['POST'])
def run_inventory_check():
    """
    Full post-classifier pipeline:
      classifier_output.txt → Risk Events → Rule Engine → Alert Eligibility
      → Supabase Context → Gemini Alert Phrasing → stored alerts.
    """
    global _active_alerts
    try:
        # 1. Load classifier predictions (simulated external API)
        predictions = load_classifier_output()

        # 2. Generate risk events (deterministic)
        rules = load_rules()
        risk_events = generate_risk_events(predictions, confidence_threshold=rules.get("min_confidence", 0.6))

        # 3. Apply rule engine (deterministic)
        filtered_events = apply_rules(risk_events, rules)

        # 4. Alert eligibility (deterministic anti-spam)
        #    Reset history so manual re-scans always produce results
        reset_history()
        eligible_events = filter_eligible_alerts(filtered_events)

        if not eligible_events:
            return jsonify({
                'status': 'ok',
                'message': 'No new alerts — all items are within normal parameters or recently alerted.',
                'alerts': _active_alerts,
                'pipeline_summary': {
                    'predictions_loaded': len(predictions),
                    'risk_events_generated': len(risk_events),
                    'after_rule_engine': len(filtered_events),
                    'eligible_for_alert': 0,
                },
            })

        # 5. Parallel: fetch Supabase context + Gemini alert for all events at once
        restaurant_id = rules.get("restaurant_id", 1)
        new_alerts = []
        with ThreadPoolExecutor(max_workers=min(len(eligible_events), 8)) as pool:
            futures = {pool.submit(_build_alert_for_event, ev, restaurant_id): ev for ev in eligible_events}
            for future in as_completed(futures):
                try:
                    new_alerts.append(future.result())
                except Exception as exc:
                    print(f"[inventory-check] Alert build failed for {futures[future].get('item_id')}: {exc}")

        # Store alerts (append, dedup by item_id — latest wins)
        existing_ids = {a["risk_event"]["item_id"] for a in new_alerts}
        _active_alerts = [a for a in _active_alerts if a["risk_event"]["item_id"] not in existing_ids]
        _active_alerts.extend(new_alerts)

        return jsonify({
            'status': 'ok',
            'message': f'{len(new_alerts)} new alert(s) generated.',
            'new_alerts': new_alerts,
            'all_alerts': _active_alerts,
            'pipeline_summary': {
                'predictions_loaded': len(predictions),
                'risk_events_generated': len(risk_events),
                'after_rule_engine': len(filtered_events),
                'eligible_for_alert': len(eligible_events),
                'alerts_generated': len(new_alerts),
            },
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/alerts', methods=['GET'])
def get_alerts():
    """Return all active alerts."""
    return jsonify({'alerts': _active_alerts})


@app.route('/api/home-summary', methods=['GET'])
def home_summary():
    """
    Lightweight curated summaries for the Home page sections.
    Re-reads classifier_output.txt and re-runs the deterministic pipeline
    (risk events → rule engine) on every call so tiles always reflect the
    latest file contents — no Gemini calls needed.
    """
    outlook = []
    reorder = []
    expiring = []

    try:
        # ── Live pipeline: re-read file → risk events → rules (all deterministic) ──
        predictions = load_classifier_output()
        rules = load_rules()
        risk_events = generate_risk_events(
            predictions,
            confidence_threshold=rules.get("min_confidence", 0.6),
        )
        filtered_events = apply_rules(risk_events, rules)

        for ev in filtered_events:
            item_name = (ev.get("item_id") or "").replace("_", " ").title()
            confidence = ev.get("confidence", 0)
            days_until = ev.get("days_until", 99)
            event_type = ev.get("event_type", "")

            # Try to find a matching Gemini-phrased alert for the summary text
            matched_alert = next(
                (a for a in _active_alerts
                 if a.get("risk_event", {}).get("item_id") == ev.get("item_id")),
                None,
            )
            summary = ""
            analysis = {}
            confidence_level = "medium"
            if matched_alert:
                summary = matched_alert.get("alert_message", "")[:120]
                analysis = matched_alert.get("analysis", {})
                confidence_level = matched_alert.get("confidence", "medium")

            outlook.append({
                "item": item_name,
                "event_type": event_type,
                "confidence": confidence,
                "days_until": days_until,
                "summary": summary,
                "confidence_level": confidence_level,
                "analysis": analysis,
            })

            if event_type == "STOCKOUT_RISK":
                reorder.append({
                    "item": item_name,
                    "confidence": confidence,
                    "days_until": days_until,
                    "severity": "Critical" if confidence >= 0.8 else "Reorder",
                })

            if days_until <= 3:
                expiring.append({
                    "item": item_name,
                    "days_until": days_until,
                    "event_type": event_type,
                    "severity": "Urgent" if days_until <= 1 else "Soon",
                })
    except Exception as e:
        print(f"[home-summary] Live pipeline failed, falling back to cached alerts: {e}")
        # Fallback to cached _active_alerts if file read fails
        for a in _active_alerts:
            ev = a.get("risk_event", {})
            item_name = (ev.get("item_id") or "").replace("_", " ").title()
            confidence = ev.get("confidence", 0)
            days_until = ev.get("days_until", 99)
            event_type = ev.get("event_type", "")
            outlook.append({
                "item": item_name,
                "event_type": event_type,
                "confidence": confidence,
                "days_until": days_until,
                "summary": a.get("alert_message", "")[:120],
                "confidence_level": a.get("confidence", "medium"),
                "analysis": a.get("analysis", {}),
            })
            if event_type == "STOCKOUT_RISK":
                reorder.append({"item": item_name, "confidence": confidence, "days_until": days_until, "severity": "Critical" if confidence >= 0.8 else "Reorder"})
            if days_until <= 3:
                expiring.append({"item": item_name, "days_until": days_until, "event_type": event_type, "severity": "Urgent" if days_until <= 1 else "Soon"})

    outlook.sort(key=lambda x: x["confidence"], reverse=True)
    reorder.sort(key=lambda x: x["confidence"], reverse=True)
    expiring.sort(key=lambda x: x["days_until"])

    return jsonify({
        "strategic_outlook": outlook[:6],
        "reorder_alerts": reorder[:5],
        "expiring_soon": expiring[:5],
        "has_data": len(outlook) > 0,
    })


@app.route('/chat', methods=['POST'])
def chat_endpoint():
    """
    Manager chatbot — Gemini answers questions grounded in alert and Supabase data.
    Body: { "message": "Why did I get this alert?" }
    """
    data = request.get_json() or {}
    message = (data.get('message') or '').strip()
    if not message:
        return jsonify({'error': 'Missing message'}), 400

    try:
        # Build context: combine all active alert contexts
        combined_context = {}
        if _active_alerts:
            # Provide a merged view of all historical contexts
            for alert in _active_alerts:
                ctx = alert.get("historical_context", {})
                item_id = alert["risk_event"]["item_id"]
                combined_context[item_id] = ctx

        response_text = gemini_chat(
            question=message,
            active_alerts=_active_alerts,
            context_data=combined_context,
        )
        return jsonify({'response': response_text})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ═══════════════════════  AGENT ROUTES (Agentic Inventory Mode)  ═════════════

@app.route('/agent/plan', methods=['POST'])
def agent_plan():
    """
    Sense → Plan → Propose.
    Trigger: system loop (every 5 min) or manual.
    Reads active alerts + inventory, calls Gemini in agentic mode,
    returns a prioritised action queue.

    Body (optional):
      { "restaurant_id": "main", "horizon_hours": 72, "use_llm": true }
    """
    try:
        data = request.get_json() or {}
        restaurant_id = data.get("restaurant_id", 1)
        horizon_hours = data.get("horizon_hours", 72)
        use_llm = data.get("use_llm", True)

        # Get inventory state
        from backend.inventory_engine import simulate_risk
        inv_params = {"demand_multiplier": 1.0, "horizon_hours": horizon_hours}
        inventory_state = simulate_risk(inv_params)

        # Generate plan from active alerts
        plan = generate_plan(
            active_alerts=_active_alerts,
            inventory_state=inventory_state,
            restaurant_id=str(restaurant_id),
            horizon_hours=horizon_hours,
            use_llm=use_llm,
        )

        # Clear previous actions and store only the new plan
        from pipeline.agent.executor import clear_store
        clear_store()
        store_actions(plan.get("action_queue", []))

        return jsonify(plan)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/agent/command', methods=['POST'])
def agent_command():
    """
    Operator command → action queue.
    Body: { "command": "Fix top 3 alerts" }
    Commands trigger planning, NOT conversation.
    """
    try:
        data = request.get_json() or {}
        command = (data.get("command") or "").strip()
        if not command:
            return jsonify({"error": "Missing 'command' field."}), 400

        from backend.inventory_engine import simulate_risk
        inventory_state = simulate_risk({"demand_multiplier": 1.0, "horizon_hours": 72})

        plan = generate_plan_from_command(
            command=command,
            active_alerts=_active_alerts,
            inventory_state=inventory_state,
        )

        # Clear previous actions and store only the new ones
        from pipeline.agent.executor import clear_store
        clear_store()
        store_actions(plan.get("action_queue", []))

        return jsonify(plan)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/agent/approve', methods=['POST'])
def agent_approve():
    """
    Approve a proposed action (does not execute).
    Body: { "action_id": "uuid" }
    """
    data = request.get_json() or {}
    action_id = data.get("action_id", "")
    if not action_id:
        return jsonify({"error": "Missing action_id."}), 400
    result = approve_action(action_id, actor=data.get("actor", "user"))
    status_code = 200 if result.get("success") else 400
    return jsonify(result), status_code


@app.route('/agent/execute', methods=['POST'])
def agent_execute():
    """
    Execute an approved action.
    Body: { "action_id": "uuid" }
    """
    data = request.get_json() or {}
    action_id = data.get("action_id", "")
    if not action_id:
        return jsonify({"error": "Missing action_id."}), 400

    # If still proposed, approve first (convenience shortcut)
    action = get_action(action_id)
    if action and action.get("status") == "proposed":
        if action.get("requires_approval"):
            return jsonify({
                "error": "Action requires approval before execution.",
                "action": action,
                "success": False,
            }), 403
        approve_action(action_id, actor="auto-shortcut")

    result = execute_action(action_id, actor=data.get("actor", "user"))
    status_code = 200 if result.get("success") else 400
    return jsonify(result), status_code


@app.route('/agent/reject', methods=['POST'])
def agent_reject():
    """
    Reject a proposed action.
    Body: { "action_id": "uuid", "reason": "optional reason" }
    """
    data = request.get_json() or {}
    action_id = data.get("action_id", "")
    if not action_id:
        return jsonify({"error": "Missing action_id."}), 400
    result = reject_action(action_id, actor=data.get("actor", "user"), reason=data.get("reason", ""))
    status_code = 200 if result.get("success") else 400
    return jsonify(result), status_code


@app.route('/agent/rollback', methods=['POST'])
def agent_rollback():
    """
    Roll back an executed action.
    Body: { "action_id": "uuid", "reason": "optional reason" }
    """
    data = request.get_json() or {}
    action_id = data.get("action_id", "")
    if not action_id:
        return jsonify({"error": "Missing action_id."}), 400
    result = rollback_action(action_id, actor=data.get("actor", "user"), reason=data.get("reason", ""))
    status_code = 200 if result.get("success") else 400
    return jsonify(result), status_code


@app.route('/agent/auto', methods=['POST'])
def agent_auto():
    """
    Auto-approve & execute all low-risk actions that don't require approval.
    Call after /agent/plan to immediately process safe actions.
    Body (optional): { "action_ids": ["uuid1", "uuid2"] } — subset, or omit for all proposed.
    """
    try:
        data = request.get_json() or {}
        action_ids = data.get("action_ids")

        if action_ids:
            actions = [get_action(aid) for aid in action_ids]
            actions = [a for a in actions if a is not None]
        else:
            actions = get_all_actions(status_filter="proposed")

        result = auto_approve_and_execute(actions, actor="autopilot")
        return jsonify(result)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/agent/actions', methods=['GET'])
def agent_actions():
    """
    List all actions, optionally filtered.
    Query params: ?status=proposed|approved|executed|rejected|rolled_back
    """
    status_filter = request.args.get("status")
    actions = get_all_actions(status_filter=status_filter)
    return jsonify({
        "actions": actions,
        "total": len(actions),
        "filter": status_filter,
    })


@app.route('/agent/history', methods=['GET'])
def agent_history():
    """
    Audit log — all agent activity, most recent first.
    Query params: ?limit=100&action_id=uuid&event=proposed
    """
    limit = int(request.args.get("limit", 100))
    action_id = request.args.get("action_id")
    event_filter = request.args.get("event")
    log = agent_audit.get_log(limit=limit, action_id=action_id, event_filter=event_filter)
    return jsonify({"audit_log": log, "total": len(log)})


@app.route('/agent/status', methods=['GET'])
def agent_status():
    """Agent system status overview."""
    all_actions = get_all_actions()
    by_status = {}
    for a in all_actions:
        s = a.get("status", "unknown")
        by_status[s] = by_status.get(s, 0) + 1

    return jsonify({
        "agent": "SpellStock Autopilot",
        "mode": "agentic",
        "active_alerts": len(_active_alerts),
        "total_actions": len(all_actions),
        "actions_by_status": by_status,
        "capabilities": [
            "draft_po", "create_task", "adjust_par",
            "update_delivery_eta", "transfer_stock", "acknowledge_alert",
        ],
        "auto_approve_types": ["acknowledge_alert", "create_task", "draft_po", "adjust_par (≤10%)"],
        "approval_required_types": ["update_delivery_eta", "transfer_stock", "adjust_par (>10%)"],
    })


# ══════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    app.run(debug=True, port=5000)
