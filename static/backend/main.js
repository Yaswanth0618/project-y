/**
 * SpellStock AI — Flask frontend. Login, dashboard, scenario simulation via /api/simulate.
 */
(function () {
  "use strict";

  var DOM = {
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
    btnAgentPlan: document.getElementById("btn-agent-plan"),
    btnAgentCommand: document.getElementById("btn-agent-command"),
    agentCommandInput: document.getElementById("agent-command-input"),
    agentQueueBody: document.getElementById("agent-queue-body"),
    agentFilterStatus: document.getElementById("agent-filter-status"),
    agentFilterOwner: document.getElementById("agent-filter-owner"),
    btnAgentAuto: document.getElementById("btn-agent-auto"),
    agentDiffView: document.getElementById("agent-diff-view"),
    agentDiffContent: document.getElementById("agent-diff-content"),
    btnCloseDiff: document.getElementById("btn-close-diff"),
    agentAuditLog: document.getElementById("agent-audit-log"),
    autopilotToggle: document.getElementById("autopilot-toggle"),
    agentStatTotal: document.getElementById("agent-stat-total"),
    agentStatProposed: document.getElementById("agent-stat-proposed"),
    agentStatExecuted: document.getElementById("agent-stat-executed"),
    agentStatAlerts: document.getElementById("agent-stat-alerts"),
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
    },
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
      view: "chat",
      label: "Manager Chat",
      icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>',
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
      label: "Agent Autopilot",
      icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>',
    },
  ];

  var QUICK_ACTIONS = [
    {
      label: "Bioluminescent Peak",
      prompt: "Massive influx expected for the neon festival weekend.",
    },
    {
      label: "Obsidian Stall",
      prompt: "Supply lines frozen for 48 hours due to logistics blackout.",
    },
    {
      label: "Kinetic Surge",
      prompt: "Sudden viral recommendation leading to 2x demand today.",
    },
    {
      label: "Stagnant Reservoir",
      prompt: "Quiet mid-week lull, demand at 60%.",
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
    if (DOM.alertsPanel) {
      DOM.alertsPanel.classList.toggle(
        "hidden",
        state.currentView !== "alerts",
      );
    }
    if (DOM.agentPanel) {
      DOM.agentPanel.classList.toggle("hidden", state.currentView !== "agent");
    }
    if (DOM.chatPanel) {
      DOM.chatPanel.classList.toggle("hidden", state.currentView !== "chat");
    }
    renderSidebar();
    if (state.currentView === "inventory-hub") {
      fetchRestaurantData().then(function () {
        renderInventoryHub();
      });
    }
  }

  function renderSidebar() {
    if (!DOM.sidebarNav) return;
    DOM.sidebarNav.innerHTML = SIDEBAR_ITEMS.map(function (item) {
      var active = state.currentView === item.view;
      return (
        '<div class="sidebar-item flex items-center gap-4 px-4 py-3 cursor-pointer transition-all duration-300 rounded-xl group ' +
        (active
          ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
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
      '<span class="text-[10px] mono text-indigo-400 font-bold">READY</span></div>' +
      '<div class="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">' +
      '<div class="h-full bg-indigo-500 transition-all duration-1000" style="width: ' +
      pct +
      '%"></div></div></div>';
    if (DOM.dashboardStats) {
      DOM.dashboardStats.classList.remove("hidden");
      DOM.dashboardStats.innerHTML =
        '<div class="text-right"><div class="text-[9px] mono text-white/20 uppercase tracking-widest">Volatility Index</div>' +
        '<div class="text-lg font-bold text-indigo-400 tracking-tighter">Normal</div></div>' +
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
    if (state.restaurantData) return Promise.resolve();
    return fetch("/api/inventory/restaurants")
      .then(function (res) {
        return res.ok
          ? res.json()
          : Promise.reject(new Error("Failed to load"));
      })
      .then(function (data) {
        state.restaurantData = data.restaurants || [];
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

    if (typeof Chart === "undefined") return;

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
            return i.name;
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

  function showDashboard() {
    state.isLoggedIn = true;
    if (DOM.loginView) DOM.loginView.classList.add("hidden");
    if (DOM.dashboardView) DOM.dashboardView.classList.remove("hidden");
    renderSidebar();
    renderQuickActions();
    handleRunSimulation("Baseline initialization");
  }

  function showLogin() {
    state.isLoggedIn = false;
    if (DOM.loginView) DOM.loginView.classList.remove("hidden");
    if (DOM.dashboardView) DOM.dashboardView.classList.add("hidden");
  }


  // ═══════════  CHAT PANEL  ════════════════════════════════════════════════

  function appendChatMessage(role, text) {
    if (!DOM.chatMessages) return;
    var isUser = role === "user";
    var avatar = isUser
      ? '<div class="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 text-[10px] font-bold text-emerald-400">JD</div>'
      : '<div class="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0"><svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-1.405 2.81A2.25 2.25 0 0115.604 19H8.396a2.25 2.25 0 01-1.991-1.69L5 14.5m14 0H5"/></svg></div>';
    var bubbleClass = isUser
      ? "bg-indigo-500/10 border border-indigo-500/20 rounded-2xl rounded-tr-sm"
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
      '<div class="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0"><svg class="w-4 h-4 text-indigo-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-1.405 2.81A2.25 2.25 0 0115.604 19H8.396a2.25 2.25 0 01-1.991-1.69L5 14.5m14 0H5"/></svg></div>' +
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
  //   AGENT AUTOPILOT — Dashboard Logic
  // ═════════════════════════════════════════════════════════════════════

  var agentState = {
    actions: [],
    autopilotMode: "off", // off | guarded | full
    sortKey: null,
    sortAsc: true,
  };

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

    if (!DOM.agentQueueBody) return;
    if (filtered.length === 0) {
      DOM.agentQueueBody.innerHTML =
        '<tr><td colspan="7" class="text-center text-white/20 py-8">No actions match the current filters.</td></tr>';
      return;
    }
    DOM.agentQueueBody.innerHTML = filtered
      .map(function (a) {
        var ingredient = "—";
        if (a.params) ingredient = a.params.ingredient || a.params.item || "—";
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
  }

  // ─── FETCH ACTIONS ───
  function fetchAgentActions() {
    fetch("/agent/actions")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        agentState.actions = data.actions || [];
        renderAgentQueue();
      })
      .catch(function (err) {
        console.error("Agent fetch error:", err);
      });
  }

  // ─── GENERATE PLAN ───
  function agentGeneratePlan() {
    showAgentToast("Generating plan...", "info");
    DOM.btnAgentPlan && (DOM.btnAgentPlan.disabled = true);
    fetch("/agent/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.error) {
          showAgentToast(data.error, "error");
          return;
        }
        showAgentToast(
          (data.actions || []).length + " actions proposed",
          "success",
        );
        // If autopilot mode is guarded or full, auto-execute
        if (agentState.autopilotMode !== "off") {
          agentAutoExecute();
        } else {
          fetchAgentActions();
        }
      })
      .catch(function (err) {
        showAgentToast("Plan failed: " + err, "error");
      })
      .finally(function () {
        DOM.btnAgentPlan && (DOM.btnAgentPlan.disabled = false);
      });
  }

  // ─── COMMAND ───
  function agentSendCommand() {
    var cmd = DOM.agentCommandInput ? DOM.agentCommandInput.value.trim() : "";
    if (!cmd) return;
    showAgentToast("Processing command...", "info");
    fetch("/agent/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: cmd }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.error) {
          showAgentToast(data.error, "error");
          return;
        }
        showAgentToast(
          (data.actions || []).length + " actions from command",
          "success",
        );
        if (DOM.agentCommandInput) DOM.agentCommandInput.value = "";
        if (agentState.autopilotMode === "full") {
          agentAutoExecute();
        } else {
          fetchAgentActions();
        }
      })
      .catch(function (err) {
        showAgentToast("Command failed: " + err, "error");
      });
  }

  // ─── LIFECYCLE ACTIONS (global for onclick) ───
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
    if (action.params && Object.keys(action.params).length > 0) {
      html +=
        '<div class="bg-white/[0.03] rounded-xl p-4 space-y-1.5 border border-white/5">';
      Object.keys(action.params).forEach(function (key) {
        var val = action.params[key];
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
            var color = eventColor[e.event] || "text-white/40";
            var ts = e.timestamp
              ? new Date(e.timestamp).toLocaleTimeString()
              : "";
            var detail = e.notes || "";
            var snap = e.action_snapshot || {};
            if (!detail && snap.payload) {
              var p = snap.payload;
              detail = (
                p.item ||
                p.ingredient ||
                snap.action_type ||
                ""
              ).replace(/_/g, " ");
            }
            return (
              '<div class="flex items-start gap-3 py-2 border-b border-white/[0.03] last:border-0">' +
              '<span class="text-[9px] mono text-white/20 shrink-0 w-16 mt-0.5">' +
              ts +
              "</span>" +
              '<span class="text-[9px] mono uppercase tracking-widest ' +
              color +
              ' shrink-0 w-28">' +
              (e.event || "").replace(/_/g, " ") +
              "</span>" +
              '<span class="text-[10px] text-white/50 flex-1">' +
              (e.action_id ? e.action_id.slice(0, 8) + "..." : "") +
              (detail ? " — " + detail : "") +
              "</span>" +
              "</div>"
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

  // ─── AUTOPILOT TOGGLE ───
  if (DOM.autopilotToggle) {
    DOM.autopilotToggle
      .querySelectorAll(".autopilot-mode-btn")
      .forEach(function (btn) {
        btn.addEventListener("click", function () {
          DOM.autopilotToggle
            .querySelectorAll(".autopilot-mode-btn")
            .forEach(function (b) {
              b.classList.remove("active");
            });
          btn.classList.add("active");
          agentState.autopilotMode = btn.getAttribute("data-mode");
          showAgentToast(
            "Autopilot: " + agentState.autopilotMode.toUpperCase(),
            "info",
          );
        });
      });
  }

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

  // ─── EVENT WIRING ───
  if (DOM.btnAgentPlan)
    DOM.btnAgentPlan.addEventListener("click", agentGeneratePlan);
  if (DOM.btnAgentCommand)
    DOM.btnAgentCommand.addEventListener("click", agentSendCommand);
  if (DOM.agentCommandInput) {
    DOM.agentCommandInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        agentSendCommand();
      }
    });
  }
  if (DOM.btnAgentAuto)
    DOM.btnAgentAuto.addEventListener("click", agentAutoExecute);
  if (DOM.agentFilterStatus)
    DOM.agentFilterStatus.addEventListener("change", renderAgentQueue);
  if (DOM.agentFilterOwner)
    DOM.agentFilterOwner.addEventListener("change", renderAgentQueue);
  if (DOM.btnCloseDiff) {
    DOM.btnCloseDiff.addEventListener("click", function () {
      if (DOM.agentDiffView) DOM.agentDiffView.classList.add("hidden");
    });
  }

  // Load agent data when view switches to agent
  var origSetView = setView;
  setView = function (viewName) {
    origSetView(viewName);
    if (viewName === "agent") {
      fetchAgentActions();
      fetchAgentAudit();
    }
  };
})();
