/***********************
 * CONFIG
 ************************/
const SUPABASE_URL = "https://nuvblwcrblpumutfcunq.supabase.co/";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51dmJsd2NyYmxwdW11dGZjdW5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MzU1ODQsImV4cCI6MjA4NjAxMTU4NH0.308VT0WolKi_tubo1TR9oqTwLsgyzGGFF0pF5YwRW4o";

const HF_BASE = "https://yashk0618-projecty-classifier-regressor.hf.space";
const HF_STOCKOUT = `${HF_BASE}/predict/stockout`;
const HF_WASTAGE = `${HF_BASE}/predict/wastage`;

const RUN_EVERY_MS = 1 * 60 * 1000;

// Gemini (USE PROXY — do NOT expose API keys in frontend)
const GEMINI_MODEL = "gemini-3-pro-preview";
const DEFAULT_GEMINI_PROXY = "/api/gemini_explain";

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

const nowIso = () => new Date().toISOString();

/***********************
 * Loader UI
 ************************/
function ensureLoader() {
  // If you used the recommended HTML snippet, these exist already
  if (!el("alerts-loading")) {
    // Create minimal loader and attach under alerts-results
    const host = el("alerts-results") || document.body;
    const wrap = document.createElement("div");
    wrap.id = "alerts-loading";
    wrap.className = "mt-3 flex items-center gap-2 text-white/50 text-xs";
    wrap.style.display = "none";
    wrap.innerHTML = `
      <div class="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/70 animate-spin"></div>
      <div id="alerts-loading-text" class="animate-pulse">Scanning…</div>
    `;
    host.prepend(wrap);
  }
}

function setLoading(on, text = "Scanning…") {
  ensureLoader();
  const box = el("alerts-loading");
  const label = el("alerts-loading-text");
  if (label) label.textContent = text;
  if (box) box.style.display = on ? "flex" : "none";
}

/***********************
 * Stack UI (single container)
 ************************/
function ensureStack() {
  // Hide old two-column containers if still present
  const oldStockout = el("alerts-stockout");
  const oldWaste = el("alerts-waste");
  if (oldStockout) oldStockout.closest(".grid")?.classList.add("hidden");
  if (oldWaste) oldWaste.closest(".grid")?.classList.add("hidden");

  let stack = el("alerts-stack");
  if (!stack) {
    const results = el("alerts-results");
    if (!results) return null;

    stack = document.createElement("div");
    stack.id = "alerts-stack";
    stack.className = "space-y-3 overflow-y-auto h-full pr-1";
    results.appendChild(stack);
  }
  return stack;
}

/***********************
 * Simple animation CSS (pop-in)
 ************************/
function ensureAnimCss() {
  if (el("alerts-anim-css")) return;
  const style = document.createElement("style");
  style.id = "alerts-anim-css";
  style.textContent = `
    @keyframes alertIn {
      0% { transform: translateY(10px); opacity: 0; }
      100% { transform: translateY(0); opacity: 1; }
    }
    .alert-enter { animation: alertIn 280ms ease-out; }
  `;
  document.head.appendChild(style);
}

/***********************
 * ✅ MODAL (NEW): click alert card to open details modal
 ************************/
function ensureModal() {
  if (el("alert-modal")) return;

  const modal = document.createElement("div");
  modal.id = "alert-modal";
  modal.className =
    "fixed inset-0 z-[9999] hidden items-center justify-center p-4";
  modal.innerHTML = `
    <div id="alert-modal-backdrop" class="absolute inset-0 bg-black/60"></div>

    <div class="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b0f1a] text-white shadow-2xl">
      <div class="p-4 border-b border-white/10 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div id="alert-modal-title" class="text-lg font-semibold truncate">Alert Details</div>
          <div id="alert-modal-subtitle" class="text-xs text-white/50 mt-1 truncate"></div>
        </div>
        <button id="alert-modal-close"
          class="shrink-0 px-2 py-1 rounded-lg border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10"
          aria-label="Close">
          ✕
        </button>
      </div>

      <div class="p-4 space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-xl border border-white/10 bg-white/5 p-3">
            <div class="text-[10px] uppercase tracking-[0.18em] text-white/40">Type</div>
            <div id="m-type" class="mt-1 text-sm font-medium">—</div>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/5 p-3">
            <div class="text-[10px] uppercase tracking-[0.18em] text-white/40">Severity</div>
            <div id="m-sev" class="mt-1 text-sm font-medium">—</div>
          </div>

          <div class="rounded-xl border border-white/10 bg-white/5 p-3">
            <div class="text-[10px] uppercase tracking-[0.18em] text-white/40">Stockout (p)</div>
            <div id="m-stockout" class="mt-1 text-sm font-medium">—</div>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/5 p-3">
            <div class="text-[10px] uppercase tracking-[0.18em] text-white/40">Waste</div>
            <div id="m-waste" class="mt-1 text-sm font-medium">—</div>
          </div>

          <div class="rounded-xl border border-white/10 bg-white/5 p-3">
            <div class="text-[10px] uppercase tracking-[0.18em] text-white/40">ETA Stockout (hrs)</div>
            <div id="m-eta" class="mt-1 text-sm font-medium">—</div>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/5 p-3">
            <div class="text-[10px] uppercase tracking-[0.18em] text-white/40">Restaurant</div>
            <div id="m-rest" class="mt-1 text-sm font-medium">—</div>
          </div>
        </div>

        <div class="rounded-xl border border-white/10 bg-white/5 p-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-white/40">Message</div>
          <div id="m-msg" class="mt-2 text-sm text-white/80 leading-relaxed"></div>
        </div>

      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  };

  el("alert-modal-close")?.addEventListener("click", close);
  el("alert-modal-backdrop")?.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) close();
  });
}

function openModalFromAlertData(a) {
  ensureModal();

  const modal = el("alert-modal");
  if (!modal) return;

  // title/subtitle
  const title = `${a.ingredient_name || "Ingredient"} — ${String(a.alert_type || "").toUpperCase()}`;
  const subtitle = a.created_at
    ? `Created: ${new Date(a.created_at).toLocaleString()}`
    : `Restaurant ${a.restaurant_id ?? "—"} • Ingredient ${a.ingredient_id ?? "—"}`;

  el("alert-modal-title").textContent = title;
  el("alert-modal-subtitle").textContent = subtitle;

  el("m-type").textContent = String(a.alert_type || "—");
  el("m-sev").textContent = String(a.severity_text || "—");
  el("m-stockout").textContent =
    a.stockout != null ? Number(a.stockout).toFixed(2) : "—";
  el("m-waste").textContent =
    a.waste != null ? Number(a.waste).toFixed(2) : "—";
  el("m-eta").textContent =
    a.eta_hours_stockout != null ? Math.round(Number(a.eta_hours_stockout)) : "—";
  el("m-rest").textContent = a.restaurant_id != null ? String(a.restaurant_id) : "—";

  el("m-msg").textContent = String(a.message_text || "");

  // show modal
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

/***********************
 * HF call
 ************************/
async function callHF(url, features) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ features }),
  });
  if (!res.ok) throw new Error(`HF ${res.status}: ${await res.text()}`);
  return res.json();
}

/***********************
 * Supabase
 ************************/
let supabaseClient = null;

function initSupabase() {
  if (!window.supabase) throw new Error("Supabase JS not loaded");
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
    0, // 5 dummy ingredient_name_encoded
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

function etaHoursFromRow(row) {
  const days = toNum(row.days_of_supply_est, 0);
  return clamp(days * 24, 0, 24 * 365);
}

/***********************
 * Gemini explanation (3–4 sentences)
 * Uses backend proxy: window.GEMINI_PROXY_URL or DEFAULT_GEMINI_PROXY
 ************************/
async function getGeminiExplanation(payload) {
  const proxyUrl = window.GEMINI_PROXY_URL || DEFAULT_GEMINI_PROXY;

  if (!proxyUrl) {
    return "Risk is elevated for this item. Consider checking usage trends and current on-hand levels. If needed, place an order soon to avoid disruption.";
  }

  const res = await fetch(proxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      ...payload,
    }),
  });

  if (!res.ok) {
    console.warn("[alerts.js] Gemini proxy error:", await res.text());
    return "Risk is elevated for this item. Review on-hand vs demand. Consider ordering soon to reduce disruption.";
  }

  const data = await res.json();
  return (
    String(data?.text || "").trim() ||
    "Risk is elevated for this item. Review on-hand vs demand. Consider ordering soon to reduce disruption."
  );
}

/***********************
 * Candidate scoring + dedupe
 ************************/
function scoreCandidate(a) {
  if (a.alert_type === "stockout") {
    return clamp((a.stockout - 0.85) / 0.15, 0, 10);
  }
  return clamp(a.waste / 5, 0, 10);
}

/**
 * Dedupe rule:
 * If ingredient is already in alerts table, do NOT show/save again.
 * Key: restaurant_id|ingredient_id
 */
async function fetchExistingIngredientKeySet(candidates) {
  if (!candidates.length) return new Set();

  const restaurantIds = [...new Set(candidates.map((c) => c.restaurant_id))];
  const ingredientIds = [...new Set(candidates.map((c) => c.ingredient_id))];

  const { data, error } = await supabaseClient
    .from("alerts")
    .select("restaurant_id, ingredient_id")
    .in("restaurant_id", restaurantIds)
    .in("ingredient_id", ingredientIds);

  if (error) throw error;

  const set = new Set();
  for (const r of data || []) {
    set.add(`${toNum(r.restaurant_id)}|${toNum(r.ingredient_id)}`);
  }
  return set;
}

async function pickBestNewCritical(candidates) {
  const critical = candidates.filter((c) => c.severity_text === "critical");
  if (!critical.length) return null;

  const existingSet = await fetchExistingIngredientKeySet(critical);

  const filtered = critical.filter((c) => {
    const key = `${c.restaurant_id}|${c.ingredient_id}`;
    return !existingSet.has(key);
  });

  if (!filtered.length) return null;

  filtered.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
  return filtered[0];
}

/***********************
 * DB write + history render
 ************************/
async function insertAlertRow(row) {
  const payload = {
    created_at: nowIso(),
    updated_at: nowIso(),
    status: "open",

    restaurant_id: row.restaurant_id,
    ingredient_id: row.ingredient_id,
    ingredient_name: row.ingredient_name,

    alert_type: row.alert_type,
    severity_text: row.severity_text,
    message_text: row.message_text,

    stockout: row.stockout,
    waste: row.waste,
    eta_hours_stockout: row.eta_hours_stockout,
  };

  const { error } = await supabaseClient.from("alerts").insert([payload]);
  if (error) throw error;
}

/**
 * ✅ UPDATED: include more fields so modal has stats
 * Also include `id` so we can identify which card was clicked.
 */
async function refreshHistory(limit = 50) {
  const { data, error } = await supabaseClient
    .from("alerts")
    .select(
      `
      id,
      created_at,
      restaurant_id,
      ingredient_id,
      ingredient_name,
      alert_type,
      severity_text,
      message_text,
      stockout,
      waste,
      eta_hours_stockout
    `
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  // Join in a lightweight inventory snapshot for modal display (optional but useful)
  // NOTE: if your inventory table is big, this is still small because we only request up to `limit` ingredients.
  const rows = data || [];

  // Build lookup keys then fetch matching inventory rows in one request
  const ingredientIds = [...new Set(rows.map((r) => toNum(r.ingredient_id)).filter(Boolean))];
  const restaurantIds = [...new Set(rows.map((r) => toNum(r.restaurant_id)).filter(Boolean))];

  let invMap = new Map();
  if (ingredientIds.length && restaurantIds.length) {
    const invRes = await supabaseClient
      .from("inventory")
      .select(
        "restaurant_id, ingredient_id, city, concept, weather, covers, ending_on_hand, used_qty, waste_qty, days_of_supply_est, day, month, year"
      )
      .in("restaurant_id", restaurantIds)
      .in("ingredient_id", ingredientIds);

    if (!invRes.error) {
      for (const r of invRes.data || []) {
        invMap.set(`${toNum(r.restaurant_id)}|${toNum(r.ingredient_id)}`, r);
      }
    }
  }

  // merge snapshot fields into each alert row (for modal)
  const merged = rows.map((r) => {
    const snap = invMap.get(`${toNum(r.restaurant_id)}|${toNum(r.ingredient_id)}`) || {};
    return { ...r, ...snap };
  });

  renderHistoryCards(merged);
}

/**
 * ✅ UPDATED: card is clickable and carries modal data in dataset
 */
function renderHistoryCards(rows) {
  const stack = ensureStack();
  if (!stack) return;

  stack.innerHTML = "";

  if (!rows.length) {
    stack.innerHTML = `<div class="text-white/40 text-sm">No alerts yet.</div>`;
    return;
  }

  for (const r of rows) {
    const sev =
      r.severity_text === "critical"
        ? "bg-red-500/20 text-red-200"
        : r.severity_text === "high"
        ? "bg-orange-500/20 text-orange-200"
        : "bg-yellow-500/20 text-orange-200";

    const typeBadge =
      String(r.alert_type || "").toLowerCase() === "stockout"
        ? "bg-indigo-500/15 text-indigo-200"
        : "bg-emerald-500/15 text-emerald-200";

    const when = r.created_at ? new Date(r.created_at).toLocaleString() : "";

    const card = document.createElement("button");
    card.type = "button";
    card.className =
      "alert-enter w-full text-left p-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/7.5 focus:outline-none focus:ring-2 focus:ring-white/10";
    card.setAttribute("data-alert-card", "1");

    // store full data for modal in dataset (stringify)
    card.dataset.alertJson = JSON.stringify(r);

    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <div class="text-white font-medium truncate">${escapeHtml(r.ingredient_name)}</div>
            <span class="px-2 py-0.5 text-[10px] rounded-full ${typeBadge}">
              ${escapeHtml(String(r.alert_type || "").toUpperCase())}
            </span>
            <span class="px-2 py-0.5 text-[10px] rounded-full ${sev}">
              ${escapeHtml(String(r.severity_text || "").toUpperCase())}
            </span>
          </div>

          <div class="text-[11px] text-white/45 mt-1 line-clamp-3">
            ${escapeHtml(r.message_text || "")}
          </div>

          <div class="text-[10px] text-white/25 mt-2 mono uppercase tracking-[0.18em]">
            ${escapeHtml(when)} • restaurant ${escapeHtml(r.restaurant_id)}
          </div>
        </div>
      </div>
    `;
    stack.appendChild(card);
  }

  bindModalClicks();
}

/***********************
 * ✅ Bind click -> modal (NEW)
 ************************/
let _modalClicksBound = false;

function bindModalClicks() {
  if (_modalClicksBound) return;
  _modalClicksBound = true;

  document.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("[data-alert-card]");
    if (!btn) return;

    try {
      const data = JSON.parse(btn.dataset.alertJson || "{}");
      openModalFromAlertData(data);
    } catch (err) {
      console.warn("[alerts.js] modal parse error", err);
    }
  });
}

/***********************
 * MAIN LOOP
 ************************/
let _isRunning = false;

window.runInventoryCheck = async function () {
  if (_isRunning) return;
  _isRunning = true;

  try {
    ensureAnimCss();
    ensureLoader();
    ensureStack();
    ensureModal();

    setHidden("alerts-initial", true);
    setHidden("alerts-results", false);

    setStatus("Fetching inventory…");
    setLoading(true, "Scanning inventory…");

    if (!supabaseClient) initSupabase();

    const { data, error } = await supabaseClient.from("inventory").select("*");
    if (error) throw error;

    const candidates = [];

    // Score everything
    for (const row of data) {
      const features = buildFeatureArray(row);

      const pRaw = await callHF(HF_STOCKOUT, features);
      const wRaw = await callHF(HF_WASTAGE, features);

      // Stockout model returns probabilities array: [p_no_stockout, p_stockout]
      // Use probabilities[1] for stockout probability
      const probs = pRaw?.probabilities;
      const p = Array.isArray(probs) && probs.length >= 2 ? toNum(probs[1], 0) : toNum(pRaw?.prediction, 0);
      const w = toNum(wRaw?.prediction, 0);

      const etaHours = etaHoursFromRow(row);

      const s = severityStockout(p);
      if (s === "critical") {
        candidates.push({
          restaurant_id: toNum(row.restaurant_id),
          ingredient_id: toNum(row.ingredient_id),
          ingredient_name: String(row.ingredient_name ?? ""),
          alert_type: "stockout",
          severity_text: "critical",
          stockout: p,
          waste: w,
          eta_hours_stockout: etaHours,
          message_text: `Stockout risk p=${p.toFixed(2)}. ETA ~${Math.round(
            etaHours
          )}h.`,
          _context: row,
        });
      }

      const sw = severityWaste(w);
      if (sw === "critical") {
        candidates.push({
          restaurant_id: toNum(row.restaurant_id),
          ingredient_id: toNum(row.ingredient_id),
          ingredient_name: String(row.ingredient_name ?? ""),
          alert_type: "waste",
          severity_text: "critical",
          stockout: p,
          waste: w,
          eta_hours_stockout: etaHours,
          message_text: `Waste risk ~${w.toFixed(1)} units.`,
          _context: row,
        });
      }
    }

    setLoading(true, "Checking duplicates…");
    const topNew = await pickBestNewCritical(candidates);

    if (!topNew) {
      setLoading(true, "Refreshing history…");
      await refreshHistory(50);
      setStatus("Scan complete • no NEW critical alerts");
      return;
    }

    // Gemini explanation (3–4 sentences)
    setLoading(true, "Writing explanation…");
    const ctx = topNew._context || {};
    const explanation = await getGeminiExplanation({
      ingredient_name: topNew.ingredient_name,
      alert_type: topNew.alert_type,
      restaurant_id: topNew.restaurant_id,
      city: ctx.city,
      concept: ctx.concept,
      stockout: topNew.stockout,
      waste: topNew.waste,
      eta_hours_stockout: topNew.eta_hours_stockout,
    });

    topNew.message_text =
      `${topNew.alert_type === "stockout"
        ? `Stockout risk p=${topNew.stockout.toFixed(2)}`
        : `Waste risk ~${topNew.waste.toFixed(1)} units`
      }. ${explanation}`.trim();

    // Save alert
    setLoading(true, "Saving alert…");
    await insertAlertRow(topNew);

    // Refresh history so new appears on top
    setLoading(true, "Updating history…");
    await refreshHistory(50);

    setStatus("New critical alert saved • updated history");
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err?.message || String(err)}`);
  } finally {
    setLoading(false);
    _isRunning = false;
  }
};

/***********************
 * Refresh alerts only (no scan)
 ************************/
window.refreshAlertsOnly = async function () {
  try {
    if (!supabaseClient) initSupabase();
    setLoading(true, "Refreshing alerts…");
    await refreshHistory(50);
    setStatus("Alerts refreshed");
  } catch (err) {
    console.error(err);
    setStatus(`Refresh error: ${err?.message || String(err)}`);
  } finally {
    setLoading(false);
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

  ensureAnimCss();
  ensureLoader();
  ensureStack();
  ensureModal();

  el("btn-run-check")?.addEventListener("click", runInventoryCheck);
  el("btn-refresh-alerts")?.addEventListener("click", window.refreshAlertsOnly);

  // run once immediately
  runInventoryCheck();

  // then every 5 minutes
  setInterval(() => runInventoryCheck(), RUN_EVERY_MS);

  setStatus("Live alerts enabled (every 5 minutes)");
});
