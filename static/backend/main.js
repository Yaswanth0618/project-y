/**
 * SpellStock AI — Flask frontend. Login, dashboard, scenario simulation via /api/simulate.
 */
(function () {
  "use strict";
  var DOM = {
    reportsLocationSelect: document.getElementById("reports-location-select"),
    loginView: document.getElementById("login-view"),
    dashboardView: document.getElementById("dashboard-view"),
    btnLogin: document.getElementById("btn-login"),
    btnLogout: document.getElementById("btn-logout"),
    btnIgnite: document.getElementById("btn-ignite"),
    igniteIcon: document.getElementById("ignite-icon"),
    scenarioInput: document.getElementById("scenario-input"),
    paramsPanel: document.getElementById("params-panel"),
    inventoryCount: document.getElementById("inventory-count"),
    sidebarNav: document.getElementById("sidebar-nav"),
    quickActions: document.getElementById("quick-actions"),
    dashboardStats: document.getElementById("dashboard-stats"),
    oraclePanel: document.getElementById("oracle-panel"),
    inventoryHubPanel: document.getElementById("inventory-hub-panel"),
    reportsPanel: document.getElementById("reports-panel"),
    forecastsPanel: document.getElementById("forecasts-panel"),
    hubRestaurantSelect: document.getElementById("hub-restaurant-select"),
    // Dashboard charts
    dashChartStockIngredient: document.getElementById("dash-chart-stock-ingredient"),
    dashChartLocationCompare: document.getElementById("dash-chart-location-compare"),
    // Hub stats
    hubStatIngredients: document.getElementById("hub-stat-ingredients"),
    hubStatStock: document.getElementById("hub-stat-stock"),
    hubStatUsed: document.getElementById("hub-stat-used"),
    hubStatWaste: document.getElementById("hub-stat-waste"),
    hubStatWasteRate: document.getElementById("hub-stat-wasterate"),
    // Alerts panel
    alertsPanel: document.getElementById("alerts-panel"),
    alertsInitial: document.getElementById("alerts-initial"),
    alertsResults: document.getElementById("alerts-results"),
    alertsScanStatus: document.getElementById("alerts-scan-status"),
    btnRunCheck: document.getElementById("btn-run-check"),
    btnRunCheckAgain: document.getElementById("btn-run-check-again"),
    checkIcon: document.getElementById("check-icon"),
    checkIconAgain: document.getElementById("check-icon-again"),
    alertsList: document.getElementById("alerts-list"),
    pipelineSummary: document.getElementById("pipeline-summary"),
    sumPredictions: document.getElementById("sum-predictions"),
    sumRiskEvents: document.getElementById("sum-risk-events"),
    sumAfterRules: document.getElementById("sum-after-rules"),
    sumAlertsSent: document.getElementById("sum-alerts-sent"),
    // Chat panel
    chatPanel: document.getElementById("chat-panel"),
    chatMessages: document.getElementById("chat-messages"),
    chatInput: document.getElementById("chat-input"),
    btnChatSend: document.getElementById("btn-chat-send"),
    chatQuickQuestions: document.getElementById("chat-quick-questions"),
    // Home dynamic sections
    outlookAlerts: document.getElementById("outlook-alerts"),
    // Agent panel
    agentPanel: document.getElementById("agent-panel"),
    agentQueueBody: document.getElementById("agent-queue-body"),
    agentFilterStatus: document.getElementById("agent-filter-status"),
    agentFilterOwner: document.getElementById("agent-filter-owner"),
    btnAgentAuto: document.getElementById("btn-agent-auto"),
    agentDiffView: document.getElementById("agent-diff-view"),
    agentDiffContent: document.getElementById("agent-diff-content"),
    btnCloseDiff: document.getElementById("btn-close-diff"),
    agentAuditLog: document.getElementById("agent-audit-log"),
    agentStatTotal: document.getElementById("agent-stat-total"),
    agentStatProposed: document.getElementById("agent-stat-proposed"),
    agentStatExecuted: document.getElementById("agent-stat-executed"),
    agentStatAlerts: document.getElementById("agent-stat-alerts"),
    // Copilot elements
    copilotMessages: document.getElementById("copilot-messages"),
    copilotInput: document.getElementById("copilot-input"),
    btnCopilotSend: document.getElementById("btn-copilot-send"),
    btnCopilotReset: document.getElementById("btn-copilot-reset"),
    copilotSessionId: document.getElementById("copilot-session-id"),
    copilotStatTools: document.getElementById("copilot-stat-tools"),
    copilotStatActions: document.getElementById("copilot-stat-actions"),
    copilotStatTurns: document.getElementById("copilot-stat-turns"),
    copilotStatAlerts: document.getElementById("copilot-stat-alerts"),
  };

  var state = {
    isLoggedIn: false,
    isAnalyzing: false,
    params: null,
    inventory: [],
    currentView: "oracle",
    restaurantData: null,
    hubCharts: {
      comparisonBar: null,
      riskPie: null,
      stockBar: null,
      locationsBar: null,
      usageTrends: null,
      wasteAnalysis: null,
      dailyTimeline: null,
    },
    dashCharts: {
      stockIngredient: null,
      locationCompare: null,
    },
    hubStats: null,
    forecastData: null,
    reportsData: null,
    alertsData: null,
  };

  var SIDEBAR_ITEMS = [
    {
      view: "oracle",
      label: "Dashboard",
      icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>',
    },
    {
      view: "alerts",
      label: "AI Alerts",
      icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>',
    },
    {
      view: "inventory-hub",
      label: "Inventory Hub",
      icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>',
    },
    {
      view: "reports",
      label: "Reports",
      icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
    },
    {
      view: "forecasts",
      label: "Forecasts",
      icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>',
    },
    {
      view: "agent",
      label: "Agent Copilot",
      icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>',
    },
  ];

  var QUICK_ACTIONS = [
    {
      label: "Weekend Rush",
      prompt: "Large party bookings expected this weekend — prepare for 2x covers.",
    },
    {
      label: "Supply Delay",
      prompt: "Main seafood supplier delayed 48 hours, need alternative sourcing.",
    },
    {
      label: "Viral Buzz",
      prompt: "We went viral on social media — expecting a sudden surge in walk-ins today.",
    },
    {
      label: "Quiet Midweek",
      prompt: "Slow Tuesday expected, scale down prep to avoid waste.",
    },
  ];

  function escapeHtml(s) {
    if (!s) return "";
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function setView(viewName) {
    state.currentView = viewName || "oracle";
    if (DOM.oraclePanel)
      DOM.oraclePanel.classList.toggle(
        "hidden",
        state.currentView !== "oracle",
      );
    if (DOM.inventoryHubPanel)
      DOM.inventoryHubPanel.classList.toggle(
        "hidden",
        state.currentView !== "inventory-hub",
      );
    if (DOM.reportsPanel) {
      DOM.reportsPanel.classList.toggle(
        "hidden",
        state.currentView !== "reports",
      );
      DOM.reportsPanel.classList.toggle(
        "panel-visible",
        state.currentView === "reports",
      );
    }
    if (DOM.forecastsPanel) {
      DOM.forecastsPanel.classList.toggle(
        "hidden",
        state.currentView !== "forecasts",
      );
      DOM.forecastsPanel.classList.toggle(
        "panel-visible",
        state.currentView === "forecasts",
      );
    }
    if (DOM.alertsPanel)
      DOM.alertsPanel.classList.toggle(
        "hidden",
        state.currentView !== "alerts",
      );
    if (DOM.chatPanel)
      DOM.chatPanel.classList.toggle(
        "hidden",
        state.currentView !== "chat",
      );
    if (DOM.agentPanel)
      DOM.agentPanel.classList.toggle(
        "hidden",
        state.currentView !== "agent",
      );
    if (state.currentView === "reports") {
      var location = DOM.reportsLocationSelect ? DOM.reportsLocationSelect.value : 'all';
      fetchReports(location);
    }
    if (state.currentView === "inventory-hub") {
      fetchRestaurantData().then(function () {
        renderInventoryHub();
      });
      fetchHubStats();
    }
    renderSidebar();
  }


  function renderSidebar() {
    if (!DOM.sidebarNav) return;
    DOM.sidebarNav.innerHTML = SIDEBAR_ITEMS.map(function (item) {
      var active = state.currentView === item.view;
      return (
        '<div class="sidebar-item flex items-center gap-4 px-4 py-2.5 cursor-pointer transition-all duration-300 rounded-xl group ' +
        (active
          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
          : "text-white/40 hover:text-white hover:bg-white/5") +
        '" data-view="' +
        escapeHtml(item.view) +
        '">' +
        '<div class="transition-transform duration-300 ' +
        (active ? "scale-110" : "group-hover:scale-110") +
        '">' +
        item.icon +
        "</div>" +
        '<span class="text-xs font-bold uppercase tracking-widest">' +
        item.label +
        "</span></div>"
      );
    }).join("");
    DOM.sidebarNav.querySelectorAll(".sidebar-item").forEach(function (el) {
      el.addEventListener("click", function () {
        var view = el.getAttribute("data-view");
        if (view) setView(view);
      });
    });
  }

  function renderQuickActions() {
    if (!DOM.quickActions) return;
    DOM.quickActions.innerHTML = QUICK_ACTIONS.map(function (action) {
      return (
        '<button type="button" class="text-[9px] mono uppercase tracking-widest py-2 px-4 border border-white/10 rounded-full hover:bg-white hover:text-black hover:border-white transition-all quick-action-btn" data-prompt="' +
        escapeHtml(action.prompt) +
        '">' +
        action.label +
        "</button>"
      );
    }).join("");
    DOM.quickActions
      .querySelectorAll(".quick-action-btn")
      .forEach(function (btn) {
        btn.addEventListener("click", function () {
          var prompt = btn.getAttribute("data-prompt");
          if (DOM.scenarioInput) DOM.scenarioInput.value = prompt;
          handleRunSimulation(prompt);
        });
      });
  }

  function getRiskBadgeHTML(status) {
    var styles = {
      LOW: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
      MODERATE: "text-amber-500 bg-amber-500/10 border-amber-500/20",
      HIGH: "text-orange-500 bg-orange-500/10 border-orange-500/20",
      CRITICAL:
        "text-red-500 bg-red-500/10 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]",
    };
    return (
      '<span class="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border transition-all duration-300 mono ' +
      (styles[status] || "") +
      '">' +
      (status || "") +
      "</span>"
    );
  }

  function renderParams() {
    if (!DOM.paramsPanel || !state.params) return;
    var pct = Math.min(100, (state.params.demand_multiplier / 2.5) * 100);
    DOM.paramsPanel.innerHTML =
      '<div class="space-y-6">' +
      '<div class="space-y-1"><span class="text-[9px] mono text-white/30 uppercase tracking-widest">Simulation Label</span>' +
      '<p class="text-2xl font-bold tracking-tight text-glow-blue leading-tight italic">"' +
      escapeHtml(state.params.notes) +
      '"</p></div>' +
      '<div class="grid grid-cols-2 gap-6">' +
      '<div class="space-y-1"><span class="text-[9px] mono text-white/30 uppercase tracking-widest">Demand Mult.</span>' +
      '<p class="text-4xl font-black tracking-tighter">' +
      state.params.demand_multiplier +
      "x</p></div>" +
      '<div class="space-y-1"><span class="text-[9px] mono text-white/30 uppercase tracking-widest">Horizon</span>' +
      '<p class="text-4xl font-black tracking-tighter">' +
      state.params.horizon_hours +
      "H</p></div></div></div>" +
      '<div class="pt-6 border-t border-white/5">' +
      '<div class="flex justify-between items-center mb-2"><span class="text-[9px] mono text-white/40 uppercase">Stress Calculation</span>' +
      '<span class="text-[10px] mono text-amber-400 font-bold">READY</span></div>' +
      '<div class="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">' +
      '<div class="h-full bg-amber-500 transition-all duration-1000" style="width: ' +
      pct +
      '%"></div></div></div>';
    if (DOM.dashboardStats) {
      DOM.dashboardStats.classList.remove("hidden");
      DOM.dashboardStats.innerHTML =
        '<div class="text-right"><div class="text-[9px] mono text-white/20 uppercase tracking-widest">Volatility Index</div>' +
        '<div class="text-lg font-bold text-amber-400 tracking-tighter">Normal</div></div>' +
        '<div class="text-right"><div class="text-[9px] mono text-white/20 uppercase tracking-widest">Risk Threshold</div>' +
        '<div class="text-lg font-bold text-red-500 tracking-tighter">78.4% Delta</div></div>';
    }
  }

  function setIgniteLoading(loading) {
    if (!DOM.btnIgnite || !DOM.igniteIcon) return;
    DOM.btnIgnite.disabled = loading;
    DOM.igniteIcon.innerHTML = loading
      ? '<svg class="animate-spin h-6 w-6 text-black" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>'
      : '<svg class="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>';
    var label = DOM.btnIgnite.querySelector("span");
    if (label) label.textContent = loading ? "Propagating..." : "Ignite Logic";
  }

  function handleRunSimulation(scenario) {
    scenario = (scenario || "").trim();
    if (!scenario) return;
    state.isAnalyzing = true;
    state.inventory = [];
    setIgniteLoading(true);

    fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: scenario }),
    })
      .then(function (res) {
        return res.ok
          ? res.json()
          : Promise.reject(new Error(res.statusText || "Request failed"));
      })
      .then(function (data) {
        state.params = data.params || null;
        state.inventory = data.inventory || [];
        setTimeout(function () {
          state.isAnalyzing = false;
          setIgniteLoading(false);
          renderParams();
        }, 800);
      })
      .catch(function (err) {
        console.error("Simulation failed:", err);
        state.isAnalyzing = false;
        setIgniteLoading(false);
        state.params = {
          horizon_hours: 72,
          demand_multiplier: 1.0,
          notes: "Auto-calibrated baseline",
        };
        state.inventory = [];
        renderParams();
      });
  }

  function fetchRestaurantData() {
    console.log("[Inventory Hub] Fetching restaurant data...");

    if (state.restaurantData) {
      console.log("[Inventory Hub] Using cached data");
      return Promise.resolve();
    }

    return fetch("/api/inventory/restaurants")
      .then(function (res) {
        console.log("[Inventory Hub] API response status:", res.status);
        return res.ok
          ? res.json()
          : Promise.reject(new Error("Failed to load"));
      })
      .then(function (data) {
        console.log("[Inventory Hub] Received data:", data);
        state.restaurantData = data.restaurants || [];
        console.log("[Inventory Hub] Stored restaurants:", state.restaurantData.length);
        return state.restaurantData;
      })
      .catch(function (err) {
        console.error("Restaurant inventory fetch failed:", err);
        state.restaurantData = [];
        return state.restaurantData;
      });
  }

  function destroyChart(chart) {
    if (chart && typeof chart.destroy === "function") chart.destroy();
  }

  function renderInventoryHub() {
    console.log("[Inventory Hub] Starting render");
    console.log("[Inventory Hub] Current view:", state.currentView);
    console.log("[Inventory Hub] Restaurant data:", state.restaurantData);

    if (typeof Chart === "undefined") {
      console.error("[Inventory Hub] Chart.js is not loaded!");
      return;
    }
    console.log("[Inventory Hub] Chart.js is loaded");

    if (
      state.currentView !== "inventory-hub" ||
      !state.restaurantData ||
      state.restaurantData.length === 0
    )
      return;
    var restaurants = state.restaurantData;
    var selectedId = DOM.hubRestaurantSelect
      ? DOM.hubRestaurantSelect.value
      : restaurants[0] && restaurants[0].id;
    var current =
      restaurants.filter(function (r) {
        return r.id === selectedId;
      })[0] || restaurants[0];
    var inventory = current && current.inventory ? current.inventory : [];

    var chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "rgba(248,250,252,0.9)", font: { size: 11 } },
        },
      },
      scales: {},
    };

    var scaleOpts = {
      ticks: {
        color: "rgba(248,250,252,0.8)",
        font: { family: "'JetBrains Mono', monospace", size: 10 },
      },
      grid: { color: "rgba(255,255,255,0.06)" },
    };

    destroyChart(state.hubCharts.comparisonBar);
    var categories = [
      "Stock health",
      "Risk score",
      "Critical items",
      "Restock urgency",
    ];
    var maxTotal = 200;
    var comparisonData = restaurants.map(function (r) {
      var inv = r.inventory || [];
      var total = inv.reduce(function (s, i) {
        return s + (i.currentStock || 0);
      }, 0);
      var avgRisk = inv.length
        ? inv.reduce(function (s, i) {
          return s + (i.riskPercent || 0);
        }, 0) / inv.length
        : 0;
      var critical = inv.filter(function (i) {
        return i.status === "CRITICAL";
      }).length;
      var stockHealth = Math.min(10, Math.round((total / maxTotal) * 10));
      var riskScore = Math.min(10, Math.round(avgRisk / 10));
      var criticalScore = Math.max(0, 10 - critical);
      var restockUrgency = Math.min(10, Math.round(avgRisk / 10));
      return [stockHealth, riskScore, criticalScore, restockUrgency];
    });
    var compCtx = document.getElementById("chart-comparison-bar");
    if (compCtx) {
      state.hubCharts.comparisonBar = new Chart(compCtx, {
        type: "bar",
        data: {
          labels: categories,
          datasets: [
            {
              label: restaurants[0] ? restaurants[0].name : "Main",
              data: comparisonData[0] || [0, 0, 0, 0],
              backgroundColor: "rgba(99,102,241,0.7)",
              borderColor: "#6366f1",
              borderWidth: 1,
            },
            {
              label: restaurants[1] ? restaurants[1].name : "Downtown",
              data: comparisonData[1] || [0, 0, 0, 0],
              backgroundColor: "rgba(16,185,129,0.7)",
              borderColor: "#10b981",
              borderWidth: 1,
            },
            {
              label: restaurants[2] ? restaurants[2].name : "Harbor",
              data: comparisonData[2] || [0, 0, 0, 0],
              backgroundColor: "rgba(245,158,11,0.7)",
              borderColor: "#f59e0b",
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: {
                color: "rgba(248,250,252,0.9)",
                font: { family: "'JetBrains Mono', monospace", size: 11 },
              },
            },
          },
          scales: {
            x: scaleOpts,
            y: { min: 0, max: 10, ...scaleOpts },
          },
        },
      });
    }

    destroyChart(state.hubCharts.riskPie);
    var riskCounts = { LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0 };
    inventory.forEach(function (item) {
      if (riskCounts.hasOwnProperty(item.status)) riskCounts[item.status]++;
    });
    var riskCtx = document.getElementById("chart-risk-pie");
    if (riskCtx) {
      state.hubCharts.riskPie = new Chart(riskCtx, {
        type: "pie",
        data: {
          labels: ["Low", "Moderate", "High", "Critical"],
          datasets: [
            {
              data: [
                riskCounts.LOW,
                riskCounts.MODERATE,
                riskCounts.HIGH,
                riskCounts.CRITICAL,
              ],
              backgroundColor: [
                "rgba(16,185,129,0.8)",
                "rgba(245,158,11,0.8)",
                "rgba(249,115,22,0.8)",
                "rgba(239,68,68,0.8)",
              ],
              borderColor: ["#10b981", "#f59e0b", "#f97316", "#ef4444"],
              borderWidth: 1,
            },
          ],
        },
        options: Object.assign({}, chartOptions, {
          plugins: {
            legend: {
              labels: {
                color: "rgba(248,250,252,0.9)",
                font: { family: "'JetBrains Mono', monospace", size: 11 },
              },
            },
          },
        }),
      });
    }

    destroyChart(state.hubCharts.stockBar);
    var stockCtx = document.getElementById("chart-stock-bar");
    if (stockCtx) {
      state.hubCharts.stockBar = new Chart(stockCtx, {
        type: "bar",
        data: {
          labels: inventory.map(function (i) {
            return i.ingredient;
          }),
          datasets: [
            {
              label: "Stock",
              data: inventory.map(function (i) {
                return i.currentStock;
              }),
              backgroundColor: "rgba(99,102,241,0.6)",
              borderColor: "#6366f1",
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              ticks: {
                color: "rgba(248,250,252,0.8)",
                maxRotation: 45,
                font: { family: "'JetBrains Mono', monospace", size: 10 },
              },
              grid: { color: "rgba(255,255,255,0.06)" },
            },
            y: {
              ticks: {
                color: "rgba(248,250,252,0.8)",
                font: { family: "'JetBrains Mono', monospace", size: 10 },
              },
              grid: { color: "rgba(255,255,255,0.06)" },
            },
          },
        },
      });
    }

    destroyChart(state.hubCharts.locationsBar);
    var locationTotals = restaurants.map(function (r) {
      var total = (r.inventory || []).reduce(function (sum, i) {
        return sum + (i.currentStock || 0);
      }, 0);
      return { name: r.name, total: total };
    });
    var locCtx = document.getElementById("chart-locations-bar");
    if (locCtx) {
      state.hubCharts.locationsBar = new Chart(locCtx, {
        type: "bar",
        data: {
          labels: locationTotals.map(function (l) {
            return l.name;
          }),
          datasets: [
            {
              label: "Total Stock",
              data: locationTotals.map(function (l) {
                return l.total;
              }),
              backgroundColor: [
                "rgba(99,102,241,0.6)",
                "rgba(16,185,129,0.6)",
                "rgba(245,158,11,0.6)",
              ],
              borderColor: ["#6366f1", "#10b981", "#f59e0b"],
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              ticks: {
                color: "rgba(248,250,252,0.8)",
                font: { family: "'JetBrains Mono', monospace", size: 10 },
              },
              grid: { color: "rgba(255,255,255,0.06)" },
            },
            y: {
              ticks: {
                color: "rgba(248,250,252,0.8)",
                font: { family: "'JetBrains Mono', monospace", size: 10 },
              },
              grid: { color: "rgba(255,255,255,0.06)" },
            },
          },
        },
      });
    }
  }

  // ═══════════  INVENTORY HUB STATS & EXTRA CHARTS  ═══════════════════════

  function fetchHubStats() {
    return fetch("/api/inventory/stats")
      .then(function (res) {
        return res.ok ? res.json() : Promise.reject("Failed");
      })
      .then(function (data) {
        state.hubStats = data;
        renderHubSummary(data.summary || {});
        renderHubUsageTrends(data.usage_trends || []);
        renderHubWasteAnalysis(data.waste_analysis || []);
        renderHubDailyTimeline(data.daily_usage_timeline || []);
      })
      .catch(function (err) {
        console.error("Hub stats fetch failed:", err);
      });
  }

  function renderHubSummary(summary) {
    if (DOM.hubStatIngredients) DOM.hubStatIngredients.textContent = summary.total_ingredients || "-";
    if (DOM.hubStatStock) DOM.hubStatStock.textContent = summary.total_stock_on_hand || "-";
    if (DOM.hubStatUsed) DOM.hubStatUsed.textContent = summary.total_used_period || "-";
    if (DOM.hubStatWaste) DOM.hubStatWaste.textContent = summary.total_waste_period || "-";
    if (DOM.hubStatWasteRate) DOM.hubStatWasteRate.textContent = summary.waste_rate != null ? summary.waste_rate + "%" : "-";
  }

  function renderHubUsageTrends(trends) {
    if (typeof Chart === "undefined") return;
    var scaleOpts = {
      ticks: { color: "rgba(248,250,252,0.8)", font: { family: "'JetBrains Mono', monospace", size: 10 } },
      grid: { color: "rgba(255,255,255,0.06)" },
    };
    destroyChart(state.hubCharts.usageTrends);
    var ctx = document.getElementById("chart-usage-trends");
    if (!ctx || !trends.length) return;
    var items = trends.slice(0, 12);

    var colors = items.map(function (t) {
      if (t.trend === "up") return "rgba(239,68,68,0.7)";
      if (t.trend === "down") return "rgba(16,185,129,0.7)";
      return "rgba(99,102,241,0.5)";
    });
    var borderColors = items.map(function (t) {
      if (t.trend === "up") return "#ef4444";
      if (t.trend === "down") return "#10b981";
      return "#6366f1";
    });

    state.hubCharts.usageTrends = new Chart(ctx, {
      type: "bar",
      data: {
        labels: items.map(function (t) { return t.ingredient; }),
        datasets: [{
          label: "Usage Change %",
          data: items.map(function (t) { return t.change_pct; }),
          backgroundColor: colors,
          borderColor: borderColors,
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var t = items[ctx.dataIndex];
                return t.ingredient + ": " + t.change_pct + "% (Avg " + t.avg_last_7 + " vs " + t.avg_prior_7 + ")";
              }
            }
          },
        },
        scales: {
          x: Object.assign({}, scaleOpts, { title: { display: true, text: "Change %", color: "rgba(248,250,252,0.5)" } }),
          y: Object.assign({}, scaleOpts, { ticks: Object.assign({}, scaleOpts.ticks, { maxRotation: 0 }) }),
        },
      },
    });
  }

  function renderHubWasteAnalysis(waste) {
    if (typeof Chart === "undefined") return;
    var scaleOpts = {
      ticks: { color: "rgba(248,250,252,0.8)", font: { family: "'JetBrains Mono', monospace", size: 10 } },
      grid: { color: "rgba(255,255,255,0.06)" },
    };
    destroyChart(state.hubCharts.wasteAnalysis);
    var ctx = document.getElementById("chart-waste-analysis");
    if (!ctx || !waste.length) return;
    var items = waste.slice(0, 10);

    state.hubCharts.wasteAnalysis = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: items.map(function (w) { return w.ingredient; }),
        datasets: [{
          data: items.map(function (w) { return w.waste_rate; }),
          backgroundColor: [
            "rgba(239,68,68,0.8)", "rgba(249,115,22,0.8)", "rgba(245,158,11,0.8)",
            "rgba(234,179,8,0.8)", "rgba(132,204,22,0.8)", "rgba(16,185,129,0.8)",
            "rgba(20,184,166,0.8)", "rgba(6,182,212,0.8)", "rgba(99,102,241,0.8)",
            "rgba(168,85,247,0.8)",
          ],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "55%",
        plugins: {
          legend: {
            position: "right",
            labels: { color: "rgba(248,250,252,0.9)", font: { family: "'JetBrains Mono', monospace", size: 10 }, boxWidth: 12, padding: 8 },
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var w = items[ctx.dataIndex];
                return w.ingredient + ": " + w.waste_rate + "% waste rate";
              }
            }
          },
        },
      },
    });
  }

  function renderHubDailyTimeline(timeline) {
    if (typeof Chart === "undefined") return;
    var scaleOpts = {
      ticks: { color: "rgba(248,250,252,0.8)", font: { family: "'JetBrains Mono', monospace", size: 10 } },
      grid: { color: "rgba(255,255,255,0.06)" },
    };
    destroyChart(state.hubCharts.dailyTimeline);
    var ctx = document.getElementById("chart-daily-timeline");
    if (!ctx || !timeline.length) return;

    state.hubCharts.dailyTimeline = new Chart(ctx, {
      type: "line",
      data: {
        labels: timeline.map(function (d) {
          var parts = d.date.split("-");
          return parts[1] + "/" + parts[2];
        }),
        datasets: [
          {
            label: "Used",
            data: timeline.map(function (d) { return d.used; }),
            borderColor: "#6366f1",
            backgroundColor: "rgba(99,102,241,0.15)",
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: "#6366f1",
          },
          {
            label: "Waste",
            data: timeline.map(function (d) { return d.waste; }),
            borderColor: "#ef4444",
            backgroundColor: "rgba(239,68,68,0.1)",
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: "#ef4444",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "rgba(248,250,252,0.9)", font: { family: "'JetBrains Mono', monospace", size: 10 } } },
        },
        scales: {
          x: scaleOpts,
          y: scaleOpts,
        },
      },
    });
  }

  // ═══════════  DASHBOARD CHARTS  ═══════════════════════════════════════

  function fetchDashboardCharts() {
    return fetch("/api/dashboard/charts")
      .then(function (res) {
        return res.ok ? res.json() : Promise.reject("Failed");
      })
      .then(function (data) {
        renderDashboardCharts(data);
      })
      .catch(function (err) {
        console.error("Dashboard charts fetch failed:", err);
      });
  }

  function renderDashboardCharts(data) {
    if (typeof Chart === "undefined") return;

    var scaleOpts = {
      ticks: { color: "rgba(248,250,252,0.8)", font: { family: "'JetBrains Mono', monospace", size: 10 } },
      grid: { color: "rgba(255,255,255,0.06)" },
    };

    // --- Stock by Ingredient ---
    var items = (data.stock_by_ingredient || []).slice(0, 12);
    destroyChart(state.dashCharts.stockIngredient);
    var stockCtx = document.getElementById("dash-chart-stock-ingredient");
    if (stockCtx && items.length) {
      state.dashCharts.stockIngredient = new Chart(stockCtx, {
        type: "bar",
        data: {
          labels: items.map(function (i) { return i.ingredient; }),
          datasets: [
            {
              label: "Current Stock",
              data: items.map(function (i) { return i.current_stock; }),
              backgroundColor: "rgba(99,102,241,0.7)",
              borderColor: "#6366f1",
              borderWidth: 1,
              borderRadius: 4,
            },
            {
              label: "Par Level",
              data: items.map(function (i) { return i.par_level; }),
              backgroundColor: "rgba(245,158,11,0.35)",
              borderColor: "#f59e0b",
              borderWidth: 1,
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: "rgba(248,250,252,0.9)", font: { family: "'JetBrains Mono', monospace", size: 10 } } },
          },
          scales: {
            x: Object.assign({}, scaleOpts, { ticks: Object.assign({}, scaleOpts.ticks, { maxRotation: 45 }) }),
            y: scaleOpts,
          },
        },
      });
    }

    // --- Location Comparison ---
    var locs = data.location_comparison || [];
    destroyChart(state.dashCharts.locationCompare);
    var locCtx = document.getElementById("dash-chart-location-compare");
    if (locCtx && locs.length) {
      state.dashCharts.locationCompare = new Chart(locCtx, {
        type: "bar",
        data: {
          labels: locs.map(function (l) { return l.location; }),
          datasets: [
            {
              label: "Total Stock",
              data: locs.map(function (l) { return l.total_stock; }),
              backgroundColor: "rgba(245,158,11,0.7)",
              borderColor: "#f59e0b",
              borderWidth: 1,
              borderRadius: 4,
              yAxisID: "y",
            },
            {
              label: "Avg Risk %",
              data: locs.map(function (l) { return l.avg_risk; }),
              backgroundColor: "rgba(52,211,153,0.7)",
              borderColor: "#34d399",
              borderWidth: 1,
              borderRadius: 4,
              yAxisID: "y1",
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: "rgba(248,250,252,0.9)", font: { family: "'JetBrains Mono', monospace", size: 10 } } },
          },
          scales: {
            x: scaleOpts,
            y: Object.assign({}, scaleOpts, { position: "left", title: { display: true, text: "Stock", color: "rgba(248,250,252,0.5)" } }),
            y1: Object.assign({}, scaleOpts, { position: "right", min: 0, max: 100, title: { display: true, text: "Risk %", color: "rgba(248,250,252,0.5)" }, grid: { drawOnChartArea: false } }),
          },
        },
      });
    }

    // --- Populate Dashboard Stats ---
    var alertsEl = document.getElementById("dash-stat-alerts");
    var itemsEl = document.getElementById("dash-stat-items");
    var risksEl = document.getElementById("dash-stat-risks");
    var expiringEl = document.getElementById("dash-stat-expiring");

    if (alertsEl) alertsEl.textContent = data.total_alerts || 0;
    if (itemsEl) itemsEl.textContent = data.total_items || items.length;
    if (risksEl) risksEl.textContent = data.total_risks || 0;
    if (expiringEl) expiringEl.textContent = data.expiring_soon || 0;
  }

  // Auto-refresh dashboard charts every 60s
  setInterval(function () {
    if (state.isLoggedIn && state.currentView === "oracle") {
      fetchDashboardCharts();
    }
  }, 60000);

  function showDashboard() {
    state.isLoggedIn = true;
    if (DOM.loginView) DOM.loginView.classList.add("hidden");
    if (DOM.dashboardView) DOM.dashboardView.classList.remove("hidden");
    renderSidebar();
    renderQuickActions();
    handleRunSimulation("Baseline initialization");
    fetchHomeSummary();
    fetchDashboardCharts();
  }

  function showLogin() {
    state.isLoggedIn = false;
    if (DOM.loginView) DOM.loginView.classList.remove("hidden");
    if (DOM.dashboardView) DOM.dashboardView.classList.add("hidden");
  }

  // ═══════════  ALERTS PANEL  ═══════════════════════════════════════════════

  // ── Home Summary (dynamic dashboard sections) ─────────────────────────────

  function fetchHomeSummary() {
    fetch("/api/home-summary")
      .then(function (res) {
        return res.ok ? res.json() : Promise.reject("Failed");
      })
      .then(function (data) {
        renderOutlookAlerts(data.strategic_outlook || []);
      })
      .catch(function (err) {
        console.error("Home summary fetch failed:", err);
      });
  }
  // ═══════════  REPORTS PANEL  ═══════════════════════════════════════════════

  function fetchReports(location) {
    location = location || 'all';
    console.log("[Reports] Fetching reports for location:", location);

    fetch("/api/reports?location=" + location)
      .then(function (res) {
        return res.ok ? res.json() : Promise.reject("Failed");
      })
      .then(function (data) {
        console.log("[Reports] Received data:", data);
        state.reportsData = data;
        renderLowStockReport(data.low_stock || []);
        renderUsageReport(data.usage || []);
        renderVarianceReport(data.variance || []);
      })
      .catch(function (err) {
        console.error("Reports fetch failed:", err);
      });
  }

  function renderLowStockReport(items) {
    var tbody = document.getElementById("report-low-stock");
    if (!tbody) {
      console.error("Low stock tbody not found");
      return;
    }

    console.log("[Reports] Rendering low stock items:", items.length);

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-white/40 py-4">No low stock items</td></tr>';
      return;
    }

    tbody.innerHTML = items.map(function (item) {
      var statusClass = item.status === 'Critical' ? 'status-critical' : 'status-low';
      return '<tr>' +
        '<td>' + escapeHtml(item.item) + '</td>' +
        '<td>' + escapeHtml(item.location) + '</td>' +
        '<td class="num">' + escapeHtml(item.current) + '</td>' +
        '<td class="num">' + escapeHtml(item.par) + '</td>' +
        '<td class="' + statusClass + '">' + escapeHtml(item.status) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderUsageReport(items) {
    // Find the Usage Report tbody (it's the second collapsible section)
    var sections = document.querySelectorAll('#reports-panel .collapsible-section');
    var tbody = sections[1] ? sections[1].querySelector('tbody') : null;

    if (!tbody) {
      console.error("Usage report tbody not found");
      return;
    }

    console.log("[Reports] Rendering usage items:", items.length);

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-white/40 py-4">No usage data</td></tr>';
      return;
    }

    tbody.innerHTML = items.map(function (item) {
      return '<tr>' +
        '<td>' + escapeHtml(item.item) + '</td>' +
        '<td>' + escapeHtml(item.location) + '</td>' +
        '<td class="num">' + escapeHtml(item.used) + '</td>' +
        '<td class="num">' + escapeHtml(item.predicted) + '</td>' +
        '<td class="num ' + item.variance_class + '">' + escapeHtml(item.variance) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderVarianceReport(items) {
    // Find the Variance Report tbody (it's the third collapsible section)
    var sections = document.querySelectorAll('#reports-panel .collapsible-section');
    var tbody = sections[2] ? sections[2].querySelector('tbody') : null;

    if (!tbody) {
      console.error("Variance report tbody not found");
      return;
    }

    console.log("[Reports] Rendering variance items:", items.length);

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-white/40 py-4">No variance data</td></tr>';
      return;
    }

    tbody.innerHTML = items.map(function (item) {
      return '<tr>' +
        '<td>' + escapeHtml(item.item) + '</td>' +
        '<td>' + escapeHtml(item.location) + '</td>' +
        '<td class="num">' + escapeHtml(item.expected) + '</td>' +
        '<td class="num">' + escapeHtml(item.actual) + '</td>' +
        '<td class="num ' + item.diff_class + '">' + escapeHtml(item.diff) + '</td>' +
        '</tr>';
    }).join('');
  }
  // Auto-refresh outlook tiles every 30s so edits to classifier_output.txt show up live
  setInterval(function () {
    if (state.isLoggedIn && state.currentView === "oracle") {
      fetchHomeSummary();
    }
  }, 30000);

  function renderOutlookAlerts(items) {
    if (!DOM.outlookAlerts) return;
    if (!items || items.length === 0) {
      DOM.outlookAlerts.innerHTML = "";
      return;
    }
    var MAX_TILES = 5;
    var visible = items.slice(0, MAX_TILES);
    var html = visible
      .map(function (item, idx) {
        var isStockout = item.event_type === "STOCKOUT_RISK";
        var pct = Math.round((item.confidence || 0) * 100);
        var glowClass = isStockout ? "bg-red-600" : "bg-amber-600";
        var barClass = isStockout
          ? "bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]"
          : "bg-yellow-500";
        var pctClass = isStockout ? "text-red-500" : "text-yellow-400";
        var badgeClass = isStockout
          ? "text-red-500 bg-red-500/10 border-red-500/20"
          : "text-amber-500 bg-amber-500/10 border-amber-500/20";
        var eventLabel = (item.event_type || "").replace(/_/g, " ");
        var animationDelay = 'style="animation-delay: ' + idx * 100 + 'ms"';
        return (
          '<div class="glass-panel p-8 rounded-[32px] hover:border-white/20 transition-all duration-500 group relative overflow-hidden flex flex-col justify-between border-white/5" ' +
          animationDelay +
          ">" +
          '<div class="absolute -right-10 -bottom-10 w-32 h-32 blur-[60px] opacity-10 group-hover:opacity-30 transition-opacity rounded-full ' +
          glowClass +
          '"></div>' +
          '<div class="relative z-10 flex justify-between items-start">' +
          '<div><h3 class="text-xl font-bold tracking-tight mb-2 group-hover:text-amber-400 transition-colors">' +
          escapeHtml(item.item) +
          "</h3>" +
          '<div class="flex items-center gap-2">' +
          '<span class="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border transition-all duration-300 mono ' +
          badgeClass +
          '">' +
          eventLabel +
          "</span>" +
          '<span class="text-[9px] mono text-white/20 uppercase tracking-widest">' +
          (item.days_until || "?") +
          " DAYS OUT</span></div></div>" +
          '<div class="text-4xl font-black tracking-tighter mono ' +
          pctClass +
          '">' +
          pct +
          '<span class="text-sm opacity-20">%</span></div></div>' +
          '<div class="relative z-10 mt-10 space-y-5">' +
          '<p class="text-xs text-white/40 leading-relaxed italic border-l border-white/10 pl-4 py-1">"AI confidence: ' +
          pct +
          "% — " +
          eventLabel.toLowerCase() +
          " predicted within " +
          (item.days_until || "?") +
          ' days"</p>' +
          '<div class="flex items-center justify-between"><div class="flex-1 h-1 bg-white/5 rounded-full overflow-hidden mr-6">' +
          '<div class="h-full transition-all duration-1000 ' +
          barClass +
          '" style="width: ' +
          pct +
          '%"></div></div>' +
          '<button type="button" class="text-[9px] mono uppercase text-white/20 hover:text-white transition-colors tracking-widest">DETAILS</button></div></div></div>'
        );
      })
      .join("");
    // Always show a View More tile as the last tile (6th slot) linking to full AI Alerts view
    var moreCount = items.length > MAX_TILES ? items.length - MAX_TILES : 0;
    var moreLabel =
      moreCount > 0 ? moreCount + " MORE ALERTS" : "FULL AI ALERTS VIEW";
    html +=
      '<div class="glass-panel p-8 rounded-[32px] border-amber-500/20 flex flex-col items-center justify-center cursor-pointer hover:bg-amber-500/10 hover:border-white/20 transition-all duration-500 group relative overflow-hidden view-more-btn" data-target="alerts">' +
      '<div class="absolute -right-10 -bottom-10 w-32 h-32 blur-[60px] opacity-10 group-hover:opacity-30 transition-opacity rounded-full bg-amber-600"></div>' +
      '<div class="relative z-10 text-center space-y-4">' +
      '<div class="w-16 h-16 mx-auto border border-amber-500/30 rounded-full flex items-center justify-center group-hover:border-amber-400/50 transition-colors">' +
      '<svg class="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg></div>' +
      '<div><p class="text-xl font-bold tracking-tight text-amber-400">View More</p>' +
      '<p class="text-[9px] mono uppercase tracking-widest text-white/30 mt-1">' +
      moreLabel +
      "</p></div></div></div>";
    DOM.outlookAlerts.innerHTML = html;
  }

  function loadAlerts() {
    // Only pre-render alerts if the results view is already visible
    // (i.e. user already clicked Run Inventory Check / Re-Scan).
    // Never auto-transition from the hero CTA to results.
    if (DOM.alertsResults && !DOM.alertsResults.classList.contains("hidden")) {
      fetch("/alerts")
        .then(function (res) {
          return res.ok ? res.json() : Promise.reject("Failed");
        })
        .then(function (data) {
          var alerts = data.alerts || [];
          if (alerts.length > 0) {
            renderAlerts(alerts);
          }
        })
        .catch(function (err) {
          console.error("Load alerts failed:", err);
        });
    }
  }

  function renderAlerts(alerts) {
    state.alertsData = alerts;
    delete _chartExplainCache["alerts-summary"];
    if (!DOM.alertsList) return;
    if (!alerts || alerts.length === 0) {
      DOM.alertsList.innerHTML =
        '<div class="glass-panel p-8 flex flex-col items-center justify-center text-center space-y-4 min-h-[200px]">' +
        '<div class="w-12 h-12 border border-white/10 rounded-full flex items-center justify-center">' +
        '<svg class="w-6 h-6 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>' +
        '</div><p class="text-[10px] mono uppercase text-white/20 tracking-[0.2em]">No active alerts. Click "Run Inventory Check" to scan.</p></div>';
      return;
    }
    DOM.alertsList.innerHTML = alerts
      .map(function (a) {
        var ev = a.risk_event || {};
        var isStockout = ev.event_type === "STOCKOUT_RISK";
        var borderColor = isStockout
          ? "border-red-500/30"
          : "border-amber-500/30";
        var tagColor = isStockout
          ? "text-red-400 bg-red-500/10 border-red-500/20"
          : "text-amber-400 bg-amber-500/10 border-amber-500/20";
        var glowBg = isStockout ? "bg-red-600" : "bg-amber-600";
        var actions = (a.suggested_actions || [])
          .map(function (act) {
            return (
              '<li class="flex items-start gap-2"><span class="text-amber-400 mt-0.5">→</span><span>' +
              escapeHtml(act) +
              "</span></li>"
            );
          })
          .join("");
        var ctx = a.historical_context || {};
        var ctxInfo = "";
        if (ctx.avg_daily_use) {
          ctxInfo =
            '<div class="flex flex-wrap gap-3 mt-3">' +
            '<span class="text-[9px] mono text-white/30 px-2 py-1 bg-white/5 rounded-lg">Avg use: ' +
            ctx.avg_daily_use +
            "/day</span>" +
            '<span class="text-[9px] mono text-white/30 px-2 py-1 bg-white/5 rounded-lg">Avg waste: ' +
            ctx.avg_daily_waste +
            "/day</span>" +
            '<span class="text-[9px] mono text-white/30 px-2 py-1 bg-white/5 rounded-lg">Trend: ' +
            escapeHtml(ctx.trend || "n/a") +
            "</span>" +
            '<span class="text-[9px] mono text-white/30 px-2 py-1 bg-white/5 rounded-lg">Covers (7d): ' +
            (ctx.last_week_covers || 0) +
            "</span>" +
            "</div>";
        }
        return (
          '<div class="glass-panel p-6 ' +
          borderColor +
          ' relative overflow-hidden hover:border-white/20 transition-all duration-300">' +
          '<div class="absolute -right-8 -bottom-8 w-24 h-24 blur-[50px] opacity-10 rounded-full ' +
          glowBg +
          '"></div>' +
          '<div class="relative z-10">' +
          '<div class="flex items-start justify-between mb-3">' +
          '<div class="flex items-center gap-3">' +
          '<span class="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border mono ' +
          tagColor +
          '">' +
          (ev.event_type || "").replace("_", " ") +
          "</span>" +
          '<h3 class="text-lg font-bold tracking-tight">' +
          escapeHtml((ev.item_id || "").replace(/_/g, " ")) +
          "</h3>" +
          "</div>" +
          '<div class="flex items-center gap-4 text-right">' +
          '<div><span class="text-[9px] mono text-white/30 block">Confidence</span><span class="text-xl font-black mono">' +
          Math.round((ev.confidence || 0) * 100) +
          "%</span></div>" +
          '<div><span class="text-[9px] mono text-white/30 block">Days</span><span class="text-xl font-black mono">' +
          (ev.days_until || "?") +
          "</span></div>" +
          "</div></div>" +
          '<p class="text-sm text-white/70 leading-relaxed mb-3">' +
          escapeHtml(a.alert_message || "") +
          "</p>" +
          (actions
            ? '<ul class="text-xs text-white/60 space-y-1.5 mb-2">' +
            actions +
            "</ul>"
            : "") +
          ctxInfo +
          "</div></div>"
        );
      })
      .join("");
  }

  var spinnerSvg =
    '<svg class="animate-spin h-5 w-5 text-black" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>';
  var boltSvg =
    '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>';
  var boltSvgLg =
    '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>';

  function handleRunCheck(isRescan) {
    // Set scanning state on the correct button
    var btn = isRescan ? DOM.btnRunCheckAgain : DOM.btnRunCheck;
    var icon = isRescan ? DOM.checkIconAgain : DOM.checkIcon;
    if (!btn) return;
    var label = btn.querySelector("span");
    btn.disabled = true;
    if (label) label.textContent = "Scanning...";
    if (icon) icon.innerHTML = spinnerSvg;
    if (DOM.alertsScanStatus)
      DOM.alertsScanStatus.textContent = "Scanning pipeline...";

    fetch("/run-inventory-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then(function (res) {
        return res.ok ? res.json() : Promise.reject("Request failed");
      })
      .then(function (data) {
        var sum = data.pipeline_summary || {};
        if (DOM.sumPredictions)
          DOM.sumPredictions.textContent = sum.predictions_loaded || 0;
        if (DOM.sumRiskEvents)
          DOM.sumRiskEvents.textContent = sum.risk_events_generated || 0;
        if (DOM.sumAfterRules)
          DOM.sumAfterRules.textContent = sum.after_rule_engine || 0;
        if (DOM.sumAlertsSent)
          DOM.sumAlertsSent.textContent =
            sum.eligible_for_alert || sum.alerts_generated || 0;
        renderAlerts(data.all_alerts || data.alerts || []);
        // Transition: hide hero, show results
        if (DOM.alertsInitial) DOM.alertsInitial.classList.add("hidden");
        if (DOM.alertsResults) DOM.alertsResults.classList.remove("hidden");
        // Refresh home dashboard sections with new alert data
        fetchHomeSummary();
      })
      .catch(function (err) {
        console.error("Inventory check failed:", err);
        if (DOM.alertsScanStatus)
          DOM.alertsScanStatus.textContent = "Scan failed — check server logs";
        if (DOM.alertsList)
          DOM.alertsList.innerHTML =
            '<div class="glass-panel p-6 text-center text-red-400 text-sm">Error running inventory check. Check server logs.</div>';
      })
      .finally(function () {
        btn.disabled = false;
        if (label)
          label.textContent = isRescan ? "Re-Scan" : "Run Inventory Check";
        if (icon) icon.innerHTML = isRescan ? boltSvg : boltSvgLg;
      });
  }

  // ═══════════  CHAT PANEL  ════════════════════════════════════════════════

  function appendChatMessage(role, text) {
    if (!DOM.chatMessages) return;
    var isUser = role === "user";
    var avatar = isUser
      ? '<div class="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 text-[10px] font-bold text-emerald-400">JD</div>'
      : '<div class="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0"><svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-1.405 2.81A2.25 2.25 0 0115.604 19H8.396a2.25 2.25 0 01-1.991-1.69L5 14.5m14 0H5"/></svg></div>';
    var bubbleClass = isUser
      ? "bg-amber-500/10 border border-amber-500/20 rounded-2xl rounded-tr-sm"
      : "bg-white/5 border border-white/5 rounded-2xl rounded-tl-sm";
    var justifyClass = isUser ? "justify-end" : "";

    // Format AI response: convert markdown-ish bullet points and bold
    var formatted = escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white/90">$1</strong>')
      .replace(/\n- /g, "\n• ")
      .replace(/\n\* /g, "\n• ")
      .replace(/\n/g, "<br>");

    var html =
      '<div class="flex items-start gap-3 ' +
      justifyClass +
      '">' +
      (isUser ? "" : avatar) +
      '<div class="' +
      bubbleClass +
      ' px-4 py-3 max-w-[80%]"><p class="text-sm text-white/80 leading-relaxed">' +
      formatted +
      "</p></div>" +
      (isUser ? avatar : "") +
      "</div>";
    DOM.chatMessages.insertAdjacentHTML("beforeend", html);
    DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight;
  }

  function appendChatLoading() {
    if (!DOM.chatMessages) return;
    var html =
      '<div class="flex items-start gap-3 chat-loading">' +
      '<div class="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0"><svg class="w-4 h-4 text-amber-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-1.405 2.81A2.25 2.25 0 0115.604 19H8.396a2.25 2.25 0 01-1.991-1.69L5 14.5m14 0H5"/></svg></div>' +
      '<div class="bg-white/5 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3"><span class="text-sm text-white/40 animate-pulse">Thinking...</span></div></div>';
    DOM.chatMessages.insertAdjacentHTML("beforeend", html);
    DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight;
  }

  function removeChatLoading() {
    if (!DOM.chatMessages) return;
    var el = DOM.chatMessages.querySelector(".chat-loading");
    if (el) el.remove();
  }

  function handleChatSend(message) {
    message = (message || "").trim();
    if (!message) return;
    appendChatMessage("user", message);
    if (DOM.chatInput) DOM.chatInput.value = "";
    appendChatLoading();

    fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message }),
    })
      .then(function (res) {
        return res.ok ? res.json() : Promise.reject("Request failed");
      })
      .then(function (data) {
        removeChatLoading();
        appendChatMessage("ai", data.response || "No response received.");
      })
      .catch(function (err) {
        removeChatLoading();
        appendChatMessage(
          "ai",
          "Sorry, I couldn't process that. Please try again.",
        );
        console.error("Chat error:", err);
      });
  }
  // Reports location filter
  if (DOM.reportsLocationSelect) {
    DOM.reportsLocationSelect.addEventListener("change", function () {
      if (state.currentView === "reports") {
        fetchReports(DOM.reportsLocationSelect.value);
      }
    });
  }
  if (DOM.btnLogin) {
    DOM.btnLogin.addEventListener("click", showDashboard);
  }

  if (DOM.btnLogout) {
    DOM.btnLogout.addEventListener("click", showLogin);
  }

  if (DOM.btnIgnite) {
    DOM.btnIgnite.addEventListener("click", function () {
      handleRunSimulation(DOM.scenarioInput ? DOM.scenarioInput.value : "");
    });
  }

  if (DOM.hubRestaurantSelect) {
    DOM.hubRestaurantSelect.addEventListener("change", function () {
      if (state.currentView === "inventory-hub") renderInventoryHub();
    });
  }

  // ═══ Dashboard: View More button ═══
  var btnViewInventory = document.getElementById("btn-view-inventory");
  if (btnViewInventory) {
    btnViewInventory.addEventListener("click", function () {
      setView("inventory-hub");
    });
  }

  // ═══ Dashboard: View More button ═══
  var btnViewInventory = document.getElementById("btn-view-inventory");
  if (btnViewInventory) {
    btnViewInventory.addEventListener("click", function () {
      setView("inventory-hub");
    });
  }


  // ═══ Chat panel: Send button + Enter key ═══
  if (DOM.btnChatSend) {
    DOM.btnChatSend.addEventListener("click", function () {
      handleChatSend(DOM.chatInput ? DOM.chatInput.value : "");
    });
  }
  if (DOM.chatInput) {
    DOM.chatInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleChatSend(DOM.chatInput.value);
      }
    });
  }
  if (DOM.chatQuickQuestions) {
    DOM.chatQuickQuestions
      .querySelectorAll(".chat-chip")
      .forEach(function (chip) {
        chip.addEventListener("click", function () {
          var q = chip.getAttribute("data-q");
          if (q) handleChatSend(q);
        });
      });
  }

  // Collapsible sections: click header to minimize/maximize
  document.addEventListener("click", function (e) {
    var toggle = e.target.closest("[data-collapse-toggle]");
    if (!toggle) return;
    var section = toggle.closest(".collapsible-section");
    if (section) section.classList.toggle("collapsed");
  });

  // View More buttons: navigate to the target panel
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".view-more-btn");
    if (!btn) return;
    var target = btn.getAttribute("data-target");
    if (target) setView(target);
  });

  // ═════════════════════════════════════════════════════════════════════
  //   AGENT COPILOT — Gemini-powered autonomous agent
  // ═════════════════════════════════════════════════════════════════════

  var copilotState = {
    sessionId: null,
    totalToolCalls: 0,
    totalActionsCreated: 0,
    totalTurns: 0,
    isProcessing: false,
    lastIntent: null,  // NEW: Track last intent for context
    lastFilters: {},   // NEW: Track last applied filters
    lastActionCount: 0, // NEW: Track previous action count
  };

  // Also keep action queue state for the table
  var agentState = {
    actions: [],
    sortKey: null,
    sortAsc: true,
  };

  // Lazy-init agent DOM refs (protect against script running before DOM is ready)
  function ensureAgentDOM() {
    if (!DOM.agentQueueBody) DOM.agentQueueBody = document.getElementById("agent-queue-body");
    if (!DOM.agentFilterStatus) DOM.agentFilterStatus = document.getElementById("agent-filter-status");
    if (!DOM.agentFilterOwner) DOM.agentFilterOwner = document.getElementById("agent-filter-owner");
    if (!DOM.agentAuditLog) DOM.agentAuditLog = document.getElementById("agent-audit-log");
    if (!DOM.agentStatTotal) DOM.agentStatTotal = document.getElementById("agent-stat-total");
    if (!DOM.agentStatProposed) DOM.agentStatProposed = document.getElementById("agent-stat-proposed");
    if (!DOM.agentStatExecuted) DOM.agentStatExecuted = document.getElementById("agent-stat-executed");
    if (!DOM.agentStatAlerts) DOM.agentStatAlerts = document.getElementById("agent-stat-alerts");
    if (!DOM.copilotMessages) DOM.copilotMessages = document.getElementById("copilot-messages");
  }

  // ─── COPILOT: Generate session ID ───
  function copilotNewSession() {
    copilotState.sessionId = 'sess-' + Math.random().toString(36).substr(2, 9);
    copilotState.totalToolCalls = 0;
    copilotState.totalActionsCreated = 0;
    copilotState.totalTurns = 0;
    copilotState.lastIntent = null;      // Reset context
    copilotState.lastFilters = {};       // Reset filters
    copilotState.lastActionCount = 0;    // Reset count
    if (DOM.copilotSessionId) DOM.copilotSessionId.textContent = copilotState.sessionId;
    copilotUpdateStats();
    // Clear messages to just the welcome
    if (DOM.copilotMessages) {
      DOM.copilotMessages.innerHTML =
        '<div class="flex gap-3">' +
          '<div class="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">' +
            '<svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>' +
          '</div>' +
          '<div class="flex-1">' +
            '<div class="text-[10px] mono text-amber-400/60 uppercase tracking-widest mb-1.5">SpellStock Assistant</div>' +
            '<div class="text-[13px] text-white/70 leading-relaxed">' +
              'Session reset. Ready to help with your kitchen inventory. Try asking: <em class="text-white/50">"show me all actions"</em> or <em class="text-white/50">"what needs attention?"</em>' +
            '</div>' +
          '</div>' +
        '</div>';
    }
    // Reset on backend too
    fetch('/agent/copilot/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: copilotState.sessionId }),
    }).catch(function() {});
  }

  // Initialize session
  copilotNewSession();

  function copilotUpdateStats() {
    if (DOM.copilotStatTools) DOM.copilotStatTools.textContent = copilotState.totalToolCalls;
    if (DOM.copilotStatActions) DOM.copilotStatActions.textContent = copilotState.totalActionsCreated;
    if (DOM.copilotStatTurns) DOM.copilotStatTurns.textContent = copilotState.totalTurns;
    // Alerts count from agent actions
    var alertCount = agentState.actions.length;
    if (DOM.copilotStatAlerts) DOM.copilotStatAlerts.textContent = alertCount;
  }

  // ─── COPILOT: Tool call rendering ───
  function renderToolName(name) {
    var labels = {
      'check_inventory': '📦 Check Inventory',
      'get_alerts': '🚨 Get Alerts',
      'get_historical_data': '📊 Historical Data',
      'draft_purchase_order': '📝 Draft PO',
      'create_kitchen_task': '👨‍🍳 Create Task',
      'adjust_par_level': '📐 Adjust Par',
      'analyze_trend': '📈 Analyze Trend',
      'get_action_queue': '📋 Action Queue',
      'query_actions': '🔍 Query Actions',
      'execute_action': '⚡ Execute Action',
      'approve_action': '✅ Approve Action',
      'reject_action': '❌ Reject Action',
      'rollback_action': '↩️ Rollback Action',
      'bulk_action': '🔄 Bulk Action',
      'generate_action_plan': '🧠 Generate Plan',
    };
    return labels[name] || name;
  }

  function renderToolCallHTML(tc) {
    var argsStr = '';
    if (tc.args && Object.keys(tc.args).length > 0) {
      argsStr = Object.keys(tc.args).map(function(k) {
        return '<span class="text-cyan-400/70">' + escapeHtml(k) + '</span>: <span class="text-white/60">' + escapeHtml(String(tc.args[k])) + '</span>';
      }).join(', ');
    }
    var resultPreview = '';
    if (tc.result) {
      var r = typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2);
      if (r.length > 300) r = r.substring(0, 300) + '...';
      resultPreview = '<div class="mt-2 bg-white/[0.02] rounded-lg p-3 border border-white/5 max-h-[150px] overflow-y-auto">' +
        '<pre class="text-[10px] mono text-white/40 whitespace-pre-wrap">' + escapeHtml(r) + '</pre>' +
      '</div>';
    }
    var thoughtHTML = '';
    if (tc.agent_thought) {
      thoughtHTML = '<div class="mt-2 text-[11px] text-amber-300/60 italic">' + escapeHtml(tc.agent_thought) + '</div>';
    }
    return '<div class="ml-10 my-2 rounded-xl bg-white/[0.02] border border-white/[0.04] p-3">' +
      '<div class="flex items-center gap-2">' +
        '<span class="text-[10px] font-semibold text-cyan-400">' + renderToolName(tc.tool) + '</span>' +
        (argsStr ? '<span class="text-[9px] mono text-white/25">(' + argsStr + ')</span>' : '') +
      '</div>' +
      thoughtHTML +
      resultPreview +
    '</div>';
  }

  function renderActionCreatedHTML(action) {
    var typeBadge = action.status === 'draft_created' ? 'Draft PO' :
                    action.status === 'task_created' ? 'Task' :
                    action.status === 'par_adjustment_proposed' ? 'Par Adjust' :
                    action.operation ? 'Bulk ' + action.operation :
                    action.new_status === 'executed' ? 'Executed' :
                    action.new_status === 'approved' ? 'Approved' :
                    action.new_status === 'rejected' ? 'Rejected' :
                    action.new_status === 'rolled_back' ? 'Rolled Back' :
                    action.status || 'Action';
    var colorClass = (action.new_status === 'rejected' || action.new_status === 'rolled_back')
      ? 'border-red-500/20 bg-red-500/[0.06]'
      : (action.new_status === 'executed' || action.operation === 'execute')
        ? 'border-cyan-500/20 bg-cyan-500/[0.06]'
        : 'border-emerald-500/20 bg-emerald-500/[0.06]';
    var badgeColor = (action.new_status === 'rejected' || action.new_status === 'rolled_back')
      ? 'border-red-500/30 bg-red-500/10 text-red-400'
      : (action.new_status === 'executed' || action.operation === 'execute')
        ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
    return '<div class="ml-10 my-2 rounded-xl ' + colorClass + ' border p-3">' +
      '<div class="flex items-center gap-2 mb-1">' +
        '<span class="inline-block text-[9px] mono uppercase tracking-widest px-2.5 py-0.5 rounded-full border ' + badgeColor + '">✓ ' + escapeHtml(typeBadge) + '</span>' +
        (action.action_id ? '<span class="text-[9px] mono text-white/20">' + escapeHtml(String(action.action_id).slice(0, 8)) + '</span>' : '') +
        (action.ingredient ? '<span class="text-[10px] text-white/50">' + escapeHtml(action.ingredient) + '</span>' : '') +
      '</div>' +
      '<p class="text-[11px] text-white/60">' + escapeHtml(action.message || '') + '</p>' +
      (action.processed !== undefined ? '<p class="text-[10px] text-white/40 mt-1">' + action.processed + ' processed, ' + (action.failed || 0) + ' failed/skipped</p>' : '') +
    '</div>';
  }

  // ─── COPILOT: Add message to chat ───
  function copilotAddUserMessage(text) {
    if (!DOM.copilotMessages) return;
    var html = '<div class="flex gap-3 justify-end">' +
      '<div class="flex-1 max-w-[80%]">' +
        '<div class="text-[10px] mono text-amber-400/60 uppercase tracking-widest mb-1.5 text-right">You</div>' +
        '<div class="text-[13px] text-white/80 leading-relaxed bg-amber-500/10 border border-amber-500/20 rounded-xl rounded-tr-sm px-4 py-3">' +
          escapeHtml(text) +
        '</div>' +
      '</div>' +
      '<div class="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">' +
        '<svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>' +
      '</div>' +
    '</div>';
    DOM.copilotMessages.insertAdjacentHTML('beforeend', html);
    DOM.copilotMessages.scrollTop = DOM.copilotMessages.scrollHeight;
  }

  function copilotAddThinkingIndicator() {
    if (!DOM.copilotMessages) return;
    var html = '<div id="copilot-thinking" class="flex gap-3">' +
      '<div class="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">' +
        '<svg class="w-3.5 h-3.5 text-amber-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>' +
      '</div>' +
      '<div class="flex-1">' +
        '<div class="text-[10px] mono text-amber-400/60 uppercase tracking-widest mb-1.5">SpellStock Assistant</div>' +
        '<div class="flex items-center gap-2">' +
          '<div class="flex gap-1">' +
            '<div class="w-1.5 h-1.5 rounded-full bg-amber-400/50 animate-bounce" style="animation-delay: 0ms"></div>' +
            '<div class="w-1.5 h-1.5 rounded-full bg-amber-400/50 animate-bounce" style="animation-delay: 150ms"></div>' +
            '<div class="w-1.5 h-1.5 rounded-full bg-amber-400/50 animate-bounce" style="animation-delay: 300ms"></div>' +
          '</div>' +
          '<span class="text-[10px] text-white/20 mono">analyzing your kitchen data...</span>' +
        '</div>' +
      '</div>' +
    '</div>';
    DOM.copilotMessages.insertAdjacentHTML('beforeend', html);
    DOM.copilotMessages.scrollTop = DOM.copilotMessages.scrollHeight;
  }

  function copilotRemoveThinking() {
    var el = document.getElementById('copilot-thinking');
    if (el) el.remove();
  }

  function copilotAddAgentResponse(data) {
    ensureAgentDOM();
    if (!DOM.copilotMessages) return;
    copilotRemoveThinking();

    // Render tool calls first
    var toolsHTML = '';
    if (data.tool_calls && data.tool_calls.length > 0) {
      toolsHTML = '<div class="mb-3">' +
        '<div class="text-[9px] mono text-white/20 uppercase tracking-widest mb-2 ml-10">Agent used ' + data.tool_calls.length + ' tool(s):</div>' +
        data.tool_calls.map(renderToolCallHTML).join('') +
      '</div>';
    }

    // Render actions created
    var actionsHTML = '';
    if (data.actions_created && data.actions_created.length > 0) {
      actionsHTML = '<div class="mb-3">' +
        '<div class="text-[9px] mono text-white/20 uppercase tracking-widest mb-2 ml-10">Actions created:</div>' +
        data.actions_created.map(renderActionCreatedHTML).join('') +
      '</div>';
    }

    // ── Parse the structured response ──
    var structured = data.structured || null;
    if (!structured && data.response) {
      try {
        var parsed = JSON.parse(data.response);
        if (parsed && parsed.intent) structured = parsed;
      } catch(e) {}
    }

    // ── Build a SHORT text summary for the chat (NO inline table) ──
    var summaryHTML = '';
    if (structured && structured.intent) {
      summaryHTML = renderCopilotSummary(structured);

      // ── DIRECTLY UPDATE the real Action Queue table ──
      applyCopilotToQueue(structured, data);
    } else {
      // Fallback: plain text
      var responseText = data.response || '';
      if (responseText.trim().charAt(0) === '{') {
        try {
          var fp = JSON.parse(responseText);
          if (fp && fp.intent) {
            summaryHTML = renderCopilotSummary(fp);
            applyCopilotToQueue(fp, data);
          }
        } catch(e) {
          summaryHTML = formatPlainResponse(responseText);
        }
      } else if (responseText) {
        summaryHTML = formatPlainResponse(responseText);
      }
    }

    var html = '<div class="flex gap-3">' +
      '<div class="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">' +
        '<svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>' +
      '</div>' +
      '<div class="flex-1">' +
        '<div class="flex items-center gap-2 mb-1.5">' +
          '<span class="text-[10px] mono text-amber-400/60 uppercase tracking-widest">SpellStock Assistant</span>' +
          '<span class="text-[9px] mono text-white/15">' + (data.turn_count || 0) + ' turn(s)</span>' +
        '</div>' +
        toolsHTML +
        actionsHTML +
        summaryHTML +
      '</div>' +
    '</div>';

    DOM.copilotMessages.insertAdjacentHTML('beforeend', html);
    DOM.copilotMessages.scrollTop = DOM.copilotMessages.scrollHeight;
  }

  // ─── Format plain text response ───
  function formatPlainResponse(text) {
    return '<div class="text-[13px] text-white/70 leading-relaxed">' +
      escapeHtml(text)
        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white/90">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code class="text-[10px] mono bg-white/5 px-1.5 py-0.5 rounded">$1</code>')
        .replace(/\n- /g, '\n• ')
        .replace(/\n/g, '<br>') +
    '</div>';
  }

  // ─── Short text summary for chat (NO inline table) ───
  function renderCopilotSummary(s) {
    var intentColors = {
      'VIEW': 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
      'FILTER': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
      'ADD': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
      'MODIFY': 'bg-amber-500/15 text-amber-400 border-amber-500/20',
      'EXECUTE': 'bg-purple-500/15 text-purple-400 border-purple-500/20',
      'REMOVE': 'bg-red-500/15 text-red-400 border-red-500/20',
      'RESET': 'bg-orange-500/15 text-orange-400 border-orange-500/20',
    };
    var intentCls = intentColors[s.intent] || 'bg-white/5 text-white/40 border-white/10';
    var count = (s.actions_queue || []).length;
    var execCount = (s.executions_triggered || []).length;
    var prevCount = copilotState.lastActionCount || 0;
    var lastIntent = copilotState.lastIntent;

    // Build context-aware summary line
    var summary = '';
    var contextNote = '';
    
    if (s.intent === 'VIEW') {
      summary = 'Loaded ' + count + ' action' + (count !== 1 ? 's' : '') + ' into the queue below.';
      if (count === 0) {
        summary += ' <span class="text-amber-400">Try saying "generate action plan" to create actions from alerts.</span>';
      }
    } else if (s.intent === 'RESET') {
      summary = 'Regenerated action plan. ' + count + ' new action' + (count !== 1 ? 's' : '') + ' created.';
      contextNote = '🔄 Starting fresh from active alerts';
    } else if (s.intent === 'FILTER') {
      var filterDesc = Object.keys(s.filters_applied || {}).map(function(k) {
        return '<strong>' + escapeHtml(k) + '</strong>: ' + escapeHtml(String(s.filters_applied[k]));
      }).join(', ');
      
      // Context: show narrowing from previous
      if (lastIntent === 'VIEW' || lastIntent === 'FILTER' || lastIntent === 'RESET') {
        summary = 'Narrowed from <strong>' + prevCount + '</strong> to <strong>' + count + '</strong> action' + (count !== 1 ? 's' : '');
        contextNote = '🔍 Refining: ' + (filterDesc || 'applying filters');
      } else {
        summary = 'Filtered to ' + count + ' action' + (count !== 1 ? 's' : '');
        contextNote = filterDesc ? '🔍 Filters: ' + filterDesc : '';
      }
    } else if (s.intent === 'ADD') {
      var newCount = count - prevCount;
      summary = 'Added <strong>' + newCount + '</strong> new action' + (newCount !== 1 ? 's' : '') + ' to the queue.';
      contextNote = '✨ Queue expanded from ' + prevCount + ' to ' + count + ' actions';
    } else if (s.intent === 'EXECUTE') {
      // Show execution details if available
      var executionDetails = s.execution_details || [];
      var successCount = executionDetails.filter(function(e) { return e.success; }).length;
      summary = 'Executed <strong>' + successCount + '/' + execCount + '</strong> action' + (execCount !== 1 ? 's' : '') + ' successfully.';
      
      // List affected ingredients
      var ingredients = [];
      executionDetails.forEach(function(e) {
        if (e.ingredient && e.success) {
          ingredients.push(e.ingredient);
        }
      });
      if (ingredients.length > 0) {
        var uniqueIng = Array.from(new Set(ingredients));
        contextNote = '✅ Affected: <strong>' + uniqueIng.slice(0, 3).join(', ') + '</strong>' + (uniqueIng.length > 3 ? ' +' + (uniqueIng.length - 3) + ' more' : '');
      }
    } else if (s.intent === 'REMOVE') {
      summary = 'Rejected <strong>' + execCount + '</strong> action' + (execCount !== 1 ? 's' : '') + '.';
      contextNote = '❌ Removed from active queue';
    } else if (s.intent === 'MODIFY') {
      summary = 'Modified <strong>' + execCount + '</strong> action' + (execCount !== 1 ? 's' : '') + '.';
      contextNote = '📝 Status updated';
    }

    // Update state for next iteration
    copilotState.lastIntent = s.intent;
    copilotState.lastFilters = s.filters_applied || {};
    copilotState.lastActionCount = count;

    var html = '<div class="rounded-xl bg-white/[0.02] border border-white/[0.04] px-4 py-3">' +
      '<div class="flex items-center gap-2 flex-wrap mb-2">' +
        '<span class="inline-block text-[9px] mono uppercase tracking-widest px-2.5 py-1 rounded-full border ' + intentCls + '">' + escapeHtml(s.intent || '') + '</span>' +
        '<span class="text-[12px] text-white/60">' + summary + '</span>' +
      '</div>';

    // Show context note if present
    if (contextNote) {
      html += '<div class="text-[11px] text-white/40 mb-2">' + contextNote + '</div>';
    }

    // Show execution details table if executions happened
    if (s.execution_details && s.execution_details.length > 0 && (s.intent === 'EXECUTE' || s.intent === 'MODIFY' || s.intent === 'REMOVE')) {
      html += '<div class="mt-3 border-t border-white/5 pt-3">' +
        '<div class="text-[9px] mono text-white/30 uppercase tracking-widest mb-2">Execution Results:</div>' +
        '<div class="space-y-1">';
      
      s.execution_details.slice(0, 5).forEach(function(e) {
        var statusIcon = e.success ? '✅' : '❌';
        var statusColor = e.success ? 'text-emerald-400' : 'text-red-400';
        html += '<div class="flex items-center gap-2 text-[10px]">' +
          '<span class="' + statusColor + '">' + statusIcon + '</span>' +
          '<span class="mono text-white/40">' + escapeHtml(e.action_id || '') + '</span>' +
          '<span class="text-white/50">' + escapeHtml(e.ingredient || '') + '</span>' +
          '<span class="text-white/30">' + escapeHtml(e.operation || e.status || '') + '</span>' +
        '</div>';
      });
      
      if (s.execution_details.length > 5) {
        html += '<div class="text-[9px] text-white/20 mono">... and ' + (s.execution_details.length - 5) + ' more</div>';
      }
      html += '</div></div>';
    }

    // Show notes if present (truncated)
    if (s.notes) {
      var cleanNotes = s.notes.replace(/\\n/g, ' ').replace(/\\_/g, '_');
      if (cleanNotes.length > 200) cleanNotes = cleanNotes.substring(0, 200) + '…';
      html += '<div class="text-[11px] text-white/30 mt-2 border-t border-white/5 pt-2">' + escapeHtml(cleanNotes) + '</div>';
    }

    // Add suggested next actions
    var suggestions = [];
    if (s.intent === 'VIEW' || s.intent === 'RESET') {
      if (count > 0) {
        suggestions.push('🎯 Try: "execute high risk actions"');
        suggestions.push('🔍 Or: "show only kitchen tasks"');
      }
    } else if (s.intent === 'FILTER') {
      if (count > 0) {
        suggestions.push('⚡ Try: "execute those"');
        suggestions.push('🔍 Or: "only show high risk"');
      }
    } else if (s.intent === 'EXECUTE') {
      suggestions.push('✅ Check the Action Queue below for updated status');
    }
    
    if (suggestions.length > 0) {
      html += '<div class="mt-3 pt-2 border-t border-white/5 space-y-1">';
      suggestions.forEach(function(sug) {
        html += '<div class="text-[10px] text-amber-400/50">' + sug + '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  // ─── Apply copilot structured result to the REAL Action Queue table ───
  function applyCopilotToQueue(structured, data) {
    ensureAgentDOM();

    // For FILTER intent: set the dropdown filters to match
    if (structured.intent === 'FILTER' && structured.filters_applied) {
      var f = structured.filters_applied;
      // Map copilot filter keys to the dropdown values
      if (f.status && DOM.agentFilterStatus) {
        DOM.agentFilterStatus.value = f.status;
      }
      if (f.owner && DOM.agentFilterOwner) {
        DOM.agentFilterOwner.value = f.owner;
      }
      // For action_type filter, we don't have a dropdown — we'll filter manually
      if (f.action_type) {
        agentState._copilotTypeFilter = f.action_type;
      } else {
        agentState._copilotTypeFilter = null;
      }
      if (f.risk_level) {
        agentState._copilotRiskFilter = f.risk_level;
      } else {
        agentState._copilotRiskFilter = null;
      }
      if (f.ingredient) {
        agentState._copilotIngredientFilter = f.ingredient;
      } else {
        agentState._copilotIngredientFilter = null;
      }
    } else {
      // Clear copilot filters for non-FILTER intents
      agentState._copilotTypeFilter = null;
      agentState._copilotRiskFilter = null;
      agentState._copilotIngredientFilter = null;
      if (DOM.agentFilterStatus) DOM.agentFilterStatus.value = '';
      if (DOM.agentFilterOwner) DOM.agentFilterOwner.value = '';
    }

    // Always force a fresh fetch + render
    fetchAgentActions();

    // Scroll the queue section into view
    var queueSection = DOM.agentQueueBody ? DOM.agentQueueBody.closest('.collapsible-section') : null;
    if (queueSection) {
      if (queueSection.classList.contains('collapsed')) {
        queueSection.classList.remove('collapsed');
      }
      setTimeout(function() {
        queueSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 300);
    }
  }

  // ─── COPILOT: Send message ───
  function copilotSendMessage() {
    if (copilotState.isProcessing) return;
    var input = DOM.copilotInput;
    if (!input) return;
    var message = input.value.trim();
    if (!message) return;

    input.value = '';
    copilotState.isProcessing = true;
    if (DOM.btnCopilotSend) DOM.btnCopilotSend.disabled = true;

    copilotAddUserMessage(message);
    copilotAddThinkingIndicator();

    fetch('/agent/copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        session_id: copilotState.sessionId,
      }),
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error && !data.response) {
          copilotRemoveThinking();
          copilotAddAgentResponse({
            response: 'Error: ' + data.error,
            tool_calls: [],
            actions_created: [],
            turn_count: 0,
          });
          return;
        }

        // Update stats
        copilotState.totalToolCalls += (data.tool_calls || []).length;
        copilotState.totalActionsCreated += (data.actions_created || []).length;
        copilotState.totalTurns += (data.turn_count || 0);
        if (data.session_id) copilotState.sessionId = data.session_id;
        if (DOM.copilotSessionId) DOM.copilotSessionId.textContent = copilotState.sessionId;
        copilotUpdateStats();

        // Render response (wrapped in try-catch so errors don't block queue refresh)
        // NOTE: copilotAddAgentResponse → applyCopilotToQueue → fetchAgentActions
        try {
          copilotAddAgentResponse(data);
        } catch(renderErr) {
          console.error('Copilot render error:', renderErr);
          // Fallback: force refresh even if render failed
          fetchAgentActions();
        }

        // Always refresh audit log
        fetchAgentAudit();
      })
      .catch(function(err) {
        copilotRemoveThinking();
        copilotAddAgentResponse({
          response: 'Connection error: ' + err.message,
          tool_calls: [],
          actions_created: [],
          turn_count: 0,
        });
      })
      .finally(function() {
        copilotState.isProcessing = false;
        if (DOM.btnCopilotSend) DOM.btnCopilotSend.disabled = false;
        if (DOM.copilotInput) DOM.copilotInput.focus();
      });
  }

  // ─── STATUS BADGE ───
  function agentStatusBadge(status) {
    var map = {
      proposed: "bg-amber-500/15 text-amber-400 border-amber-500/20",
      approved: "bg-indigo-500/15 text-indigo-400 border-indigo-500/20",
      executed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
      rejected: "bg-red-500/15 text-red-400 border-red-500/20",
      rolled_back: "bg-gray-500/15 text-gray-400 border-gray-500/20",
    };
    var cls = map[status] || "bg-white/5 text-white/40 border-white/10";
    return (
      '<span class="inline-block text-[9px] mono uppercase tracking-widest px-2.5 py-1 rounded-full border ' +
      cls +
      '">' +
      (status || "—").replace("_", " ") +
      "</span>"
    );
  }

  function agentRiskBadge(level) {
    var map = {
      critical: "bg-red-500/15 text-red-400 border-red-500/20",
      high: "bg-orange-500/15 text-orange-400 border-orange-500/20",
      medium: "bg-amber-500/15 text-amber-400 border-amber-500/20",
      low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    };
    var cls = map[level] || "bg-white/5 text-white/40 border-white/10";
    return (
      '<span class="inline-block text-[9px] mono uppercase tracking-widest px-2.5 py-1 rounded-full border ' +
      cls +
      '">' +
      (level || "—") +
      "</span>"
    );
  }

  function agentTypeBadge(type) {
    var labels = {
      draft_po: "Draft PO",
      create_task: "Task",
      adjust_par: "Adjust PAR",
      update_delivery_eta: "ETA Update",
      transfer_stock: "Transfer",
      acknowledge_alert: "Acknowledge",
    };
    return (
      '<span class="text-[10px] mono text-white/70">' +
      (labels[type] || type || "—") +
      "</span>"
    );
  }

  // ─── ACTION BUTTONS PER-ROW ───
  function agentActionButtons(action) {
    var btns = [];
    var id = action.action_id;
    if (action.status === "proposed") {
      btns.push(
        "<button onclick=\"agentApprove('" +
        id +
        '\')" class="text-[9px] mono uppercase tracking-widest px-2.5 py-1 rounded-full border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-all">Approve</button>',
      );
      btns.push(
        "<button onclick=\"agentReject('" +
        id +
        '\')" class="text-[9px] mono uppercase tracking-widest px-2.5 py-1 rounded-full border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all">Reject</button>',
      );
    }
    if (action.status === "approved") {
      btns.push(
        "<button onclick=\"agentExecute('" +
        id +
        '\')" class="text-[9px] mono uppercase tracking-widest px-2.5 py-1 rounded-full border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 transition-all">Execute</button>',
      );
    }
    if (action.status === "executed") {
      btns.push(
        "<button onclick=\"agentRollback('" +
        id +
        '\')" class="text-[9px] mono uppercase tracking-widest px-2.5 py-1 rounded-full border border-gray-500/30 text-gray-400 hover:bg-gray-500/10 transition-all">Rollback</button>',
      );
    }
    // All rows get a Details button
    btns.push(
      "<button onclick=\"agentShowDiff('" +
      id +
      '\')" class="text-[9px] mono uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/10 text-white/40 hover:bg-white/5 transition-all">Details</button>',
    );
    return (
      '<div class="flex items-center gap-1.5 flex-wrap">' +
      btns.join("") +
      "</div>"
    );
  }

  // ─── RENDER ACTION QUEUE ───
  function renderAgentQueue() {
    ensureAgentDOM();
    console.log('[AgentQueue] renderAgentQueue called, agentState.actions.length =', agentState.actions.length, 'DOM.agentQueueBody =', !!DOM.agentQueueBody);
    var filtered = agentState.actions.slice();
    var fs = DOM.agentFilterStatus ? DOM.agentFilterStatus.value : "";
    var fo = DOM.agentFilterOwner ? DOM.agentFilterOwner.value : "";
    if (fs)
      filtered = filtered.filter(function (a) {
        return a.status === fs;
      });
    if (fo)
      filtered = filtered.filter(function (a) {
        return a.owner_role === fo;
      });
    // Apply copilot-driven filters (action_type, risk_level, ingredient)
    if (agentState._copilotTypeFilter) {
      var tf = agentState._copilotTypeFilter.toLowerCase();
      filtered = filtered.filter(function (a) {
        return (a.action_type || '').toLowerCase() === tf;
      });
    }
    if (agentState._copilotRiskFilter) {
      var rf = agentState._copilotRiskFilter.toLowerCase();
      filtered = filtered.filter(function (a) {
        return (a.risk_level || '').toLowerCase() === rf;
      });
    }
    if (agentState._copilotIngredientFilter) {
      var igf = agentState._copilotIngredientFilter.toLowerCase();
      filtered = filtered.filter(function (a) {
        var p = a.payload || a.params || {};
        var ing = (p.ingredient || p.item || '').toLowerCase();
        return ing.indexOf(igf) !== -1;
      });
    }
    if (agentState.sortKey) {
      var key = agentState.sortKey;
      var asc = agentState.sortAsc ? 1 : -1;
      filtered.sort(function (a, b) {
        var va = (a[key] || "").toString().toLowerCase();
        var vb = (b[key] || "").toString().toLowerCase();
        return va < vb ? -asc : va > vb ? asc : 0;
      });
    }
    // Stats
    if (DOM.agentStatTotal)
      DOM.agentStatTotal.textContent = agentState.actions.length;
    if (DOM.agentStatProposed)
      DOM.agentStatProposed.textContent = agentState.actions.filter(
        function (a) {
          return a.status === "proposed";
        },
      ).length;
    if (DOM.agentStatExecuted)
      DOM.agentStatExecuted.textContent = agentState.actions.filter(
        function (a) {
          return a.status === "executed";
        },
      ).length;
    if (DOM.agentStatAlerts)
      DOM.agentStatAlerts.textContent = new Set(
        agentState.actions.map(function (a) {
          return a.alert_id;
        }),
      ).size;

    // Re-lookup DOM in case it was null at init time
    if (!DOM.agentQueueBody) {
      DOM.agentQueueBody = document.getElementById("agent-queue-body");
    }
    if (!DOM.agentQueueBody) {
      console.error('[AgentQueue] agent-queue-body element not found!');
      return;
    }
    if (filtered.length === 0) {
      DOM.agentQueueBody.innerHTML =
        '<tr><td colspan="7" class="text-center text-white/20 py-8">No actions match the current filters.</td></tr>';
      return;
    }
    DOM.agentQueueBody.innerHTML = filtered
      .map(function (a) {
        var ingredient = "—";
        var p = a.payload || a.params || {};
        ingredient = p.ingredient || p.item || "—";
        return (
          '<tr class="agent-row hover:bg-white/[0.02] cursor-pointer transition-colors">' +
          "<td>" +
          agentTypeBadge(a.action_type) +
          "</td>" +
          '<td class="text-[10px] mono text-white/60">' +
          ingredient +
          "</td>" +
          "<td>" +
          agentRiskBadge(a.risk_level) +
          "</td>" +
          '<td class="text-[10px] mono text-white/50">' +
          (a.owner_role || "—") +
          "</td>" +
          "<td>" +
          agentStatusBadge(a.status) +
          "</td>" +
          '<td class="text-[10px] text-white/40 max-w-[200px] truncate" title="' +
          (a.reason || "").replace(/"/g, "&quot;") +
          '">' +
          (a.reason || "—") +
          "</td>" +
          "<td>" +
          agentActionButtons(a) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    // Brief flash effect on the queue table to signal update
    var queueTable = document.getElementById('agent-queue-table');
    if (queueTable) {
      queueTable.style.outline = '1px solid rgba(245, 158, 11, 0.3)';
      queueTable.style.outlineOffset = '2px';
      setTimeout(function() {
        queueTable.style.outline = 'none';
      }, 1500);
    }
  }

  // ─── FETCH ACTIONS ───
  function fetchAgentActions() {
    var prevCount = agentState.actions.length;
    fetch("/agent/actions")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        console.log('[AgentQueue] fetchAgentActions received', (data.actions || []).length, 'actions');
        agentState.actions = data.actions || [];
        renderAgentQueue();
        copilotUpdateStats();

        // Notify user if actions changed
        var newCount = agentState.actions.length;
        if (newCount > 0 && newCount !== prevCount) {
          showAgentToast('Action Queue updated: ' + newCount + ' action(s)', 'info');
        }

        // If we got actions, ensure the Action Queue section is visible (not collapsed)
        if (agentState.actions.length > 0) {
          var queueSection = DOM.agentQueueBody ? DOM.agentQueueBody.closest('.collapsible-section') : null;
          if (queueSection && queueSection.classList.contains('collapsed')) {
            queueSection.classList.remove('collapsed');
          }
        }
      })
      .catch(function (err) {
        console.error("Agent fetch error:", err);
      });
  }

  // ─── AUTO-EXECUTE ───
  function agentAutoExecute() {
    showAgentToast("Running auto-execute...", "info");
    fetch("/agent/auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var auto = (data.auto_executed || []).length;
        var held = (data.held_for_approval || []).length;
        showAgentToast(
          auto + " auto-executed, " + held + " held for approval",
          auto > 0 ? "success" : "info",
        );
        fetchAgentActions();
        fetchAgentAudit();
      })
      .catch(function (err) {
        showAgentToast("Auto-execute failed: " + err, "error");
      });
  }
  window.agentApprove = function (id) {
    fetch("/agent/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action_id: id }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.error) {
          showAgentToast(data.error, "error");
          return;
        }
        showAgentToast("Approved: " + id.slice(0, 8), "success");
        fetchAgentActions();
        fetchAgentAudit();
      })
      .catch(function (err) {
        showAgentToast("Approve failed: " + err, "error");
      });
  };

  window.agentReject = function (id) {
    fetch("/agent/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action_id: id,
        reason: "Operator rejected via dashboard",
      }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.error) {
          showAgentToast(data.error, "error");
          return;
        }
        showAgentToast("Rejected: " + id.slice(0, 8), "success");
        fetchAgentActions();
        fetchAgentAudit();
      })
      .catch(function (err) {
        showAgentToast("Reject failed: " + err, "error");
      });
  };

  window.agentExecute = function (id) {
    fetch("/agent/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action_id: id }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.error) {
          showAgentToast(data.error, "error");
          return;
        }
        showAgentToast("Executed: " + id.slice(0, 8), "success");
        fetchAgentActions();
        fetchAgentAudit();
      })
      .catch(function (err) {
        showAgentToast("Execute failed: " + err, "error");
      });
  };

  window.agentRollback = function (id) {
    fetch("/agent/rollback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action_id: id }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.error) {
          showAgentToast(data.error, "error");
          return;
        }
        showAgentToast("Rolled back: " + id.slice(0, 8), "success");
        fetchAgentActions();
        fetchAgentAudit();
      })
      .catch(function (err) {
        showAgentToast("Rollback failed: " + err, "error");
      });
  };

  // ─── AUTO-EXECUTE ───
  function agentAutoExecute() {
    showAgentToast("Running auto-execute...", "info");
    fetch("/agent/auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var auto = (data.auto_executed || []).length;
        var held = (data.held_for_approval || []).length;
        showAgentToast(
          auto + " auto-executed, " + held + " held for approval",
          auto > 0 ? "success" : "info",
        );
        fetchAgentActions();
        fetchAgentAudit();
      })
      .catch(function (err) {
        showAgentToast("Auto-execute failed: " + err, "error");
      });
  }

  // ─── DIFF VIEW ───
  window.agentShowDiff = function (id) {
    var action = agentState.actions.find(function (a) {
      return a.action_id === id;
    });
    if (!action || !DOM.agentDiffView || !DOM.agentDiffContent) return;
    DOM.agentDiffView.classList.remove("hidden");
    var html = "";
    html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
    // Left: Action Info
    html += '<div class="space-y-3">';
    html +=
      '<div class="text-[10px] mono text-white/30 uppercase tracking-widest mb-2">Action Info</div>';
    html += '<div class="space-y-2">';
    html +=
      '<div class="flex justify-between"><span class="text-[10px] text-white/40">ID</span><span class="text-[10px] mono text-white/60">' +
      (action.action_id || "—") +
      "</span></div>";
    html +=
      '<div class="flex justify-between"><span class="text-[10px] text-white/40">Type</span>' +
      agentTypeBadge(action.action_type) +
      "</div>";
    html +=
      '<div class="flex justify-between"><span class="text-[10px] text-white/40">Status</span>' +
      agentStatusBadge(action.status) +
      "</div>";
    html +=
      '<div class="flex justify-between"><span class="text-[10px] text-white/40">Risk</span>' +
      agentRiskBadge(action.risk_level) +
      "</div>";
    html +=
      '<div class="flex justify-between"><span class="text-[10px] text-white/40">Owner</span><span class="text-[10px] mono text-white/60">' +
      (action.owner_role || "—") +
      "</span></div>";
    html +=
      '<div class="flex justify-between"><span class="text-[10px] text-white/40">Alert</span><span class="text-[10px] mono text-white/60">' +
      (action.alert_id || "—") +
      "</span></div>";
    html += "</div>";
    html +=
      '<div class="mt-3"><span class="text-[10px] text-white/40">Reason</span><p class="text-[11px] text-white/70 mt-1">' +
      (action.reason || "—") +
      "</p></div>";
    html += "</div>";
    // Right: Params (before/after style)
    html += '<div class="space-y-3">';
    html +=
      '<div class="text-[10px] mono text-white/30 uppercase tracking-widest mb-2">Parameters / Diff</div>';
    var actionPayload = action.payload || action.params || {};
    if (actionPayload && Object.keys(actionPayload).length > 0) {
      html +=
        '<div class="bg-white/[0.03] rounded-xl p-4 space-y-1.5 border border-white/5">';
      Object.keys(actionPayload).forEach(function (key) {
        var val = actionPayload[key];
        if (typeof val === "object") val = JSON.stringify(val);
        html +=
          '<div class="flex justify-between"><span class="text-[10px] text-emerald-400/70 mono">+ ' +
          key +
          '</span><span class="text-[10px] mono text-emerald-400/90">' +
          val +
          "</span></div>";
      });
      html += "</div>";
    } else {
      html += '<p class="text-[10px] mono text-white/20">No parameters.</p>';
    }
    if (action.execution_result) {
      html +=
        '<div class="mt-3"><span class="text-[10px] text-white/40 block mb-1">Execution Result</span>';
      html +=
        '<div class="bg-white/[0.03] rounded-xl p-4 border border-white/5 text-[10px] mono text-white/60">' +
        JSON.stringify(action.execution_result, null, 2)
          .replace(/\n/g, "<br>")
          .replace(/ /g, "&nbsp;") +
        "</div>";
      html += "</div>";
    }
    html += "</div>";
    html += "</div>";
    DOM.agentDiffContent.innerHTML = html;
    DOM.agentDiffView.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  // ─── AUDIT LOG ───
  function fetchAgentAudit() {
    fetch("/agent/history")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var entries = data.audit_log || [];
        if (!DOM.agentAuditLog) return;
        // Only show approve/reject actions, not proposed
        entries = entries.filter(function (e) {
          return e.event === "approved" || e.event === "rejected";
        });
        if (entries.length === 0) {
          DOM.agentAuditLog.innerHTML =
            '<p class="text-[10px] mono text-white/20 text-center py-4">No audit entries yet.</p>';
          return;
        }
        var latest = entries.slice(0, 50);
        DOM.agentAuditLog.innerHTML = latest
          .map(function (e) {
            var eventColor = {
              proposed: "text-amber-400",
              approved: "text-indigo-400",
              executed: "text-emerald-400",
              rejected: "text-red-400",
              rolled_back: "text-gray-400",
              executing: "text-cyan-400",
              error: "text-red-500",
            };
            var eventBg = {
              proposed: "bg-amber-400/10 border-amber-400/20",
              approved: "bg-indigo-400/10 border-indigo-400/20",
              executed: "bg-emerald-400/10 border-emerald-400/20",
              rejected: "bg-red-400/10 border-red-400/20",
              rolled_back: "bg-gray-400/10 border-gray-400/20",
              executing: "bg-cyan-400/10 border-cyan-400/20",
              error: "bg-red-500/10 border-red-500/20",
            };
            var color = eventColor[e.event] || "text-white/40";
            var badge = eventBg[e.event] || "bg-white/5 border-white/10";
            var ts = e.timestamp
              ? new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : "";
            var dateStr = e.timestamp
              ? new Date(e.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })
              : "";
            var detail = e.notes || "";
            var snap = e.action_snapshot || {};
            var actionType = snap.action_type ? snap.action_type.replace(/_/g, " ") : "";
            var ingredient = "";
            if (snap.payload) {
              var p = snap.payload;
              ingredient = p.item || p.ingredient || "";
            }
            if (!detail && ingredient) detail = ingredient;
            else if (!detail && actionType) detail = actionType;
            return (
              '<div class="rounded-xl bg-white/[0.02] border border-white/[0.04] px-4 py-3 hover:bg-white/[0.04] transition-colors">' +
              '<div class="flex items-center gap-3">' +
              '<span class="inline-flex text-[9px] mono uppercase tracking-widest font-semibold px-2.5 py-0.5 rounded-full border ' + badge + ' ' + color + '">' +
              (e.event || "").replace(/_/g, " ") +
              '</span>' +
              (actionType ? '<span class="text-[9px] mono text-white/25 uppercase tracking-wider">' + actionType + '</span>' : '') +
              '<span class="ml-auto text-[9px] mono text-white/20 shrink-0">' + dateStr + ' ' + ts + '</span>' +
              '</div>' +
              (ingredient || e.action_id ?
                '<div class="flex items-baseline gap-2 mt-1.5">' +
                (e.action_id ? '<span class="text-[9px] mono text-white/15">' + e.action_id.slice(0, 8) + '</span>' : '') +
                (ingredient ? '<span class="text-[11px] text-white/70 font-medium">' + ingredient + '</span>' : '') +
                '</div>' : '') +
              (detail && detail !== ingredient ? '<p class="text-[10px] text-white/40 mt-1 leading-relaxed">' + detail + '</p>' : '') +
              '</div>'
            );
          })
          .join("");
      })
      .catch(function (err) {
        console.error("Audit log error:", err);
      });
  }

  // ─── TOAST NOTIFICATIONS ───
  function showAgentToast(message, type) {
    var existing = document.getElementById("agent-toast");
    if (existing) existing.remove();
    var colorMap = {
      info: "border-indigo-500/40 bg-indigo-500/10",
      success: "border-emerald-500/40 bg-emerald-500/10",
      error: "border-red-500/40 bg-red-500/10",
    };
    var cls = colorMap[type] || colorMap.info;
    var toast = document.createElement("div");
    toast.id = "agent-toast";
    toast.className =
      "fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl border backdrop-blur-xl text-sm text-white/80 shadow-2xl transition-all " +
      cls;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = "0";
      setTimeout(function () {
        toast.remove();
      }, 300);
    }, 3500);
  }

  // ─── COPILOT EVENT WIRING ───

  // Send button
  if (DOM.btnCopilotSend)
    DOM.btnCopilotSend.addEventListener("click", copilotSendMessage);

  // Enter key in input
  if (DOM.copilotInput) {
    DOM.copilotInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        copilotSendMessage();
      }
    });
  }

  // Reset / new session
  if (DOM.btnCopilotReset)
    DOM.btnCopilotReset.addEventListener("click", copilotNewSession);

  // Quick prompt buttons
  document.querySelectorAll(".copilot-quick-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var prompt = btn.getAttribute("data-prompt");
      if (prompt && DOM.copilotInput) {
        DOM.copilotInput.value = prompt;
        copilotSendMessage();
      }
    });
  });

  // ─── TABLE SORT ───
  document
    .querySelectorAll("#agent-queue-table th[data-sort]")
    .forEach(function (th) {
      th.addEventListener("click", function () {
        var key = th.getAttribute("data-sort");
        if (agentState.sortKey === key) {
          agentState.sortAsc = !agentState.sortAsc;
        } else {
          agentState.sortKey = key;
          agentState.sortAsc = true;
        }
        renderAgentQueue();
      });
    });

  // ─── REMAINING EVENT WIRING ───
  if (DOM.btnAgentAuto)
    DOM.btnAgentAuto.addEventListener("click", agentAutoExecute);
  if (DOM.agentFilterStatus)
    DOM.agentFilterStatus.addEventListener("change", function() {
      agentState._copilotTypeFilter = null;
      agentState._copilotRiskFilter = null;
      agentState._copilotIngredientFilter = null;
      renderAgentQueue();
    });
  if (DOM.agentFilterOwner)
    DOM.agentFilterOwner.addEventListener("change", function() {
      agentState._copilotTypeFilter = null;
      agentState._copilotRiskFilter = null;
      agentState._copilotIngredientFilter = null;
      renderAgentQueue();
    });
  if (DOM.btnCloseDiff) {
    DOM.btnCloseDiff.addEventListener("click", function () {
      if (DOM.agentDiffView) DOM.agentDiffView.classList.add("hidden");
    });
  }

  // ─── FORECASTS (live Supabase data) ───

  function fetchForecasts(location) {
    var loc = location || 'all';
    var url = '/api/forecasts?location=' + encodeURIComponent(loc);
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.forecastData = data;
        renderDemandForecast(data.demand_forecast || [], data.demand_stats || {});
        renderStockoutRisk(data.stockout_risk || [], data.risk_stats || {});
      })
      .catch(function (err) {
        console.error('[Forecasts] fetch error:', err);
      });
  }

  function demandBadgeClass(level) {
    if (level === 'High') return 'status-critical';
    if (level === 'Med') return 'status-low';
    return 'status-ok';
  }

  function renderDemandForecast(rows, stats) {
    var tbody = document.getElementById('demand-forecast-tbody');
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-white/30 py-6">No demand data available.</td></tr>';
    } else {
      tbody.innerHTML = rows.map(function (r) {
        return '<tr>' +
          '<td>' + escapeHtml(r.item) + '</td>' +
          '<td>' + escapeHtml(r.location) + '</td>' +
          '<td class="' + demandBadgeClass(r.day_1_3) + '">' + r.day_1_3 + '</td>' +
          '<td class="' + demandBadgeClass(r.day_4_5) + '">' + r.day_4_5 + '</td>' +
          '<td class="' + demandBadgeClass(r.day_6_7) + '">' + r.day_6_7 + '</td>' +
          '</tr>';
      }).join('');
    }
    // Stats cards
    var el;
    el = document.getElementById('fc-stat-horizon');  if (el) el.textContent = stats.horizon || '7 days';
    el = document.getElementById('fc-stat-updated');   if (el) el.textContent = stats.updated || '—';
    el = document.getElementById('fc-stat-model');     if (el) el.textContent = stats.model || 'SpellStock AI';
    el = document.getElementById('fc-stat-confidence');if (el) el.textContent = stats.confidence || '—';
  }

  function riskLevelClass(level) {
    if (level === 'Critical') return 'status-critical';
    if (level === 'High') return 'status-low';
    if (level === 'Moderate') return 'status-low';
    return 'status-ok';
  }

  function renderStockoutRisk(rows, stats) {
    var tbody = document.getElementById('stockout-risk-tbody');
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-white/30 py-6">No risk data available.</td></tr>';
    } else {
      tbody.innerHTML = rows.map(function (r) {
        return '<tr>' +
          '<td>' + escapeHtml(r.item) + '</td>' +
          '<td>' + escapeHtml(r.location) + '</td>' +
          '<td class="num">' + r.risk_pct + '</td>' +
          '<td class="' + riskLevelClass(r.level) + '">' + r.level + '</td>' +
          '<td class="text-white/60 text-xs">' + escapeHtml(r.action) + '</td>' +
          '</tr>';
      }).join('');
    }
    // Stats cards
    var el;
    el = document.getElementById('sr-stat-critical'); if (el) el.textContent = stats.critical_items != null ? stats.critical_items : '—';
    el = document.getElementById('sr-stat-high');     if (el) el.textContent = stats.high_risk != null ? stats.high_risk : '—';
    el = document.getElementById('sr-stat-horizon');  if (el) el.textContent = stats.horizon || '72 h';
    el = document.getElementById('sr-stat-lastrun');  if (el) el.textContent = stats.last_run || '—';
  }

  // Wire location dropdown to re-fetch forecasts
  var fcLocSelect = document.getElementById('forecasts-location-select');
  if (fcLocSelect) {
    fcLocSelect.addEventListener('change', function () {
      fetchForecasts(this.value);
    });
  }

  // Load agent + copilot data when view switches to agent
  var origSetView = setView;
  setView = function (viewName) {
    origSetView(viewName);
    if (viewName === "agent") {
      fetchAgentActions();
      fetchAgentAudit();
      copilotUpdateStats();
    }
    if (viewName === "forecasts") {
      var loc = fcLocSelect ? fcLocSelect.value : 'all';
      fetchForecasts(loc);
    }
  };

  // ─── CHART INFO TOOLTIPS (Gemini-powered) ───

  var _chartExplainCache = {};  // cache by chart_id to avoid repeat calls
  var _chartExplainInFlight = {};  // prevent duplicate requests

  function getChartDataForId(chartId) {
    // Extract the current data from the rendered charts to send to Gemini
    switch (chartId) {
      case "dash-stock-ingredient":
        if (state.dashCharts.stockIngredient) {
          var c = state.dashCharts.stockIngredient;
          return {
            chart_type: "Stock by Ingredient (Dashboard)",
            labels: c.data.labels,
            current_stock: c.data.datasets[0] ? c.data.datasets[0].data : [],
            par_level: c.data.datasets[1] ? c.data.datasets[1].data : [],
          };
        }
        return { chart_type: "Stock by Ingredient", note: "No data loaded yet" };

      case "dash-location-compare":
        if (state.dashCharts.locationCompare) {
          var c = state.dashCharts.locationCompare;
          return {
            chart_type: "Location Comparison (Dashboard)",
            locations: c.data.labels,
            total_stock: c.data.datasets[0] ? c.data.datasets[0].data : [],
            avg_risk_pct: c.data.datasets[1] ? c.data.datasets[1].data : [],
          };
        }
        return { chart_type: "Location Comparison", note: "No data loaded yet" };

      case "hub-location-comparison":
        if (state.hubCharts.comparisonBar) {
          var c = state.hubCharts.comparisonBar;
          var ds = {};
          c.data.datasets.forEach(function (d) { ds[d.label] = d.data; });
          return {
            chart_type: "Location-by-Location Comparison (scored 0-10)",
            categories: c.data.labels,
            datasets: ds,
          };
        }
        return { chart_type: "Location Comparison", note: "No data loaded yet" };

      case "hub-risk-distribution":
        if (state.hubCharts.riskPie) {
          var c = state.hubCharts.riskPie;
          return {
            chart_type: "Risk Distribution (Pie)",
            labels: c.data.labels,
            counts: c.data.datasets[0] ? c.data.datasets[0].data : [],
          };
        }
        return { chart_type: "Risk Distribution", note: "No data loaded yet" };

      case "hub-stock-ingredient":
        if (state.hubCharts.stockBar) {
          var c = state.hubCharts.stockBar;
          return {
            chart_type: "Stock by Ingredient (Hub, selected location)",
            ingredients: c.data.labels,
            stock_values: c.data.datasets[0] ? c.data.datasets[0].data : [],
          };
        }
        return { chart_type: "Stock by Ingredient", note: "No data loaded yet" };

      case "hub-stock-by-location":
        if (state.hubCharts.locationsBar) {
          var c = state.hubCharts.locationsBar;
          return {
            chart_type: "Total Stock by Location",
            locations: c.data.labels,
            totals: c.data.datasets[0] ? c.data.datasets[0].data : [],
          };
        }
        return { chart_type: "Stock by Location", note: "No data loaded yet" };

      case "hub-usage-trends":
        if (state.hubStats && state.hubStats.usage_trends) {
          return {
            chart_type: "Usage Trends (week-over-week change %)",
            trends: state.hubStats.usage_trends.slice(0, 10).map(function (t) {
              return { ingredient: t.ingredient, change_pct: t.change_pct, trend: t.trend, avg_last_7: t.avg_last_7 };
            }),
          };
        }
        return { chart_type: "Usage Trends", note: "No data loaded yet" };

      case "hub-waste-analysis":
        if (state.hubStats && state.hubStats.waste_analysis) {
          return {
            chart_type: "Waste Analysis (waste rate % by ingredient)",
            items: state.hubStats.waste_analysis.slice(0, 10).map(function (w) {
              return { ingredient: w.ingredient, waste_rate: w.waste_rate, total_waste: w.total_waste };
            }),
          };
        }
        return { chart_type: "Waste Analysis", note: "No data loaded yet" };

      case "hub-daily-timeline":
        if (state.hubStats && state.hubStats.daily_usage_timeline) {
          return {
            chart_type: "Daily Usage & Waste Timeline (last 14 days)",
            timeline: state.hubStats.daily_usage_timeline,
          };
        }
        return { chart_type: "Daily Timeline", note: "No data loaded yet" };

      // ── Forecasts ──
      case "fc-demand-forecast":
        if (state.forecastData && state.forecastData.demand_forecast) {
          return {
            chart_type: "Demand Forecast (AI-predicted demand levels for next 7 days)",
            items: state.forecastData.demand_forecast.slice(0, 12).map(function (d) {
              return { item: d.item, location: d.location, day_1_3: d.day_1_3, day_4_5: d.day_4_5, day_6_7: d.day_6_7, avg_daily: d.avg_daily };
            }),
            stats: state.forecastData.demand_stats,
          };
        }
        return { chart_type: "Demand Forecast", note: "No data loaded yet" };

      case "fc-stockout-risk":
        if (state.forecastData && state.forecastData.stockout_risk) {
          return {
            chart_type: "Stockout Risk (predicted risk of stockout by item and location)",
            items: state.forecastData.stockout_risk.slice(0, 12).map(function (d) {
              return { item: d.item, location: d.location, risk_pct: d.risk_pct, level: d.level, action: d.action, days_of_supply: d.days_of_supply };
            }),
            stats: state.forecastData.risk_stats,
          };
        }
        return { chart_type: "Stockout Risk", note: "No data loaded yet" };

      // ── Reports ──
      case "rpt-low-stock":
        if (state.reportsData && state.reportsData.low_stock) {
          return {
            chart_type: "Low Stock Report (items below par level by location)",
            items: state.reportsData.low_stock.slice(0, 12),
          };
        }
        return { chart_type: "Low Stock Report", note: "No data loaded yet" };

      case "rpt-usage":
        if (state.reportsData && state.reportsData.usage) {
          return {
            chart_type: "Usage Report (actual consumption vs AI-predicted usage)",
            items: state.reportsData.usage.slice(0, 12),
          };
        }
        return { chart_type: "Usage Report", note: "No data loaded yet" };

      case "rpt-variance":
        if (state.reportsData && state.reportsData.variance) {
          return {
            chart_type: "Variance Report (actual vs expected stock levels from cycle count)",
            items: state.reportsData.variance.slice(0, 12),
          };
        }
        return { chart_type: "Variance Report", note: "No data loaded yet" };

      // ── Alerts ──
      case "alerts-summary":
        if (state.alertsData) {
          return {
            chart_type: "AI Risk Alerts Summary (inventory scan results)",
            total_alerts: state.alertsData.length,
            alerts: state.alertsData.slice(0, 8).map(function (a) {
              var ev = a.risk_event || {};
              return {
                ingredient: ev.item_id || 'unknown',
                event_type: ev.event_type || 'unknown',
                severity: a.severity || ev.severity || 'unknown',
                suggested_actions: (a.suggested_actions || []).slice(0, 2),
              };
            }),
          };
        }
        return { chart_type: "Alerts Summary", note: "No alerts data — run an inventory scan first" };

      default:
        return { chart_type: chartId, note: "Unknown chart" };
    }
  }

  function fetchChartExplanation(chartId, tooltipEl) {
    // Show loading state
    tooltipEl.innerHTML =
      '<div class="tooltip-loading">' +
      '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" opacity="0.25"/><path d="M4 12a8 8 0 018-8" stroke-linecap="round"/></svg>' +
      '<span>Asking Gemini...</span></div>';
    tooltipEl.classList.remove("hidden");

    // Check cache first
    if (_chartExplainCache[chartId]) {
      tooltipEl.textContent = _chartExplainCache[chartId];
      return;
    }

    // Prevent duplicate in-flight requests
    if (_chartExplainInFlight[chartId]) return;
    _chartExplainInFlight[chartId] = true;

    var chartData = getChartDataForId(chartId);

    fetch("/api/explain-chart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chart_id: chartId, chart_data: chartData }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var explanation = data.explanation || "No explanation available.";
        _chartExplainCache[chartId] = explanation;
        tooltipEl.textContent = explanation;
      })
      .catch(function (err) {
        tooltipEl.textContent = "Failed to load explanation.";
        console.error("Chart explain error:", err);
      })
      .finally(function () {
        delete _chartExplainInFlight[chartId];
      });
  }

  // Invalidate cache when data refreshes
  var _origFetchDashboardCharts = fetchDashboardCharts;
  fetchDashboardCharts = function () {
    delete _chartExplainCache["dash-stock-ingredient"];
    delete _chartExplainCache["dash-location-compare"];
    return _origFetchDashboardCharts();
  };

  var _origFetchHubStats = fetchHubStats;
  fetchHubStats = function () {
    delete _chartExplainCache["hub-usage-trends"];
    delete _chartExplainCache["hub-waste-analysis"];
    delete _chartExplainCache["hub-daily-timeline"];
    return _origFetchHubStats();
  };

  var _origRenderInventoryHub = renderInventoryHub;
  renderInventoryHub = function () {
    delete _chartExplainCache["hub-location-comparison"];
    delete _chartExplainCache["hub-risk-distribution"];
    delete _chartExplainCache["hub-stock-ingredient"];
    delete _chartExplainCache["hub-stock-by-location"];
    _origRenderInventoryHub();
  };

  var _origFetchForecasts = fetchForecasts;
  fetchForecasts = function (loc) {
    delete _chartExplainCache["fc-demand-forecast"];
    delete _chartExplainCache["fc-stockout-risk"];
    return _origFetchForecasts(loc);
  };

  var _origFetchReports = fetchReports;
  fetchReports = function (loc) {
    delete _chartExplainCache["rpt-low-stock"];
    delete _chartExplainCache["rpt-usage"];
    delete _chartExplainCache["rpt-variance"];
    return _origFetchReports(loc);
  };

  // Wire up all info buttons
  document.querySelectorAll("[data-chart-id]").forEach(function (panel) {
    var chartId = panel.getAttribute("data-chart-id");
    var btn = panel.querySelector(".chart-info-btn");
    var tooltip = panel.querySelector(".chart-info-tooltip");
    if (!btn || !tooltip) return;

    var hideTimeout;

    btn.addEventListener("mouseenter", function () {
      clearTimeout(hideTimeout);
      fetchChartExplanation(chartId, tooltip);
    });

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (tooltip.classList.contains("hidden")) {
        fetchChartExplanation(chartId, tooltip);
      } else {
        tooltip.classList.add("hidden");
      }
    });

    // Keep tooltip visible when hovering over it
    tooltip.addEventListener("mouseenter", function () {
      clearTimeout(hideTimeout);
    });

    // Hide when mouse leaves both button and tooltip
    btn.addEventListener("mouseleave", function () {
      hideTimeout = setTimeout(function () { tooltip.classList.add("hidden"); }, 400);
    });
    tooltip.addEventListener("mouseleave", function () {
      hideTimeout = setTimeout(function () { tooltip.classList.add("hidden"); }, 400);
    });

    // Close on outside click
    document.addEventListener("click", function (e) {
      if (!panel.contains(e.target)) {
        tooltip.classList.add("hidden");
      }
    });
  });

})();
