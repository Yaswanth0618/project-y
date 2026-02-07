/**
 * SpellStock AI — Flask frontend. Login, dashboard, scenario simulation via /api/simulate.
 */
(function () {
  'use strict';

  var DOM = {
    loginView: document.getElementById('login-view'),
    dashboardView: document.getElementById('dashboard-view'),
    btnLogin: document.getElementById('btn-login'),
    btnLogout: document.getElementById('btn-logout'),
    btnIgnite: document.getElementById('btn-ignite'),
    igniteIcon: document.getElementById('ignite-icon'),
    scenarioInput: document.getElementById('scenario-input'),
    paramsPanel: document.getElementById('params-panel'),
    inventoryGrid: document.getElementById('inventory-grid'),
    inventoryCount: document.getElementById('inventory-count'),
    sidebarNav: document.getElementById('sidebar-nav'),
    quickActions: document.getElementById('quick-actions'),
    dashboardStats: document.getElementById('dashboard-stats'),
    oraclePanel: document.getElementById('oracle-panel'),
    inventoryHubPanel: document.getElementById('inventory-hub-panel'),
    reportsPanel: document.getElementById('reports-panel'),
    forecastsPanel: document.getElementById('forecasts-panel'),
    hubRestaurantSelect: document.getElementById('hub-restaurant-select')
  };

  var state = {
    isLoggedIn: false,
    isAnalyzing: false,
    params: null,
    inventory: [],
    currentView: 'oracle',
    restaurantData: null,
    hubCharts: { comparisonBar: null, riskPie: null, stockBar: null, locationsBar: null }
  };

  var SIDEBAR_ITEMS = [
    { view: 'oracle', label: 'Dashboard', icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>' },
    { view: 'inventory-hub', label: 'Inventory Hub', icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>' },
    { view: 'reports', label: 'Reports', icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>' },
    { view: 'forecasts', label: 'Forecasts', icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>' }
  ];

  var QUICK_ACTIONS = [
    { label: 'Bioluminescent Peak', prompt: 'Massive influx expected for the neon festival weekend.' },
    { label: 'Obsidian Stall', prompt: 'Supply lines frozen for 48 hours due to logistics blackout.' },
    { label: 'Kinetic Surge', prompt: 'Sudden viral recommendation leading to 2x demand today.' },
    { label: 'Stagnant Reservoir', prompt: 'Quiet mid-week lull, demand at 60%.' }
  ];

  function escapeHtml(s) {
    if (!s) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function setView(viewName) {
    state.currentView = viewName || 'oracle';
    if (DOM.oraclePanel) DOM.oraclePanel.classList.toggle('hidden', state.currentView !== 'oracle');
    if (DOM.inventoryHubPanel) DOM.inventoryHubPanel.classList.toggle('hidden', state.currentView !== 'inventory-hub');
    if (DOM.reportsPanel) DOM.reportsPanel.classList.toggle('hidden', state.currentView !== 'reports');
    if (DOM.forecastsPanel) DOM.forecastsPanel.classList.toggle('hidden', state.currentView !== 'forecasts');
    renderSidebar();
    if (state.currentView === 'inventory-hub') {
      fetchRestaurantData().then(function () { renderInventoryHub(); });
    }
  }

  function renderSidebar() {
    if (!DOM.sidebarNav) return;
    DOM.sidebarNav.innerHTML = SIDEBAR_ITEMS.map(function (item) {
      var active = state.currentView === item.view;
      return '<div class="sidebar-item flex items-center gap-4 px-4 py-3 cursor-pointer transition-all duration-300 rounded-xl group ' + (active ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'text-white/40 hover:text-white hover:bg-white/5') + '" data-view="' + escapeHtml(item.view) + '">' +
        '<div class="transition-transform duration-300 ' + (active ? 'scale-110' : 'group-hover:scale-110') + '">' + item.icon + '</div>' +
        '<span class="text-xs font-bold uppercase tracking-widest">' + item.label + '</span></div>';
    }).join('');
    DOM.sidebarNav.querySelectorAll('.sidebar-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var view = el.getAttribute('data-view');
        if (view) setView(view);
      });
    });
  }

  function renderQuickActions() {
    if (!DOM.quickActions) return;
    DOM.quickActions.innerHTML = QUICK_ACTIONS.map(function (action) {
      return '<button type="button" class="text-[9px] mono uppercase tracking-widest py-2 px-4 border border-white/10 rounded-full hover:bg-white hover:text-black hover:border-white transition-all quick-action-btn" data-prompt="' + escapeHtml(action.prompt) + '">' + action.label + '</button>';
    }).join('');
    DOM.quickActions.querySelectorAll('.quick-action-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var prompt = btn.getAttribute('data-prompt');
        if (DOM.scenarioInput) DOM.scenarioInput.value = prompt;
        handleRunSimulation(prompt);
      });
    });
  }

  function getRiskBadgeHTML(status) {
    var styles = {
      LOW: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
      MODERATE: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
      HIGH: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
      CRITICAL: 'text-red-500 bg-red-500/10 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
    };
    return '<span class="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border transition-all duration-300 mono ' + (styles[status] || '') + '">' + (status || '') + '</span>';
  }

  function renderInventory() {
    if (!DOM.inventoryGrid) return;
    if (state.isAnalyzing && state.inventory.length === 0) {
      DOM.inventoryGrid.innerHTML = Array(6).fill(0).map(function () {
        return '<div class="h-48 glass-panel rounded-[32px] animate-pulse border-white/5"></div>';
      }).join('');
      return;
    }
    if (DOM.inventoryCount) {
      DOM.inventoryCount.textContent = 'Predicted exhaustion matrices across ' + (state.inventory.length || 0) + ' key nodes.';
    }
    DOM.inventoryGrid.innerHTML = state.inventory.map(function (item, idx) {
      var glowClass = item.riskPercent > 75 ? 'bg-red-600' : item.riskPercent > 45 ? 'bg-orange-600' : 'bg-emerald-600';
      var barClass = item.riskPercent > 75 ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]' : item.riskPercent > 45 ? 'bg-orange-500' : 'bg-emerald-500';
      var pctClass = item.riskPercent > 75 ? 'text-glow-red text-red-500' : 'text-white';
      var animationDelay = 'style="animation-delay: ' + (idx * 100) + 'ms"';
      return '<div class="glass-panel p-8 rounded-[32px] hover:border-white/20 transition-all duration-500 group relative overflow-hidden flex flex-col justify-between border-white/5" ' + animationDelay + '>' +
        '<div class="absolute -right-10 -bottom-10 w-32 h-32 blur-[60px] opacity-10 group-hover:opacity-30 transition-opacity rounded-full ' + glowClass + '"></div>' +
        '<div class="relative z-10 flex justify-between items-start">' +
        '<div><h3 class="text-xl font-bold tracking-tight mb-2 group-hover:text-indigo-400 transition-colors">' + escapeHtml(item.name) + '</h3>' +
        '<div class="flex items-center gap-2">' + getRiskBadgeHTML(item.status) +
        '<span class="text-[9px] mono text-white/20 uppercase tracking-widest">' + item.currentStock + ' ' + escapeHtml(item.unit) + ' ON_HAND</span></div></div>' +
        '<div class="text-4xl font-black tracking-tighter mono ' + pctClass + '">' + item.riskPercent + '<span class="text-sm opacity-20">%</span></div></div>' +
        '<div class="relative z-10 mt-10 space-y-5">' +
        '<p class="text-xs text-white/40 leading-relaxed italic border-l border-white/10 pl-4 py-1">"' + escapeHtml(item.reason) + '"</p>' +
        '<div class="flex items-center justify-between"><div class="flex-1 h-1 bg-white/5 rounded-full overflow-hidden mr-6">' +
        '<div class="h-full transition-all duration-1000 ' + barClass + '" style="width: ' + item.riskPercent + '%"></div></div>' +
        '<button type="button" class="text-[9px] mono uppercase text-white/20 hover:text-white transition-colors tracking-widest">DRIVE_PLAN</button></div></div></div>';
    }).join('');
  }

  function renderParams() {
    if (!DOM.paramsPanel || !state.params) return;
    var pct = Math.min(100, (state.params.demand_multiplier / 2.5) * 100);
    DOM.paramsPanel.innerHTML =
      '<div class="space-y-6">' +
      '<div class="space-y-1"><span class="text-[9px] mono text-white/30 uppercase tracking-widest">Simulation Label</span>' +
      '<p class="text-2xl font-bold tracking-tight text-glow-blue leading-tight italic">"' + escapeHtml(state.params.notes) + '"</p></div>' +
      '<div class="grid grid-cols-2 gap-6">' +
      '<div class="space-y-1"><span class="text-[9px] mono text-white/30 uppercase tracking-widest">Demand Mult.</span>' +
      '<p class="text-4xl font-black tracking-tighter">' + state.params.demand_multiplier + 'x</p></div>' +
      '<div class="space-y-1"><span class="text-[9px] mono text-white/30 uppercase tracking-widest">Horizon</span>' +
      '<p class="text-4xl font-black tracking-tighter">' + state.params.horizon_hours + 'H</p></div></div></div>' +
      '<div class="pt-6 border-t border-white/5">' +
      '<div class="flex justify-between items-center mb-2"><span class="text-[9px] mono text-white/40 uppercase">Stress Calculation</span>' +
      '<span class="text-[10px] mono text-indigo-400 font-bold">READY</span></div>' +
      '<div class="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">' +
      '<div class="h-full bg-indigo-500 transition-all duration-1000" style="width: ' + pct + '%"></div></div></div>';
    if (DOM.dashboardStats) {
      DOM.dashboardStats.classList.remove('hidden');
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
    var label = DOM.btnIgnite.querySelector('span');
    if (label) label.textContent = loading ? 'Propagating...' : 'Ignite Logic';
  }

  function handleRunSimulation(scenario) {
    scenario = (scenario || '').trim();
    if (!scenario) return;
    state.isAnalyzing = true;
    state.inventory = [];
    setIgniteLoading(true);
    renderInventory();

    fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: scenario })
    })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error(res.statusText || 'Request failed')); })
      .then(function (data) {
        state.params = data.params || null;
        state.inventory = data.inventory || [];
        setTimeout(function () {
          state.isAnalyzing = false;
          setIgniteLoading(false);
          renderParams();
          renderInventory();
        }, 800);
      })
      .catch(function (err) {
        console.error('Simulation failed:', err);
        state.isAnalyzing = false;
        setIgniteLoading(false);
        state.params = { horizon_hours: 72, demand_multiplier: 1.0, notes: 'Auto-calibrated baseline' };
        state.inventory = [];
        renderParams();
        renderInventory();
      });
  }

  function fetchRestaurantData() {
    if (state.restaurantData) return Promise.resolve();
    return fetch('/api/inventory/restaurants')
      .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('Failed to load')); })
      .then(function (data) {
        state.restaurantData = data.restaurants || [];
        return state.restaurantData;
      })
      .catch(function (err) {
        console.error('Restaurant inventory fetch failed:', err);
        state.restaurantData = [];
        return state.restaurantData;
      });
  }

  function destroyChart(chart) {
    if (chart && typeof chart.destroy === 'function') chart.destroy();
  }

  function renderInventoryHub() {
    if (state.currentView !== 'inventory-hub' || !state.restaurantData || state.restaurantData.length === 0) return;
    var restaurants = state.restaurantData;
    var selectedId = DOM.hubRestaurantSelect ? DOM.hubRestaurantSelect.value : (restaurants[0] && restaurants[0].id);
    var current = restaurants.filter(function (r) { return r.id === selectedId; })[0] || restaurants[0];
    var inventory = (current && current.inventory) ? current.inventory : [];

    var chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: 'rgba(248,250,252,0.9)', font: { size: 11 } } }
      },
      scales: {}
    };

    if (typeof Chart === 'undefined') return;

    var scaleOpts = {
      ticks: { color: 'rgba(248,250,252,0.8)', font: { family: "'JetBrains Mono', monospace", size: 10 } },
      grid: { color: 'rgba(255,255,255,0.06)' }
    };

    destroyChart(state.hubCharts.comparisonBar);
    var categories = ['Stock health', 'Risk score', 'Critical items', 'Restock urgency'];
    var maxTotal = 200;
    var comparisonData = restaurants.map(function (r) {
      var inv = r.inventory || [];
      var total = inv.reduce(function (s, i) { return s + (i.currentStock || 0); }, 0);
      var avgRisk = inv.length ? inv.reduce(function (s, i) { return s + (i.riskPercent || 0); }, 0) / inv.length : 0;
      var critical = inv.filter(function (i) { return i.status === 'CRITICAL'; }).length;
      var stockHealth = Math.min(10, Math.round((total / maxTotal) * 10));
      var riskScore = Math.min(10, Math.round(avgRisk / 10));
      var criticalScore = Math.max(0, 10 - critical);
      var restockUrgency = Math.min(10, Math.round(avgRisk / 10));
      return [stockHealth, riskScore, criticalScore, restockUrgency];
    });
    var compCtx = document.getElementById('chart-comparison-bar');
    if (compCtx) {
      state.hubCharts.comparisonBar = new Chart(compCtx, {
        type: 'bar',
        data: {
          labels: categories,
          datasets: [
            { label: restaurants[0] ? restaurants[0].name : 'Main', data: comparisonData[0] || [0,0,0,0], backgroundColor: 'rgba(99,102,241,0.7)', borderColor: '#6366f1', borderWidth: 1 },
            { label: restaurants[1] ? restaurants[1].name : 'Downtown', data: comparisonData[1] || [0,0,0,0], backgroundColor: 'rgba(16,185,129,0.7)', borderColor: '#10b981', borderWidth: 1 },
            { label: restaurants[2] ? restaurants[2].name : 'Harbor', data: comparisonData[2] || [0,0,0,0], backgroundColor: 'rgba(245,158,11,0.7)', borderColor: '#f59e0b', borderWidth: 1 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: 'rgba(248,250,252,0.9)', font: { family: "'JetBrains Mono', monospace", size: 11 } } }
          },
          scales: {
            x: scaleOpts,
            y: { min: 0, max: 10, ...scaleOpts }
          }
        }
      });
    }

    destroyChart(state.hubCharts.riskPie);
    var riskCounts = { LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0 };
    inventory.forEach(function (item) {
      if (riskCounts.hasOwnProperty(item.status)) riskCounts[item.status]++;
    });
    var riskCtx = document.getElementById('chart-risk-pie');
    if (riskCtx) {
      state.hubCharts.riskPie = new Chart(riskCtx, {
        type: 'pie',
        data: {
          labels: ['Low', 'Moderate', 'High', 'Critical'],
          datasets: [{
            data: [riskCounts.LOW, riskCounts.MODERATE, riskCounts.HIGH, riskCounts.CRITICAL],
            backgroundColor: ['rgba(16,185,129,0.8)', 'rgba(245,158,11,0.8)', 'rgba(249,115,22,0.8)', 'rgba(239,68,68,0.8)'],
            borderColor: ['#10b981', '#f59e0b', '#f97316', '#ef4444'],
            borderWidth: 1
          }]
        },
        options: Object.assign({}, chartOptions, {
          plugins: { legend: { labels: { color: 'rgba(248,250,252,0.9)', font: { family: "'JetBrains Mono', monospace", size: 11 } } } }
        })
      });
    }

    destroyChart(state.hubCharts.stockBar);
    var stockCtx = document.getElementById('chart-stock-bar');
    if (stockCtx) {
      state.hubCharts.stockBar = new Chart(stockCtx, {
        type: 'bar',
        data: {
          labels: inventory.map(function (i) { return i.name; }),
          datasets: [{
            label: 'Stock',
            data: inventory.map(function (i) { return i.currentStock; }),
            backgroundColor: 'rgba(99,102,241,0.6)',
            borderColor: '#6366f1',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: 'rgba(248,250,252,0.8)', maxRotation: 45, font: { family: "'JetBrains Mono', monospace", size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } },
            y: { ticks: { color: 'rgba(248,250,252,0.8)', font: { family: "'JetBrains Mono', monospace", size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } }
          }
        }
      });
    }

    destroyChart(state.hubCharts.locationsBar);
    var locationTotals = restaurants.map(function (r) {
      var total = (r.inventory || []).reduce(function (sum, i) { return sum + (i.currentStock || 0); }, 0);
      return { name: r.name, total: total };
    });
    var locCtx = document.getElementById('chart-locations-bar');
    if (locCtx) {
      state.hubCharts.locationsBar = new Chart(locCtx, {
        type: 'bar',
        data: {
          labels: locationTotals.map(function (l) { return l.name; }),
          datasets: [{
            label: 'Total Stock',
            data: locationTotals.map(function (l) { return l.total; }),
            backgroundColor: ['rgba(99,102,241,0.6)', 'rgba(16,185,129,0.6)', 'rgba(245,158,11,0.6)'],
            borderColor: ['#6366f1', '#10b981', '#f59e0b'],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: 'rgba(248,250,252,0.8)', font: { family: "'JetBrains Mono', monospace", size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } },
            y: { ticks: { color: 'rgba(248,250,252,0.8)', font: { family: "'JetBrains Mono', monospace", size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } }
          }
        }
      });
    }
  }

  function showDashboard() {
    state.isLoggedIn = true;
    if (DOM.loginView) DOM.loginView.classList.add('hidden');
    if (DOM.dashboardView) DOM.dashboardView.classList.remove('hidden');
    renderSidebar();
    renderQuickActions();
    handleRunSimulation('Baseline initialization');
  }

  function showLogin() {
    state.isLoggedIn = false;
    if (DOM.loginView) DOM.loginView.classList.remove('hidden');
    if (DOM.dashboardView) DOM.dashboardView.classList.add('hidden');
  }

  if (DOM.btnLogin) {
    DOM.btnLogin.addEventListener('click', showDashboard);
  }

  if (DOM.btnLogout) {
    DOM.btnLogout.addEventListener('click', showLogin);
  }

  if (DOM.btnIgnite) {
    DOM.btnIgnite.addEventListener('click', function () {
      handleRunSimulation(DOM.scenarioInput ? DOM.scenarioInput.value : '');
    });
  }

  if (DOM.hubRestaurantSelect) {
    DOM.hubRestaurantSelect.addEventListener('change', function () {
      if (state.currentView === 'inventory-hub') renderInventoryHub();
    });
  }

  // Collapsible sections: click header to minimize/maximize
  document.addEventListener('click', function (e) {
    var toggle = e.target.closest('[data-collapse-toggle]');
    if (!toggle) return;
    var section = toggle.closest('.collapsible-section');
    if (section) section.classList.toggle('collapsed');
  });
})();
