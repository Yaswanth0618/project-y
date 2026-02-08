/***********************
 * CONFIG
 ************************/
const SUPABASE_URL = "https://nuvblwcrblpumutfcunq.supabase.co/";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51dmJsd2NyYmxwdW11dGZjdW5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MzU1ODQsImV4cCI6MjA4NjAxMTU4NH0.308VT0WolKi_tubo1TR9oqTwLsgyzGGFF0pF5YwRW4o";

const HF_BASE = "https://yashk0618-projecty-classifier-regressor.hf.space";
const HF_STOCKOUT = `${HF_BASE}/predict/stockout`;
const HF_WASTAGE = `${HF_BASE}/predict/wastage`;

// run every 5 minutes
const RUN_EVERY_MS = 5 * 60 * 1000;

/***********************
 * Fixed encoders
 ************************/
const cityMap = { Downtown: 0, Mall: 1, Suburbs: 2, Uptown: 3 };
const conceptMap = { Bakery: 0, "Fast Food": 1, Italian: 2, Steakhouse: 3 };
const weatherMap = { Cloudy: 0, Rainy: 1, Sunny: 2 };

function encode(map, value, name) {
  const k = String(value ?? "").trim();
  if (!(k in map)) {
    console.warn(`[alerts.js] Unknown ${name}: ${k} → default 0`);
    return 0;
  }
  return map[k];
}

/***********************
 * Severity rules
 ************************/
const severityStockout = (p) =>
  p >= 0.85 ? "critical" : p >= 0.7 ? "high" : p >= 0.55 ? "medium" : null;

const severityWaste = (v) =>
  v >= 5 ? "critical" : v >= 2 ? "high" : v >= 1 ? "medium" : null;

/***********************
 * Helpers
 ************************/
const el = (id) => document.getElementById(id);

const setHidden = (id, hidden) => {
  const node = el(id);
  if (node) node.classList.toggle("hidden", hidden);
};

const setStatus = (text) => {
  const node = el("alerts-scan-status");
  if (node) node.textContent = text;
};

const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const toNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/***********************
 * HF call
 ************************/
async function callHF(url, features) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ features }),
  });

  if (!res.ok) {
    throw new Error(`HF ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

/***********************
 * Supabase
 ************************/
let supabaseClient = null;

function initSupabase() {
  if (!window.supabase) {
    throw new Error("Supabase JS not loaded");
  }
  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );
}

/***********************
 * Feature builder (⚠️ EXACTLY 20 VALUES)
 ************************/
function buildFeatureArray(row) {
  const features = [
    toNum(row.restaurant_id), // 1
    encode(cityMap, row.city, "city"), // 2
    encode(conceptMap, row.concept, "concept"), // 3
    toNum(row.ingredient_id), // 4

    0, // 5 🚨 DUMMY ingredient_name_encoded (MODEL EXPECTS THIS)

    toNum(row.starting_on_hand), // 6
    toNum(row.received_qty), // 7
    toNum(row.used_qty), // 8
    toNum(row.waste_qty), // 9
    toNum(row.ending_on_hand), // 10
    toNum(row.order_placed_qty), // 11
    toNum(row.reorder_placed), // 12
    toNum(row.covers), // 13
    toNum(row.dow), // 14
    toNum(row.is_weekend), // 15
    toNum(row.month), // 16
    encode(weatherMap, row.weather, "weather"), // 17
    toNum(row.days_of_supply_est), // 18
    toNum(row.day), // 19
    toNum(row.year), // 20
  ];

  if (features.length !== 20) throw new Error("Invalid feature vector length");
  if (features.some((x) => !Number.isFinite(x)))
    throw new Error("Invalid feature vector (NaN/Inf)");

  return features;
}

/***********************
 * ETA helper
 ************************/
function etaHoursFromRow(row) {
  const days = toNum(row.days_of_supply_est, 0);
  return clamp(days * 24, 0, 24 * 365);
}

/***********************
 * Render alerts (UI)
 * (shows ONLY what you pass in — we will pass one item max)
 ************************/
function renderAlerts(alerts) {
  const stockoutEl = el("alerts-stockout");
  const wasteEl = el("alerts-waste");

  stockoutEl.innerHTML = "";
  wasteEl.innerHTML = "";

  if (!alerts.length) {
    stockoutEl.innerHTML =
      wasteEl.innerHTML =
        `<div class="text-white/40 text-sm">No critical alerts</div>`;
    return;
  }

  // optional: show placeholder in the other column
  const hasStockout = alerts.some((a) => a.alert_type === "stockout");
  const hasWaste = alerts.some((a) => a.alert_type === "waste");

  if (!hasStockout)
    stockoutEl.innerHTML = `<div class="text-white/40 text-sm">No critical stockout alerts</div>`;
  if (!hasWaste)
    wasteEl.innerHTML = `<div class="text-white/40 text-sm">No critical waste alerts</div>`;

  alerts.forEach((a) => {
    const sev =
      a.severity === "critical"
        ? "bg-red-500/20 text-red-200"
        : a.severity === "high"
        ? "bg-orange-500/20 text-orange-200"
        : "bg-yellow-500/20 text-yellow-200";

    const card = `
      <div class="p-3 rounded-xl border border-white/10 bg-white/5">
        <div class="flex justify-between items-start">
          <div>
            <div class="text-white font-medium">${escapeHtml(a.ingredient_name)}</div>
            <div class="text-[11px] text-white/40 mt-1">${escapeHtml(a.message)}</div>
          </div>
          <span class="px-2 py-0.5 text-[10px] rounded-full ${sev}">
            ${escapeHtml(String(a.severity).toUpperCase())}
          </span>
        </div>
      </div>
    `;

    (a.alert_type === "stockout" ? stockoutEl : wasteEl).insertAdjacentHTML(
      "beforeend",
      card
    );
  });
}

/***********************
 * Mini summaries
 ************************/
function updateSummarySplit({ stockout, waste }) {
  el("s-pred").textContent = stockout.predictions;
  el("s-risk").textContent = stockout.riskEvents;
  el("s-rules").textContent = stockout.afterRules;
  el("s-alerts").textContent = stockout.alerts;

  el("w-pred").textContent = waste.predictions;
  el("w-risk").textContent = waste.riskEvents;
  el("w-rules").textContent = waste.afterRules;
  el("w-alerts").textContent = waste.alerts;
}

/***********************
 * Persist alerts to Supabase (only ONE row)
 ************************/
async function writeAlertsToSupabase(alertRows) {
  if (!alertRows.length) return { inserted: 0 };

  const nowIso = new Date().toISOString();
  const payload = alertRows.map((r) => ({
    created_at: nowIso,
    restaurant_id: r.restaurant_id,
    ingredient_id: r.ingredient_id,
    ingredient_name: r.ingredient_name,
    alert_type: r.alert_type,
    severity_text: r.severity_text,
    message_text: r.message_text,
    stockout: r.stockout,
    waste: r.waste,
    eta_hours_stockout: r.eta_hours_stockout,
  }));

  const { error } = await supabaseClient.from("alerts").insert(payload);
  if (error) throw error;

  return { inserted: payload.length };
}

/***********************
 * Pick the single "most critical" alert
 *
 * Only considers CRITICAL alerts.
 * Score method:
 *  - stockout: how far above critical threshold (0.85) the probability is
 *  - waste: how far above critical threshold (5) the prediction is (relative)
 ************************/
function pickTopCritical(alertCandidates) {
  const criticalOnly = alertCandidates.filter((a) => a.severity_text === "critical");
  if (!criticalOnly.length) return null;

  let best = null;
  let bestScore = -Infinity;

  for (const a of criticalOnly) {
    let score = 0;

    if (a.alert_type === "stockout") {
      // normalize vs threshold 0.85..1.00
      score = clamp((a.stockout - 0.85) / 0.15, 0, 10);
    } else {
      // normalize vs threshold 5..(bigger)
      score = clamp(a.waste / 5, 0, 10);
    }

    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }

  return best;
}

/***********************
 * MAIN PIPELINE
 ************************/
let _isRunning = false;

window.runInventoryCheck = async function () {
  if (_isRunning) return; // prevent overlapping runs
  _isRunning = true;

  try {
    setHidden("alerts-initial", true);
    setHidden("alerts-results", false);
    setStatus("Fetching inventory…");

    if (!supabaseClient) initSupabase();

    const { data, error } = await supabaseClient.from("inventory").select("*");
    if (error) throw error;

    const uiAlerts = [];
    const alertCandidates = [];

    const stockout = { predictions: 0, riskEvents: 0, afterRules: 0, alerts: 0 };
    const waste = { predictions: 0, riskEvents: 0, afterRules: 0, alerts: 0 };

    setStatus(`Scoring ${data.length} rows…`);

    for (const row of data) {
      const features = buildFeatureArray(row);

      const pRaw = await callHF(HF_STOCKOUT, features);
      const wRaw = await callHF(HF_WASTAGE, features);

      const p = toNum(pRaw?.prediction, 0);
      const w = toNum(wRaw?.prediction, 0);

      stockout.predictions++;
      waste.predictions++;

      if (p >= 0.4) stockout.riskEvents++;
      if (w >= 0.5) waste.riskEvents++;

      const etaHours = etaHoursFromRow(row);

      const s = severityStockout(p);
      if (s) {
        stockout.afterRules++;
        if (s === "critical") stockout.alerts++;

        const message = `Stockout risk (p=${p.toFixed(2)}) — order soon`;

        // candidate for "top critical"
        alertCandidates.push({
          restaurant_id: toNum(row.restaurant_id),
          ingredient_id: toNum(row.ingredient_id),
          ingredient_name: String(row.ingredient_name ?? ""),
          alert_type: "stockout",
          severity_text: s,
          message_text: message,
          stockout: p,
          waste: w,
          eta_hours_stockout: etaHours,
        });
      }

      const sw = severityWaste(w);
      if (sw) {
        waste.afterRules++;
        if (sw === "critical") waste.alerts++;

        const message = `Waste risk ~${w.toFixed(1)} units — use first`;

        alertCandidates.push({
          restaurant_id: toNum(row.restaurant_id),
          ingredient_id: toNum(row.ingredient_id),
          ingredient_name: String(row.ingredient_name ?? ""),
          alert_type: "waste",
          severity_text: sw,
          message_text: message,
          stockout: p,
          waste: w,
          eta_hours_stockout: etaHours,
        });
      }
    }

    // Pick ONE alert: the most critical one (critical-only)
    const top = pickTopCritical(alertCandidates);

    // UI: show only that one (or none)
    if (top) {
      uiAlerts.push({
        alert_type: top.alert_type,
        severity: top.severity_text,
        ingredient_name: top.ingredient_name,
        message: top.message_text,
      });
    }

    renderAlerts(uiAlerts);
    updateSummarySplit({ stockout, waste });

    // Persist ONLY that one (if exists)
    if (top) {
      setStatus("Saving top critical alert…");
      const { inserted } = await writeAlertsToSupabase([top]);
      setStatus(`Scan complete • saved ${inserted} top critical alert`);
    } else {
      setStatus("Scan complete • no critical alerts");
    }
  } catch (err) {
    console.error(err);
    // avoid annoying popup every 5 mins; keep UI status + console error
    setStatus(`Error: ${err?.message || String(err)}`);
    setHidden("alerts-results", true);
    setHidden("alerts-initial", false);
  } finally {
    _isRunning = false;
  }
};

/***********************
 * Init + auto-run every 5 mins
 ************************/
document.addEventListener("DOMContentLoaded", () => {
  try {
    initSupabase();
  } catch (e) {
    console.error(e);
  }

  el("btn-run-check")?.addEventListener("click", runInventoryCheck);

  // run once immediately
  runInventoryCheck();

  // then every 5 minutes
  setInterval(() => {
    runInventoryCheck();
  }, RUN_EVERY_MS);

  setStatus("Auto-scan enabled (every 5 minutes)");
});
