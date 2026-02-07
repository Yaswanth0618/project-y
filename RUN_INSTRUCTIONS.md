# SpellStock AI — Post-Classifier Pipeline + Gemini Agent + Supabase Context

## Architecture

```
Classifier Output (classifier_output.txt — simulated external API)
   ↓
Risk Event Generator (pipeline/risk_event_generator.py — deterministic)
   ↓
Rule Engine (pipeline/rule_engine.py — deterministic, reads rules.json)
   ↓
Alert Eligibility Logic (pipeline/alert_eligibility.py — deterministic anti-spam)
   ↓
Supabase Historical Context (pipeline/supabase_client.py — DataPoints table)
   ↓
Gemini LLM Agent (pipeline/gemini_agent.py)
   ├─ Context-aware alert phrasing
   ├─ Action suggestions (quantified order/promotion recommendations)
   └─ Manager chatbot (Q&A grounded in real data)
   ↓
Flask API → Existing Web UI (alerts + chat panels)
```

## Folder Structure

```
project-y/
├── app.py                          # Flask app with all API endpoints
├── classifier_output.txt           # Simulated classifier predictions (one JSON per line)
├── rules.json                      # Configurable rule engine settings
├── requirements.txt                # Python dependencies
├── .env                            # Secrets (NEVER commit this)
├── .gitignore
│
├── pipeline/                       # Post-classifier pipeline modules
│   ├── __init__.py
│   ├── risk_event_generator.py     # Classifier → Risk Events (deterministic)
│   ├── rule_engine.py              # Rules filter (deterministic)
│   ├── alert_eligibility.py        # Anti-spam logic (deterministic)
│   ├── supabase_client.py          # Supabase data_points queries + aggregation
│   └── gemini_agent.py             # Gemini alert phrasing + chat agent
│
├── backend/                        # Original simulation modules
│   ├── gemini_style.py
│   └── inventory_engine.py
│
├── templates/
│   └── index.html                  # Main UI (Jinja2 template)
│
└── static/
    ├── backend/
    │   └── main.js                 # Frontend logic (alerts + chat panels added)
    └── Styles/
        └── main.css                # Styles
```

## Setup & Run

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure secrets

Create a `.env` file in the project root:

```env
SUPABASE_URL=https://nuvblwcrblpumutfcunq.supabase.co
SUPABASE_ANON_KEY=<your_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
GEMINI_API_KEY=<your_gemini_api_key>
```

### 3. Run the Flask server

```bash
python app.py
```

The app will be available at `http://127.0.0.1:5000`.

## API Endpoints

| Method   | Endpoint                     | Description                            |
| -------- | ---------------------------- | -------------------------------------- |
| GET      | `/`                          | Main UI                                |
| POST     | `/api/simulate`              | Legacy scenario simulation             |
| GET      | `/api/inventory/restaurants` | Inventory Hub chart data               |
| **POST** | **`/run-inventory-check`**   | **Full pipeline: classifier → alerts** |
| **GET**  | **`/alerts`**                | **Get all active alerts**              |
| **POST** | **`/chat`**                  | **Manager chatbot (Gemini Q&A)**       |

### POST /run-inventory-check

Runs the full pipeline. Returns generated alerts with Gemini phrasing.

### GET /alerts

Returns all currently active alerts as JSON.

### POST /chat

Body: `{ "message": "Why did I get this alert?" }`

Returns: `{ "response": "..." }` — Gemini response grounded in real data.

## Configuring Rules

Edit `rules.json`:

```json
{
  "min_confidence": 0.6,
  "max_days_out": 7,
  "ignored_ingredients": ["parsley"],
  "restaurant_id": 1
}
```

## Simulating Classifier Output

Edit `classifier_output.txt` — one JSON object per line:

```json
{
  "item_id": "chicken_breast",
  "stockout_probability": 0.82,
  "surplus_probability": 0.1,
  "days_until_event": 2,
  "expected_units": 0
}
```

## Key Design Principles

1. **All decisions happen before the LLM** — thresholds, timing, and risk classification are deterministic.
2. **The LLM only explains, contextualises, suggests, and chats** — never decides.
3. **Data-grounded reasoning** — Gemini receives structured Supabase historical context.
4. **Anti-spam** — one alert per ingredient per 24h unless conditions worsen.
5. **Secrets never in code** — all loaded from environment variables.
