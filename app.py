"""
jai Pantricks AI | Predictive Inventory — Flask app.

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
from pipeline.agent.copilot import run_copilot, get_session_history, clear_session

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
    """Return inventory data per restaurant for Inventory Hub charts - from Supabase."""
    try:
        from pipeline.supabase_client import _get_client
        from datetime import datetime, timedelta
        from collections import defaultdict
        
        client = _get_client()
        
        # Fetch recent data
        cutoff = (datetime.utcnow() - timedelta(days=1095)).strftime("%Y-%m-%d")
        
        print(f"[INVENTORY-HUB] Fetching data since {cutoff}")
        
        response = client.table("DataPoints").select("*").gte("date", cutoff).order("date", desc=True).limit(1000).execute()
        rows = response.data if response.data else []
        
        print(f"[INVENTORY-HUB] Found {len(rows)} rows from Supabase")
        
        if not rows:
            print("[INVENTORY-HUB] No data found")
            return jsonify({'restaurants': []}), 200
        
        # Print sample to see restaurant IDs
        if rows:
            sample_ids = set(r.get('restaurant_id') for r in rows[:20])
            print(f"[INVENTORY-HUB] Sample restaurant IDs found: {sample_ids}")
        
        # Group by restaurant
        by_restaurant = defaultdict(lambda: defaultdict(list))
        for row in rows:
            rest_id = row.get('restaurant_id')
            ingredient = row.get('ingredient_name', 'Unknown')
            if ingredient and ingredient != 'Unknown' and rest_id is not None:
                by_restaurant[rest_id][ingredient].append(row)
        
        print(f"[INVENTORY-HUB] Grouped into {len(by_restaurant)} restaurants")
        
        # Helper function to map restaurant IDs to info
        def get_restaurant_info(rest_id):
            """Map restaurant_id to display info"""
            # Try as int first
            try:
                rid = int(rest_id)
            except (ValueError, TypeError):
                rid = rest_id
            
            # Mapping of all known restaurant IDs
            mapping = {
                1: {'id': 'main', 'name': 'Main Kitchen'},
                2: {'id': 'downtown', 'name': 'Downtown Branch'},
                3: {'id': 'harbor', 'name': 'Harbor View'},
                4: {'id': 'location4', 'name': 'Westside Location'},
                5: {'id': 'location5', 'name': 'Eastside Location'},
                # String versions
                '1': {'id': 'main', 'name': 'Main Kitchen'},
                '2': {'id': 'downtown', 'name': 'Downtown Branch'},
                '3': {'id': 'harbor', 'name': 'Harbor View'},
                '4': {'id': 'location4', 'name': 'Westside Location'},
                '5': {'id': 'location5', 'name': 'Eastside Location'},
            }
            result = mapping.get(rid)
            if not result:
                result = {'id': f'loc{rid}', 'name': f'Restaurant {rid}'}
            print(f"[INVENTORY-HUB] Mapped restaurant_id {rest_id} -> {result['name']}")
            return result
        
        # Build output structure
        out = []
        for rest_id, ingredients in by_restaurant.items():
            rest_info = get_restaurant_info(rest_id)
            
            inventory = []
            for ingredient_name, items in ingredients.items():
                if not items:
                    continue
                    
                # Sort by date to get latest
                items_sorted = sorted(items, key=lambda x: x.get('date', ''), reverse=True)
                latest = items_sorted[0]
                
                # Calculate metrics from recent data
                recent_7 = items_sorted[:7]
                avg_used = sum(float(i.get('used_qty', 0) or 0) for i in recent_7) / max(len(recent_7), 1)
                avg_on_hand = sum(float(i.get('ending_on_hand', 0) or 0) for i in recent_7) / max(len(recent_7), 1)
                
                current_stock = float(latest.get('ending_on_hand', 0) or 0)
                par_level = max(avg_on_hand * 1.5, 10)
                days_of_supply = (current_stock / avg_used) if avg_used > 0 else 999
                
                # Determine risk status
                if days_of_supply < 2:
                    status = 'CRITICAL'
                    risk_percent = 90
                elif days_of_supply < 4:
                    status = 'HIGH'
                    risk_percent = 70
                elif days_of_supply < 7:
                    status = 'MODERATE'
                    risk_percent = 40
                else:
                    status = 'LOW'
                    risk_percent = 10
                
                inventory.append({
                    'ingredient': ingredient_name,
                    'currentStock': round(current_stock, 1),
                    'parLevel': round(par_level, 1),
                    'unit': 'units',
                    'daysOfSupply': round(days_of_supply, 1),
                    'status': status,
                    'riskPercent': risk_percent,
                    'avgDailyUse': round(avg_used, 1),
                    'reorderPoint': round(par_level * 0.6, 1)
                })
            
            if inventory:  # Only add restaurants that have inventory data
                print(f"[INVENTORY-HUB] Restaurant {rest_info['name']} has {len(inventory)} items")
                out.append({
                    'id': rest_info['id'],
                    'name': rest_info['name'],
                    'inventory': sorted(inventory, key=lambda x: x['riskPercent'], reverse=True)
                })
        
        # Sort restaurants by ID
        out.sort(key=lambda x: x['id'])
        
        total_items = sum(len(r['inventory']) for r in out)
        print(f"[INVENTORY-HUB] Returning {len(out)} restaurants with {total_items} total items")
        
        return jsonify({'restaurants': out})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[INVENTORY-HUB] ERROR: {str(e)}")
        # Return empty data instead of error to prevent breaking the UI
        return jsonify({'restaurants': []}), 200


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
        # Check if Gemini API is configured
        gemini_available = os.environ.get("GEMINI_API_KEY", "") != ""
        if not gemini_available:
            print("[inventory-check] Warning: GEMINI_API_KEY not configured — using deterministic fallback alerts")
        
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
                'gemini_available': gemini_available,
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
        failed_items = []
        with ThreadPoolExecutor(max_workers=min(len(eligible_events), 8)) as pool:
            futures = {pool.submit(_build_alert_for_event, ev, restaurant_id): ev for ev in eligible_events}
            for future in as_completed(futures):
                try:
                    new_alerts.append(future.result())
                except Exception as exc:
                    item_id = futures[future].get('item_id', 'unknown')
                    print(f"[inventory-check] Alert build failed for {item_id}: {exc}")
                    failed_items.append(item_id)

        # Store alerts (append, dedup by item_id — latest wins)
        existing_ids = {a["risk_event"]["item_id"] for a in new_alerts}
        _active_alerts = [a for a in _active_alerts if a["risk_event"]["item_id"] not in existing_ids]
        _active_alerts.extend(new_alerts)

        # Build response message
        message = f'{len(new_alerts)} new alert(s) generated.'
        if not gemini_available:
            message += ' Note: Gemini API not configured — using deterministic fallback alerts.'
        if failed_items:
            message += f' Warning: {len(failed_items)} alert(s) failed to generate.'

        return jsonify({
            'status': 'ok',
            'message': message,
            'new_alerts': new_alerts,
            'all_alerts': _active_alerts,
            'gemini_available': gemini_available,
            'pipeline_summary': {
                'predictions_loaded': len(predictions),
                'risk_events_generated': len(risk_events),
                'after_rule_engine': len(filtered_events),
                'eligible_for_alert': len(eligible_events),
                'alerts_generated': len(new_alerts),
                'failed_alerts': len(failed_items),
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

@app.route('/api/classifier-output', methods=['GET'])
def api_classifier_output():
    """
    Parse and return classifier_output.txt as JSON array.
    Each line is a JSON object with item predictions.
    """
    import json
    import os
    
    classifier_path = os.path.join(os.path.dirname(__file__), 'classifier_output.txt')
    
    try:
        items = []
        with open(classifier_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        item = json.loads(line)
                        items.append(item)
                    except json.JSONDecodeError:
                        continue
        
        return jsonify(items)
    except FileNotFoundError:
        return jsonify({"error": "Classifier output file not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/reports', methods=['GET'])
def api_reports():
    """
    Generate reports from Supabase DataPoints table.
    Query params: ?location=all|main|downtown|harbor
    """
    try:
        from pipeline.supabase_client import _get_client
        
        location = request.args.get('location', 'all')
        
        # Map location to restaurant_id
        location_map = {
            'main': 1,
            'downtown': 2,
            'harbor': 3,
            'all': None
        }
        restaurant_id = location_map.get(location)
        
        client = _get_client()
        
        # Fetch recent data - look back 3 years to handle historical data
        from datetime import datetime, timedelta
        cutoff = (datetime.utcnow() - timedelta(days=1095)).strftime("%Y-%m-%d")  # 3 years
        
        print(f"[REPORTS] Fetching data since {cutoff}, location={location}, restaurant_id={restaurant_id}")
        
        query = client.table("DataPoints").select("*").gte("date", cutoff)
        
        if restaurant_id:
            query = query.eq("restaurant_id", restaurant_id)
        
        response = query.order("date", desc=True).limit(500).execute()
        rows = response.data if response.data else []
        
        print(f"[REPORTS] Found {len(rows)} rows from Supabase")
        
        if not rows:
            print("[REPORTS] No rows found - returning empty reports")
            return jsonify({
                'low_stock': [],
                'usage': [],
                'variance': [],
                'message': 'No data found in the specified date range'
            })
        
        # Print first row to see structure
        if rows:
            print(f"[REPORTS] Sample row keys: {list(rows[0].keys())}")
            print(f"[REPORTS] Sample ingredient: {rows[0].get('ingredient_name')}")
        
        # Process data for three reports
        low_stock = []
        usage = []
        variance = []
        
        # Group by ingredient and restaurant
        from collections import defaultdict
        by_ingredient = defaultdict(list)
        for row in rows:
            ingredient = row.get('ingredient_name')
            rest_id = row.get('restaurant_id')
            if ingredient:  # Only process rows with ingredient name
                key = (ingredient, rest_id)
                by_ingredient[key].append(row)
        
        print(f"[REPORTS] Grouped into {len(by_ingredient)} unique ingredient-location combos")
        
        for (ingredient_name, rest_id), items in by_ingredient.items():
            if not items:
                continue
            
            # Sort by date to get latest first
            items_sorted = sorted(items, key=lambda x: x.get('date', ''), reverse=True)
            latest = items_sorted[0]
            
            location_name = {1: 'Main Kitchen', 2: 'Downtown Branch', 3: 'Harbor View', '1': 'Main Kitchen', '2': 'Downtown Branch', '3': 'Harbor View'}.get(rest_id) or {  # Fallback based on city field if available
            'Downtown': 'Downtown Branch','Harbor': 'Harbor View'}.get(latest.get('city', ''), f'Location {rest_id}')
            
            # Calculate averages from last 7 days of data
            recent_items = items_sorted[:7]
            
            avg_used = sum(float(i.get('used_qty', 0) or 0) for i in recent_items) / len(recent_items) if recent_items else 0
            avg_on_hand = sum(float(i.get('ending_on_hand', 0) or 0) for i in recent_items) / len(recent_items) if recent_items else 0
            
            current_stock = float(latest.get('ending_on_hand', 0) or 0)
            par_level = max(avg_on_hand * 1.5, 10)  # Par is 1.5x average, minimum 10
            
            # LOW STOCK REPORT - show items below par level
            if current_stock < par_level * 0.8:  # Below 80% of par
                status = 'Critical' if current_stock < par_level * 0.4 else 'Low'
                low_stock.append({
                    'item': ingredient_name,
                    'location': location_name,
                    'current': f"{current_stock:.1f}",
                    'par': f"{par_level:.1f}",
                    'status': status
                })
            
            # USAGE REPORT
            predicted_use = avg_used
            actual_use = float(latest.get('used_qty', 0) or 0)
            if predicted_use > 0:
                variance_pct = ((actual_use - predicted_use) / predicted_use * 100)
                usage.append({
                    'item': ingredient_name,
                    'location': location_name,
                    'used': f"{actual_use:.1f}",
                    'predicted': f"{predicted_use:.1f}",
                    'variance': f"{variance_pct:+.0f}%",
                    'variance_class': 'status-low' if abs(variance_pct) > 15 else 'status-ok'
                })
            
            # VARIANCE REPORT (Expected vs Actual stock)
            expected_stock = avg_on_hand
            actual_stock = current_stock
            diff = actual_stock - expected_stock
            if abs(diff) > 1:  # Only show if difference is > 1 unit
                variance.append({
                    'item': ingredient_name,
                    'location': location_name,
                    'expected': f"{expected_stock:.1f}",
                    'actual': f"{actual_stock:.1f}",
                    'diff': f"{diff:+.1f}",
                    'diff_class': 'status-low' if diff < 0 else 'status-ok'
                })
        
        print(f"[REPORTS] Generated {len(low_stock)} low stock, {len(usage)} usage, {len(variance)} variance items")
        
        return jsonify({
            'low_stock': low_stock[:10],
            'usage': usage[:10],
            'variance': variance[:10]
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[REPORTS] ERROR: {str(e)}")
        return jsonify({
            'error': str(e),
            'low_stock': [],
            'usage': [],
            'variance': []
        }), 500


@app.route('/api/forecasts', methods=['GET'])
def api_forecasts():
    """Return demand forecast and stockout risk data from Supabase DataPoints."""
    try:
        from pipeline.supabase_client import _get_client
        from datetime import datetime, timedelta
        from collections import defaultdict

        client = _get_client()
        location_filter = request.args.get('location', 'all')
        cutoff = (datetime.utcnow() - timedelta(days=1095)).strftime("%Y-%m-%d")

        response = client.table("DataPoints").select("*").gte("date", cutoff).order("date", desc=True).limit(2000).execute()
        rows = response.data if response.data else []

        if not rows:
            return jsonify({'demand_forecast': [], 'stockout_risk': [], 'demand_stats': {}, 'risk_stats': {}})

        rest_map = {
            1: 'Main Kitchen', 2: 'Downtown Branch', 3: 'Harbor View',
            '1': 'Main Kitchen', '2': 'Downtown Branch', '3': 'Harbor View',
        }
        loc_id_map = {
            'main': [1, '1'], 'downtown': [2, '2'], 'harbor': [3, '3'],
        }

        # Filter by location if specified
        if location_filter != 'all' and location_filter in loc_id_map:
            valid_ids = loc_id_map[location_filter]
            rows = [r for r in rows if r.get('restaurant_id') in valid_ids]

        # Group rows by (ingredient, restaurant)
        grouped = defaultdict(lambda: defaultdict(list))
        for row in rows:
            ing = row.get('ingredient_name', '')
            rid = row.get('restaurant_id')
            if ing and rid is not None:
                grouped[ing][rid].append(row)

        # ── DEMAND FORECAST ──
        # Predict demand level for next 7 days based on usage trends
        demand_forecast = []
        for ing, by_rest in grouped.items():
            for rid, ing_rows in by_rest.items():
                sorted_rows = sorted(ing_rows, key=lambda x: x.get('date', ''), reverse=True)
                last_3 = sorted_rows[:3]
                mid_2 = sorted_rows[3:5] if len(sorted_rows) >= 5 else sorted_rows[2:4]
                tail_2 = sorted_rows[5:7] if len(sorted_rows) >= 7 else sorted_rows[4:6]

                avg_all = sum(float(r.get('used_qty', 0) or 0) for r in sorted_rows[:7]) / max(min(len(sorted_rows), 7), 1)
                avg_3 = sum(float(r.get('used_qty', 0) or 0) for r in last_3) / max(len(last_3), 1) if last_3 else 0
                avg_mid = sum(float(r.get('used_qty', 0) or 0) for r in mid_2) / max(len(mid_2), 1) if mid_2 else avg_all
                avg_tail = sum(float(r.get('used_qty', 0) or 0) for r in tail_2) / max(len(tail_2), 1) if tail_2 else avg_all

                def level(avg, baseline):
                    if baseline == 0:
                        return 'Low'
                    ratio = avg / baseline
                    if ratio > 1.15:
                        return 'High'
                    elif ratio < 0.85:
                        return 'Low'
                    return 'Med'

                demand_forecast.append({
                    'item': ing,
                    'location': rest_map.get(rid, f'Location {rid}'),
                    'day_1_3': level(avg_3, avg_all),
                    'day_4_5': level(avg_mid, avg_all),
                    'day_6_7': level(avg_tail, avg_all),
                    'avg_daily': round(avg_all, 1),
                })

        # Sort: High demands first
        priority = {'High': 0, 'Med': 1, 'Low': 2}
        demand_forecast.sort(key=lambda x: priority.get(x['day_1_3'], 3))

        # ── STOCKOUT RISK ──
        stockout_risk = []
        critical_count = 0
        high_count = 0
        for ing, by_rest in grouped.items():
            for rid, ing_rows in by_rest.items():
                sorted_rows = sorted(ing_rows, key=lambda x: x.get('date', ''), reverse=True)
                latest = sorted_rows[0]
                recent_7 = sorted_rows[:7]

                current_stock = float(latest.get('ending_on_hand', 0) or 0)
                avg_used = sum(float(r.get('used_qty', 0) or 0) for r in recent_7) / max(len(recent_7), 1)
                days_of_supply = (current_stock / avg_used) if avg_used > 0 else 999
                stockout_flag = latest.get('stockout_next_72h') in (1, True, '1')

                # Risk % calculation
                if days_of_supply < 1:
                    risk_pct = 95
                elif days_of_supply < 2:
                    risk_pct = 85
                elif days_of_supply < 3:
                    risk_pct = 70
                elif days_of_supply < 5:
                    risk_pct = 50
                elif days_of_supply < 7:
                    risk_pct = 30
                else:
                    risk_pct = max(10, int(100 / max(days_of_supply, 1)))

                if stockout_flag:
                    risk_pct = max(risk_pct, 80)

                # Level
                if risk_pct >= 80:
                    level_str = 'Critical'
                    action = 'Reorder within 24h'
                    critical_count += 1
                elif risk_pct >= 55:
                    level_str = 'High'
                    action = 'Schedule delivery'
                    high_count += 1
                elif risk_pct >= 30:
                    level_str = 'Moderate'
                    action = 'Monitor closely'
                else:
                    level_str = 'Low'
                    action = 'Monitor'

                stockout_risk.append({
                    'item': ing,
                    'location': rest_map.get(rid, f'Location {rid}'),
                    'risk_pct': risk_pct,
                    'level': level_str,
                    'action': action,
                    'days_of_supply': round(days_of_supply, 1),
                })

        stockout_risk.sort(key=lambda x: x['risk_pct'], reverse=True)

        # Stats
        total_items_forecast = len(demand_forecast)
        high_demand_count = len([d for d in demand_forecast if d['day_1_3'] == 'High'])
        confidence = min(95, max(60, int(70 + (len(rows) / 100) * 5)))

        demand_stats = {
            'horizon': '7 days',
            'updated': 'Just now',
            'model': 'Pantricks AI',
            'confidence': f'{confidence}%',
        }
        risk_stats = {
            'critical_items': critical_count,
            'high_risk': high_count,
            'horizon': '72 h',
            'last_run': 'Just now',
        }

        return jsonify({
            'demand_forecast': demand_forecast[:20],
            'stockout_risk': stockout_risk[:20],
            'demand_stats': demand_stats,
            'risk_stats': risk_stats,
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'demand_forecast': [], 'stockout_risk': [], 'demand_stats': {}, 'risk_stats': {}}), 200


@app.route('/api/explain-chart', methods=['POST'])
def api_explain_chart():
    """Use Gemini to generate a dynamic explanation of a chart based on its current data."""
    try:
        data = request.get_json() or {}
        chart_id = data.get('chart_id', '')
        chart_data = data.get('chart_data', {})

        if not chart_id:
            return jsonify({'error': 'Missing chart_id'}), 400

        api_key = os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            return jsonify({'explanation': 'Gemini API key not configured. Unable to generate explanation.'}), 200

        from google import genai
        from google.genai import types
        import json as _json

        client = genai.Client(api_key=api_key)

        system = (
            "You are Pantricks AI, a restaurant inventory intelligence assistant. "
            "You explain inventory charts to kitchen managers in 2-3 concise sentences. "
            "Reference the actual data values provided. Highlight anything concerning "
            "(low stock, high waste, risk spikes) and note positive trends too. "
            "Be conversational but data-driven. Do NOT use markdown or bullet points — plain text only."
        )

        user_prompt = (
            f"Explain this chart to a kitchen manager.\n\n"
            f"Chart: {chart_id}\n"
            f"Data: {_json.dumps(chart_data, indent=2)}\n\n"
            f"Give a brief, insightful summary of what this data shows right now."
        )

        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system,
            ),
        )
        text = getattr(response, "text", "") or "Unable to generate explanation."
        return jsonify({'explanation': text.strip()})

    except Exception as e:
        print(f"[explain-chart] Error: {e}")
        return jsonify({'explanation': f'Could not generate explanation: {str(e)}'}), 200


@app.route('/api/dashboard/charts', methods=['GET'])
def api_dashboard_charts():
    """Return stock-by-ingredient and location-comparison data for the dashboard graphs."""
    try:
        from pipeline.supabase_client import _get_client
        from datetime import datetime, timedelta
        from collections import defaultdict

        client = _get_client()
        cutoff = (datetime.utcnow() - timedelta(days=1095)).strftime("%Y-%m-%d")

        response = client.table("DataPoints").select("*").gte("date", cutoff).order("date", desc=True).limit(1000).execute()
        rows = response.data if response.data else []

        if not rows:
            return jsonify({'stock_by_ingredient': [], 'location_comparison': []})

        # --- Stock by Ingredient (aggregated across all locations, latest data) ---
        ingredient_stock = defaultdict(lambda: {'total_stock': 0, 'total_used': 0, 'par_level': 0, 'count': 0})
        seen_latest = {}  # track latest row per (ingredient, restaurant)
        for row in rows:
            ingredient = row.get('ingredient_name', '')
            rest_id = row.get('restaurant_id')
            if not ingredient:
                continue
            key = (ingredient, rest_id)
            if key not in seen_latest:
                seen_latest[key] = row
                stock = float(row.get('ending_on_hand', 0) or 0)
                used = float(row.get('used_qty', 0) or 0)
                ingredient_stock[ingredient]['total_stock'] += stock
                ingredient_stock[ingredient]['total_used'] += used
                ingredient_stock[ingredient]['count'] += 1

        stock_by_ingredient = []
        for name, data in sorted(ingredient_stock.items(), key=lambda x: x[1]['total_stock'], reverse=True):
            avg_used = data['total_used'] / max(data['count'], 1)
            par = max(avg_used * 1.5, 10) * data['count']
            stock_by_ingredient.append({
                'ingredient': name,
                'current_stock': round(data['total_stock'], 1),
                'par_level': round(par, 1),
                'avg_daily_use': round(data['total_used'] / max(data['count'], 1), 1),
            })

        # --- Location Comparison ---
        rest_map = {1: 'Main Kitchen', 2: 'Downtown Branch', 3: 'Harbor View',
                    '1': 'Main Kitchen', '2': 'Downtown Branch', '3': 'Harbor View'}
        by_restaurant = defaultdict(list)
        for row in rows:
            rest_id = row.get('restaurant_id')
            if rest_id is not None:
                by_restaurant[rest_id].append(row)

        location_comparison = []
        for rest_id, rest_rows in by_restaurant.items():
            name = rest_map.get(rest_id, f'Location {rest_id}')
            # Latest rows per ingredient
            latest_by_ing = {}
            for r in rest_rows:
                ing = r.get('ingredient_name', '')
                if ing and ing not in latest_by_ing:
                    latest_by_ing[ing] = r

            total_stock = sum(float(r.get('ending_on_hand', 0) or 0) for r in latest_by_ing.values())
            total_items = len(latest_by_ing)
            avg_risk = 0
            critical = 0
            for ing, r in latest_by_ing.items():
                stock = float(r.get('ending_on_hand', 0) or 0)
                used = float(r.get('used_qty', 0) or 0)
                dos = (stock / used) if used > 0 else 999
                if dos < 2:
                    critical += 1
                    avg_risk += 90
                elif dos < 4:
                    avg_risk += 70
                elif dos < 7:
                    avg_risk += 40
                else:
                    avg_risk += 10
            avg_risk = avg_risk / max(total_items, 1)

            location_comparison.append({
                'location': name,
                'total_stock': round(total_stock, 1),
                'total_items': total_items,
                'avg_risk': round(avg_risk, 1),
                'critical_items': critical,
            })

        location_comparison.sort(key=lambda x: x['location'])

        # --- Calculate summary stats for dashboard stat cards ---
        total_items = len(stock_by_ingredient)
        total_alerts = len([loc for loc in location_comparison if loc.get('critical_items', 0) > 0])
        total_risks = sum(loc.get('critical_items', 0) for loc in location_comparison)
        
        # Calculate expiring soon (items with < 2 days of supply)
        expiring_soon = 0
        seen_ingredients = set()
        for row in rows:
            ingredient = row.get('ingredient_name', '')
            if ingredient and ingredient not in seen_ingredients:
                stock = float(row.get('ending_on_hand', 0) or 0)
                used = float(row.get('used_qty', 0) or 0)
                dos = (stock / used) if used > 0 else 999
                if dos < 2:
                    expiring_soon += 1
                    seen_ingredients.add(ingredient)

        return jsonify({
            'stock_by_ingredient': stock_by_ingredient[:15],  # Top 15
            'location_comparison': location_comparison,
            'total_items': total_items,
            'total_alerts': total_alerts,
            'total_risks': total_risks,
            'expiring_soon': expiring_soon,
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'stock_by_ingredient': [], 'location_comparison': []}), 200


@app.route('/api/inventory/stats', methods=['GET'])
def api_inventory_stats():
    """Return detailed inventory statistics for the Inventory Hub — usage trends, waste, turnover."""
    try:
        from pipeline.supabase_client import _get_client
        from datetime import datetime, timedelta
        from collections import defaultdict

        client = _get_client()
        cutoff = (datetime.utcnow() - timedelta(days=1095)).strftime("%Y-%m-%d")

        response = client.table("DataPoints").select("*").gte("date", cutoff).order("date", desc=False).limit(2000).execute()
        rows = response.data if response.data else []

        if not rows:
            return jsonify({'usage_trends': [], 'waste_analysis': [], 'turnover': [], 'daily_usage_timeline': [], 'summary': {}})

        # --- Summary Stats ---
        all_ingredients = set()
        total_waste = 0
        total_used = 0
        total_stock = 0
        latest_by_ing = {}
        for row in rows:
            ing = row.get('ingredient_name', '')
            if ing:
                all_ingredients.add(ing)
                total_waste += float(row.get('waste_qty', 0) or 0)
                total_used += float(row.get('used_qty', 0) or 0)
            # track latest
            key = (ing, row.get('restaurant_id'))
            latest_by_ing[key] = row

        for key, row in latest_by_ing.items():
            total_stock += float(row.get('ending_on_hand', 0) or 0)

        summary = {
            'total_ingredients': len(all_ingredients),
            'total_stock_on_hand': round(total_stock, 1),
            'total_used_period': round(total_used, 1),
            'total_waste_period': round(total_waste, 1),
            'waste_rate': round((total_waste / total_used * 100) if total_used > 0 else 0, 1),
        }

        # --- Usage Trends (per ingredient, compare last 7 vs prior 7 days) ---
        by_ingredient = defaultdict(list)
        for row in rows:
            ing = row.get('ingredient_name', '')
            if ing:
                by_ingredient[ing].append(row)

        usage_trends = []
        for ing, ing_rows in by_ingredient.items():
            sorted_rows = sorted(ing_rows, key=lambda x: x.get('date', ''), reverse=True)
            last_7 = sorted_rows[:7]
            prior_7 = sorted_rows[7:14]
            avg_last = sum(float(r.get('used_qty', 0) or 0) for r in last_7) / max(len(last_7), 1)
            avg_prior = sum(float(r.get('used_qty', 0) or 0) for r in prior_7) / max(len(prior_7), 1) if prior_7 else avg_last
            change_pct = ((avg_last - avg_prior) / avg_prior * 100) if avg_prior > 0 else 0
            usage_trends.append({
                'ingredient': ing,
                'avg_last_7': round(avg_last, 1),
                'avg_prior_7': round(avg_prior, 1),
                'change_pct': round(change_pct, 1),
                'trend': 'up' if change_pct > 10 else ('down' if change_pct < -10 else 'stable'),
            })
        usage_trends.sort(key=lambda x: abs(x['change_pct']), reverse=True)

        # --- Waste Analysis ---
        waste_analysis = []
        for ing, ing_rows in by_ingredient.items():
            total_waste_ing = sum(float(r.get('waste_qty', 0) or 0) for r in ing_rows)
            total_used_ing = sum(float(r.get('used_qty', 0) or 0) for r in ing_rows)
            waste_rate = (total_waste_ing / total_used_ing * 100) if total_used_ing > 0 else 0
            waste_analysis.append({
                'ingredient': ing,
                'total_waste': round(total_waste_ing, 1),
                'total_used': round(total_used_ing, 1),
                'waste_rate': round(waste_rate, 1),
            })
        waste_analysis.sort(key=lambda x: x['waste_rate'], reverse=True)

        # --- Daily Usage Timeline (aggregated across all ingredients, last 14 days) ---
        by_date = defaultdict(lambda: {'used': 0, 'waste': 0, 'stock': 0})
        for row in rows:
            date = row.get('date', '')
            if date:
                by_date[date]['used'] += float(row.get('used_qty', 0) or 0)
                by_date[date]['waste'] += float(row.get('waste_qty', 0) or 0)
                by_date[date]['stock'] += float(row.get('ending_on_hand', 0) or 0)

        dates_sorted = sorted(by_date.keys())[-14:]  # last 14 days
        daily_usage_timeline = [{
            'date': d,
            'used': round(by_date[d]['used'], 1),
            'waste': round(by_date[d]['waste'], 1),
            'stock': round(by_date[d]['stock'], 1),
        } for d in dates_sorted]

        return jsonify({
            'summary': summary,
            'usage_trends': usage_trends[:15],
            'waste_analysis': waste_analysis[:15],
            'daily_usage_timeline': daily_usage_timeline,
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'summary': {}, 'usage_trends': [], 'waste_analysis': [], 'daily_usage_timeline': []}), 200


@app.route('/api/test-supabase', methods=['GET'])
def test_supabase():
    """Test Supabase connection"""
    try:
        from pipeline.supabase_client import _get_client
        client = _get_client()
        
        # Try to fetch ANY data
        response = client.table("DataPoints").select("*").limit(5).execute()
        
        return jsonify({
            'status': 'connected',
            'row_count': len(response.data) if response.data else 0,
            'sample': response.data[0] if response.data else None
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


# ═══════════════════════  AGENT ROUTES  ══════════════════════════════════════

@app.route('/agent/plan', methods=['POST'])
def agent_plan():
    """
    Sense → Plan → Propose action queue.
    Uses current active alerts to generate a plan via Gemini or fallback.
    Body (optional): { "restaurant_id": "main", "horizon_hours": 72, "use_llm": true }
    """
    data = request.get_json() or {}
    restaurant_id = data.get("restaurant_id", "main")
    horizon_hours = data.get("horizon_hours", 72)
    use_llm = data.get("use_llm", True)

    if not _active_alerts:
        return jsonify({
            "status": "no_alerts",
            "message": "No active alerts — run an inventory check first.",
            "actions": [],
        })

    try:
        result = generate_plan(
            active_alerts=_active_alerts,
            inventory_state=None,
            restaurant_id=restaurant_id,
            horizon_hours=horizon_hours,
            use_llm=use_llm,
        )
        actions = result.get("action_queue", [])
        store_actions(actions)
        return jsonify({
            "status": result.get("status", "planned"),
            "message": result.get("message", ""),
            "actions": actions,
            "grouped_by_owner": result.get("grouped_by_owner", {}),
            "plan_metadata": result.get("plan_metadata", {}),
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Plan generation failed: {e}"}), 500


@app.route('/agent/command', methods=['POST'])
def agent_command():
    """
    Process an operator command and generate actions.
    Body: { "command": "Draft PO for chicken" }
    """
    data = request.get_json() or {}
    command = (data.get("command") or "").strip()
    if not command:
        return jsonify({"error": "Missing 'command' field."}), 400

    if not _active_alerts:
        return jsonify({
            "status": "no_alerts",
            "message": "No active alerts — run an inventory check first.",
            "actions": [],
        })

    try:
        result = generate_plan_from_command(
            command=command,
            active_alerts=_active_alerts,
            inventory_state=None,
        )
        actions = result.get("action_queue", [])
        store_actions(actions)
        return jsonify({
            "status": result.get("status", "planned"),
            "message": result.get("message", ""),
            "actions": actions,
            "grouped_by_owner": result.get("grouped_by_owner", {}),
            "plan_metadata": result.get("plan_metadata", {}),
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Command failed: {e}"}), 500


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
        "agent": "Pantricks Autopilot",
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


# ═══════════════════════  AGENT COPILOT ROUTES  ═════════════════════════════

@app.route('/agent/copilot', methods=['POST'])
def agent_copilot():
    """
    Agent Copilot — intent-to-action translation engine.
    Converts natural language into structured Action Queue operations.

    NOT a chatbot. Returns structured JSON with:
      - intent: VIEW | FILTER | ADD | MODIFY | EXECUTE | REMOVE | RESET
      - queue_operation: APPEND | UPDATE | REPLACE | EXECUTE | NONE
      - actions_queue: current/filtered action objects
      - executions_triggered: IDs of actions modified this turn
      - notes: reasoning about user intent

    Body: { "message": "...", "session_id": "optional-uuid" }
    """
    data = request.get_json() or {}
    message = (data.get("message") or "").strip()
    session_id = data.get("session_id") or str(__import__("uuid").uuid4())

    if not message:
        return jsonify({"error": "Missing 'message' field."}), 400

    if not _active_alerts:
        return jsonify({
            "error": None,
            "structured": {
                "intent": "VIEW",
                "queue_operation": "NONE",
                "filters_applied": {},
                "actions_queue": [],
                "executions_triggered": [],
                "notes": "No active alerts detected. Please run an inventory check first (AI Alerts tab → Run Inventory Check) so I have data to work with.",
            },
            "response": '{"intent":"VIEW","queue_operation":"NONE","filters_applied":{},"actions_queue":[],"executions_triggered":[],"notes":"No active alerts. Run inventory check first."}',
            "tool_calls": [],
            "actions_created": [],
            "session_id": session_id,
            "turn_count": 0,
            "queue_modified": False,
        })

    try:
        result = run_copilot(
            user_message=message,
            session_id=session_id,
            active_alerts=_active_alerts,
        )

        # Determine if queue was modified by checking tool trace
        queue_modifying_tools = {
            "execute_action", "approve_action", "reject_action", "rollback_action",
            "bulk_action", "draft_purchase_order", "create_kitchen_task", "adjust_par_level",
            "generate_action_plan",
        }
        queue_modified = any(
            tc.get("tool") in queue_modifying_tools
            for tc in (result.get("tool_calls") or [])
        )
        result["queue_modified"] = queue_modified

        # DUAL SYNC: If queue was modified, include the full updated actions snapshot
        # This ensures the frontend system queue stays in sync with the conversation queue
        if queue_modified:
            all_actions = get_all_actions()
            result["updated_actions"] = all_actions

        return jsonify(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Copilot error: {e}"}), 500


@app.route('/agent/copilot/history', methods=['GET'])
def agent_copilot_history():
    """Get conversation history for a copilot session."""
    session_id = request.args.get("session_id", "")
    if not session_id:
        return jsonify({"error": "Missing session_id."}), 400
    history = get_session_history(session_id)
    return jsonify({"session_id": session_id, "history": history})


@app.route('/agent/copilot/reset', methods=['POST'])
def agent_copilot_reset():
    """Clear a copilot session to start fresh."""
    data = request.get_json() or {}
    session_id = data.get("session_id", "")
    if session_id:
        clear_session(session_id)
    return jsonify({"status": "ok", "message": "Session cleared."})


# ══════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    app.run(debug=True, port=5000)
