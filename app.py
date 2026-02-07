"""
SpellStock AI | Predictive Inventory — Flask app.
Structure: app.py, templates/, static/Styles/, static/Backend/
"""
import os
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# Optional: add static/Backend to path if you put Python modules there
# sys.path.insert(0, os.path.join(app.root_path, 'static', 'Backend'))

from backend.gemini_style import parse_scenario
from backend.inventory_engine import simulate_risk


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/simulate', methods=['POST'])
def api_simulate():
    """Parse scenario (Gemini when API key set), run inventory simulation, return params + inventory."""
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


if __name__ == '__main__':
    app.run(debug=True, port=5000)
