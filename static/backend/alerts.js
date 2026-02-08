/***********************
 * CONFIG
 ************************/
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

// Your HF Space base (NO trailing slash is safest)
const HF_BASE = "https://yashk0618-projecty-classifier-regressor.hf.space";

// Endpoints
const HF_STOCKOUT = `${HF_BASE}/predict/stockout`;
const HF_WASTAGE = `${HF_BASE}/predict/wastage`;

/***********************
 * LabelEncoder mappings (from your training output)
 ************************/
const cityMap = {
  "Downtown": 0,
  "Mall": 1,
  "Suburbs": 2,
  "Uptown": 3,
};

const conceptMap = {
  "Bakery": 0,
  "Fast Food": 1,
  "Italian": 2,
  "Steakhouse": 3,
};

const ingredientNameMap = {
  "Beef Patty": 0,
  "Chicken Breast": 1,
  "Flour": 2,
  "Lettuce": 3,
  "Mozzarella": 4,
  "Steak": 5,
  "Sugar": 6,
  "Tomato Sauce": 7,
};

const weatherMap = {
  "Cloudy": 0,
  "Rainy": 1,
  "Sunny": 2,
};

function encode(map, value, colName) {
  const key = String(value ?? "").trim();
  if (!(key in map)) {
    // If this triggers, your inventory has a new label not seen in training.
    // Fix by adding it to the mapping (and ideally retraining).
    throw new Error(`Unknown ${colName} value: "${key}"`);
  }
  return map[key];
}

/***********************
 * Severity rules
 ************************/
function severityStockout(p) {
  if (p >= 0.85) return "critical";
  if (p >= 0.70) return "high";
  if (p >= 0.55) return "medium";
  return null; // below threshold => don't alert
}

function severityWaste(v) {
  if (v >= 5) return "critical";
  if (v >= 2) return "high";
  if (v >= 1) return "medium";
  return null;
}

/***********************
 * UI helpers
 ************************/
const el = (id) => document.getElementById(id);

function setHidden(id, hidden) {
  const node = el(id);
  if (!node) return;
  node.classList.toggle("hidden", hidden);
}

function setStatus(text) {
  const node = el("alerts-scan-status");
  if (node) node.textContent = text;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/***********************
 * HF calls
 ************************/
async function callHF(url, features) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ features }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HF error ${res.status}: ${text}`);
  }
  return res.json();
}

/***********************
 * Supabase client
 ************************/
let supabaseClient = null;

function initSupabase() {
  if (!window.supabase) {
    throw new Error("Supabase JS not loaded. Did you include the supabase script tag in HTML?");
  }
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/***********************
 * Feature builder (EXACT order)
 ************************/
function buildFeatureArray(row) {
  // You said inventory already has day + year. Use them.
  // If not present, you could derive from updated_at. (Not needed if columns exist.)
  const features = [
    Number(row.restaurant_id),                              // restaurant_id (num)
    encode(cityMap, row.city, "city"),                      // city (encoded)
    encode(conceptMap, row.concept, "concept"),             // concept (encoded)
    Number(row.ingredient_id),                              // ingredient_id (int)
    encode(ingredientNameMap, row.ingredient_name, "ingredient_name"), // ingredient_name (encoded)
    Number(row.starting_on_hand),                           // starting_on_hand (float)
    Number(row.received_qty),                               // received_qty (int)
    Number(row.used_qty),                                   // used_qty (float)
    Number(row.waste_qty),                                  // waste_qty (float)
    Number(row.ending_on_hand),                             // ending_on_hand (float)
    Number(row.order_placed_qty),                           // order_placed_qty (int)
    Number(row.reorder_placed),                             // reorder_placed (1 or 0)
    Number(row.covers),                                     // covers (int)
    Number(row.dow),                                        // dow (0-6)
    Number(row.is_weekend),                                 // is_weekend (1 or 0)
    Number(row.month),                                      // month (1-12)
    encode(weatherMap, row.weather, "weather"),              // weather (encoded)
    Number(row.days_of_supply_est),                         // days_of_supply_est (float)
    Number(row.day),                                        // day (int)
    Number(row.year),                                       // year (int)
  ];

  if (features.length !== 20) throw new Error("Feature array is not length 20 (bug).");
  if (features.some((x) => Number.isNaN(x))) {
    throw new Error(`NaN found in features for ingredient_id=${row.ingredient_id}`);
  }

  return features;
}

/***********************
 * Render alert cards
 ************************/
function renderAlerts(alerts) {
  const container = el("alerts-list");
  if (!container) return;

  if (alerts.length === 0) {
    container.innerHTML = `
      <div class="p-4 rounded-xl border border-white/10 bg-white/5 text-white/60 text-sm">
        No active risks detected above threshold.
      </div>
    `;
    return;
  }

  container.innerHTML = alerts.map((a) => {
    const sev = a.severity;
    const sevBadge =
      sev === "critical" ? "bg-red-500/20 text-red-200 border-red-500/30" :
      sev === "high"     ? "bg-orange-500/20 text-orange-200 border-orange-500/30" :
                           "bg-yellow-500/20 text-yellow-200 border-yellow-500/30";

    const typeBadge =
      a.alert_type === "stockout"
        ? "bg-amber-500/20 text-amber-200 border-amber-500/30"
        : "bg-emerald-500/20 text-emerald-200 border-emerald-500/30";

    const rightValue =
      a.alert_type === "stockout"
        ? `p=${Number(a.value).toFixed(2)}`
        : `~${Number(a.value).toFixed(1)} units`;

    const eta = (a.alert_type === "stockout" && a.eta_hours != null)
      ? `<div class="text-[11px] text-white/40 mt-1">ETA: ~${a.eta_hours}h</div>`
      : "";

    return `
      <div class="p-4 rounded-2xl border border-white/10 bg-white/5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-white font-semibold">${escapeHtml(a.ingredient_name)}</div>
            <div class="text-[12px] text-white/40 mt-1">${escapeHtml(a.message)}</div>
            ${eta}
          </div>
          <div class="flex flex-col items-end gap-2">
            <span class="px-2 py-1 text-[10px] rounded-full border ${sevBadge}">${sev.toUpperCase()}</span>
            <span class="px-2 py-1 text-[10px] rounded-full border ${typeBadge}">${a.alert_type.toUpperCase()}</span>
            <div class="text-[11px] text-white/60 mono">${rightValue}</div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

/***********************
 * Pipeline summary
 ************************/
function updateSummary({ predictions, riskEvents, afterRules, alertsSent }) {
  if (el("sum-predictions")) el("sum-predictions").textContent = String(predictions);
  if (el("sum-risk-events")) el("sum-risk-events").textContent = String(riskEvents);
  if (el("sum-after-rules")) el("sum-after-rules").textContent = String(afterRules);
  if (el("sum-alerts-sent")) el("sum-alerts-sent").textContent = String(alertsSent);
}

/***********************
 * Main run
 ************************/
async function runInventoryCheck() {
  setStatus("Scanning inventory...");
  setHidden("alerts-initial", true);
  setHidden("alerts-results", false);

  const { data: inventoryRows, error } = await supabaseClient
    .from("inventory")
    .select(`
      restaurant_id, city, concept, ingredient_id, ingredient_name,
      starting_on_hand, received_qty, used_qty, waste_qty, ending_on_hand,
      order_placed_qty, reorder_placed, covers, dow, is_weekend, month,
      weather, days_of_supply_est, day, year
    `);

  if (error) throw new Error(error.message);
  const rows = inventoryRows || [];

  // pipeline metrics
  let predictions = 0;
  let riskEvents = 0;
  let afterRules = 0;

  const alerts = [];

  // NOTE: This runs sequentially (safe & simple).
  // If you have lots of rows, we can batch/parallelize later.
  for (const row of rows) {
    const features = buildFeatureArray(row);

    // Make predictions
    const stockoutRes = await callHF(HF_STOCKOUT, features);
    const wastageRes  = await callHF(HF_WASTAGE, features);
    predictions += 2;

    const p = Number(stockoutRes.prediction); // expecting 0..1
    const w = Number(wastageRes.prediction);  // waste qty next 72h

    // risk events = any non-trivial model signal (optional metric)
    if (p >= 0.40) riskEvents++;
    if (w >= 0.50) riskEvents++;

    // Apply rules -> alerts
    const sevS = severityStockout(p);
    if (sevS) {
      afterRules++;
      const etaHours = Number.isFinite(Number(row.days_of_supply_est))
        ? Math.min(72, Math.max(0, Math.round(Number(row.days_of_supply_est) * 24)))
        : null;

      alerts.push({
        restaurant_id: row.restaurant_id,
        ingredient_id: row.ingredient_id,
        ingredient_name: row.ingredient_name,
        alert_type: "stockout",
        severity: sevS,
        value: p,
        eta_hours: etaHours,
        message: `Stockout risk in next 72h for ${row.ingredient_name} (p=${p.toFixed(2)}). Order soon.`
      });
    }

    const sevW = severityWaste(w);
    if (sevW) {
      afterRules++;
      alerts.push({
        restaurant_id: row.restaurant_id,
        ingredient_id: row.ingredient_id,
        ingredient_name: row.ingredient_name,
        alert_type: "waste",
        severity: sevW,
        value: w,
        eta_hours: null,
        message: `High waste risk: ${row.ingredient_name} may waste ~${w.toFixed(1)} units in next 72h. Use-first today.`
      });
    }
  }

  // Sort alerts: severity then value
  const sevRank = { critical: 3, high: 2, medium: 1 };
  alerts.sort((a, b) => (sevRank[b.severity] - sevRank[a.severity]) || (b.value - a.value));

  // Update UI
  renderAlerts(alerts);
  updateSummary({
    predictions,
    riskEvents,
    afterRules,
    alertsSent: alerts.length
  });

  setStatus(`Scan complete • ${alerts.length} alert(s)`);
}

/***********************
 * Hook buttons
 ************************/
function wireAlertsUI() {
  const btnRun = el("btn-run-check");
  const btnAgain = el("btn-run-check-again");

  if (btnRun) {
    btnRun.addEventListener("click", async () => {
      try {
        setStatus("Starting scan...");
        await runInventoryCheck();
      } catch (err) {
        console.error(err);
        setStatus("Scan failed (check console)");
        alert(String(err));
        // return to initial
        setHidden("alerts-results", true);
        setHidden("alerts-initial", false);
      }
    });
  }

  if (btnAgain) {
    btnAgain.addEventListener("click", async () => {
      try {
        setStatus("Re-scanning...");
        await runInventoryCheck();
      } catch (err) {
        console.error(err);
        setStatus("Scan failed (check console)");
        alert(String(err));
      }
    });
  }
}

/***********************
 * Init
 ************************/
document.addEventListener("DOMContentLoaded", () => {
  try {
    initSupabase();
    wireAlertsUI();
    setStatus("Ready to scan");
  } catch (e) {
    console.error(e);
    setStatus("Setup error (check console)");
  }
});
