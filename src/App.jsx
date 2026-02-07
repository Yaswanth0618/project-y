import React, { useState, useEffect, useCallback } from 'react';
import { parseScenario } from './services/geminiServer.js';
import { simulateRisk } from './services/inventoryEngine.js';
import { RiskBadge } from './components/RiskBadge.jsx';

function SidebarItem({ icon, label, active }) {
  return (
    <div className={`flex items-center gap-4 px-4 py-3 cursor-pointer transition-all duration-300 rounded-xl group ${active ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
      <div className={`transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>{icon}</div>
      <span className="text-xs font-bold uppercase tracking-widest">{label}</span>
    </div>
  );
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [params, setParams] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [view, setView] = useState('dashboard');

  const quickActions = [
    { label: 'Bioluminescent Peak', prompt: 'Massive influx expected for the neon festival weekend.' },
    { label: 'Obsidian Stall', prompt: 'Supply lines frozen for 48 hours due to logistics blackout.' },
    { label: 'Kinetic Surge', prompt: 'Sudden viral recommendation leading to 2x demand today.' },
    { label: 'Stagnant Reservoir', prompt: 'Quiet mid-week lull, demand at 60%.' },
  ];

  const handleRunSimulation = useCallback(async (scenario) => {
    if (!scenario.trim()) return;
    setIsAnalyzing(true);
    try {
      const parsedParams = await parseScenario(scenario);
      setParams(parsedParams);
      const risks = simulateRisk(parsedParams);
      setTimeout(() => {
        setInventory(risks);
        setIsAnalyzing(false);
      }, 1000);
    } catch (err) {
      console.error('Linkage failed:', err);
      setIsAnalyzing(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      handleRunSimulation('Baseline initialization');
    }
  }, [isLoggedIn, handleRunSimulation]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
        <div className="fixed inset-0 bg-indigo-600/10 blur-[150px] -z-10 rounded-full animate-pulse"></div>
        <div className="glass-panel p-12 rounded-[40px] w-full max-w-md space-y-8 relative z-10 border-white/20">
          <div className="text-center space-y-2">
            <div className="h-16 w-16 glass-panel rounded-2xl mx-auto flex items-center justify-center border-indigo-500/50 mb-6 shadow-[0_0_30px_rgba(79,70,229,0.2)]">
              <div className="w-6 h-6 bg-indigo-500 rounded-sm rotate-45"></div>
            </div>
            <h1 className="text-3xl font-bold tracking-tighter uppercase">SpellStock</h1>
            <p className="text-[10px] mono text-white/40 uppercase tracking-[0.3em]">Initialize Neural Link</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] mono text-white/30 uppercase tracking-widest ml-4">Node Identity</label>
              <input
                type="text"
                defaultValue="admin_main"
                className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm font-medium"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] mono text-white/30 uppercase tracking-widest ml-4">Access Key</label>
              <input
                type="password"
                defaultValue="••••••••"
                className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm font-medium"
              />
            </div>
            <button
              onClick={() => setIsLoggedIn(true)}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold uppercase tracking-widest text-sm transition-all shadow-[0_0_40px_rgba(79,70,229,0.4)]"
            >
              Enter System
            </button>
          </div>
          <p className="text-[9px] text-center text-white/20 uppercase tracking-widest">Authorized Personnel Only // Protocol 09-X</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-72 border-r border-white/5 bg-[#0a0a0c] flex flex-col h-screen sticky top-0 z-[60]">
        <div className="p-8 border-b border-white/5 flex items-center gap-3">
          <div className="h-8 w-8 bg-indigo-500 rounded flex items-center justify-center rotate-45">
            <div className="w-2 h-2 bg-white rounded-full"></div>
          </div>
          <span className="text-lg font-bold tracking-tighter uppercase">SpellStock</span>
        </div>

        <nav className="flex-1 p-6 space-y-2 overflow-y-auto">
          <SidebarItem
            active={view === 'dashboard'}
            label="Oracle Dashboard"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>}
          />
          <SidebarItem
            label="Inventory Hub"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
          />
          <SidebarItem
            label="Neural Forecast"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
          />
          <SidebarItem
            label="Node Reports"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
          />
        </nav>

        <div className="p-6 border-t border-white/5 space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold">JD</div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white">Chef de Node</p>
              <p className="text-[9px] mono text-white/30 uppercase">ID: 4402-B</p>
            </div>
          </div>
          <button onClick={() => setIsLoggedIn(false)} className="w-full py-2 text-[10px] mono uppercase text-white/30 hover:text-white transition-colors flex items-center justify-center gap-2">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
            Terminate Link
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col relative">
        <header className="px-8 py-6 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#0a0a0c]/80 backdrop-blur-xl z-50">
          <div>
            <h1 className="text-xl font-bold tracking-tighter uppercase">Environment <span className="text-indigo-500">Orchestrator</span></h1>
            <p className="text-[10px] mono text-white/40 uppercase tracking-[0.2em]">Operational Pulse // Active Zone 01</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-[9px] mono text-white/20 uppercase tracking-widest">Server Load</span>
              <span className="text-xs font-bold text-emerald-500">0.02ms Latency</span>
            </div>
            <div className="h-8 w-[1px] bg-white/10"></div>
            <div className="flex items-center gap-2 glass-panel px-3 py-1.5 rounded-full border-white/10">
              <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
              <span className="text-[10px] mono font-bold uppercase tracking-widest">Gemini-3-Flash Connected</span>
            </div>
          </div>
        </header>

        <main className="p-10 space-y-12 max-w-[1400px]">
          <section className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
            <div className="xl:col-span-8 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-6 bg-indigo-500"></div>
                <h2 className="text-sm font-bold uppercase tracking-[0.3em] text-white/50">Scenario Input Console</h2>
              </div>
              <div className="glass-panel p-8 rounded-[40px] border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.4)] relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                  <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                </div>

                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Describe the upcoming demand shift... e.g. 'Unexpected cold front moving in, shift demand to hot beverages for 48h'"
                  className="w-full bg-transparent border-none text-2xl font-bold placeholder:text-white/10 focus:ring-0 resize-none h-44 mb-6 leading-tight"
                />

                <div className="flex items-center justify-between border-t border-white/5 pt-8">
                  <div className="flex gap-4">
                    {quickActions.map((action) => (
                      <button
                        key={action.label}
                        onClick={() => {
                          setInputText(action.prompt);
                          handleRunSimulation(action.prompt);
                        }}
                        className="text-[9px] mono uppercase tracking-widest py-2 px-4 border border-white/10 rounded-full hover:bg-white hover:text-black hover:border-white transition-all"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => handleRunSimulation(inputText)}
                    disabled={isAnalyzing || !inputText.trim()}
                    className="group flex items-center gap-4 bg-indigo-600 hover:bg-indigo-500 p-2 pr-8 rounded-full transition-all disabled:opacity-30 disabled:grayscale"
                  >
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center group-hover:rotate-45 transition-transform duration-500">
                      {isAnalyzing ? (
                        <svg className="animate-spin h-6 w-6 text-black" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                      ) : (
                        <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                      )}
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest">{isAnalyzing ? 'Propagating...' : 'Ignite Logic'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="xl:col-span-4 space-y-6 h-full">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-6 bg-indigo-500/30"></div>
                <h2 className="text-sm font-bold uppercase tracking-[0.3em] text-white/30">Node Parameters</h2>
              </div>
              <div className="glass-panel p-8 rounded-[40px] border-white/10 h-[368px] flex flex-col justify-between kinetic-border">
                {!params ? (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                    <div className="w-12 h-12 border border-white/10 rounded-full flex items-center justify-center animate-pulse">
                      <div className="w-2 h-2 bg-indigo-500/40 rounded-full"></div>
                    </div>
                    <p className="text-[10px] mono uppercase text-white/20 tracking-[0.2em]">Awaiting Simulation Data</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-6">
                      <div className="space-y-1">
                        <span className="text-[9px] mono text-white/30 uppercase tracking-widest">Simulation Label</span>
                        <p className="text-2xl font-bold tracking-tight text-glow-blue leading-tight italic">"{params.notes}"</p>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-1">
                          <span className="text-[9px] mono text-white/30 uppercase tracking-widest">Demand Mult.</span>
                          <p className="text-4xl font-black tracking-tighter">{params.demand_multiplier}x</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] mono text-white/30 uppercase tracking-widest">Horizon</span>
                          <p className="text-4xl font-black tracking-tighter">{params.horizon_hours}H</p>
                        </div>
                      </div>
                    </div>
                    <div className="pt-6 border-t border-white/5">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[9px] mono text-white/40 uppercase">Stress Calculation</span>
                        <span className="text-[10px] mono text-indigo-400 font-bold">READY</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${(params.demand_multiplier / 2.5) * 100}%` }}></div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-8">
            <div className="flex items-end justify-between">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tighter uppercase">Strategic <span className="text-white/40">Outlook</span></h2>
                <p className="text-sm text-white/30 mono">Predicted exhaustion matrices across {inventory.length || '...'} key nodes.</p>
              </div>
              {params && (
                <div className="hidden md:flex gap-8">
                  <div className="text-right">
                    <div className="text-[9px] mono text-white/20 uppercase tracking-widest">Volatility Index</div>
                    <div className="text-lg font-bold text-indigo-400 tracking-tighter">Normal</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] mono text-white/20 uppercase tracking-widest">Risk Threshold</div>
                    <div className="text-lg font-bold text-red-500 tracking-tighter">78.4% Delta</div>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-20">
              {isAnalyzing && inventory.length === 0 ? (
                Array(6).fill(0).map((_, i) => (
                  <div key={i} className="h-48 glass-panel rounded-[32px] animate-pulse border-white/5"></div>
                ))
              ) : (
                inventory.map((item) => (
                  <div
                    key={item.id}
                    className="glass-panel p-8 rounded-[32px] hover:border-white/20 transition-all duration-500 group relative overflow-hidden flex flex-col justify-between border-white/5"
                  >
                    <div className={`absolute -right-10 -bottom-10 w-32 h-32 blur-[60px] opacity-10 group-hover:opacity-30 transition-opacity rounded-full ${
                      item.riskPercent > 75 ? 'bg-red-600' :
                      item.riskPercent > 45 ? 'bg-orange-600' : 'bg-emerald-600'
                    }`}></div>

                    <div className="relative z-10 flex justify-between items-start">
                      <div>
                        <h3 className="text-xl font-bold tracking-tight mb-2 group-hover:text-indigo-400 transition-colors">{item.name}</h3>
                        <div className="flex items-center gap-2">
                          <RiskBadge status={item.status} />
                          <span className="text-[9px] mono text-white/20 uppercase tracking-widest">{item.currentStock} {item.unit} ON_HAND</span>
                        </div>
                      </div>
                      <div className={`text-4xl font-black tracking-tighter mono ${
                        item.riskPercent > 75 ? 'text-glow-red text-red-500' : 'text-white'
                      }`}>
                        {item.riskPercent}<span className="text-sm opacity-20">%</span>
                      </div>
                    </div>

                    <div className="relative z-10 mt-10 space-y-5">
                      <p className="text-xs text-white/40 leading-relaxed italic border-l border-white/10 pl-4 py-1">
                        "{item.reason}"
                      </p>

                      <div className="flex items-center justify-between">
                        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden mr-6">
                          <div
                            className={`h-full transition-all duration-1000 ${
                              item.riskPercent > 75 ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]' :
                              item.riskPercent > 45 ? 'bg-orange-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${item.riskPercent}%` }}
                          ></div>
                        </div>
                        <button className="text-[9px] mono uppercase text-white/20 hover:text-white transition-colors tracking-widest">DRIVE_PLAN</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </main>
      </div>

      <footer className="fixed bottom-0 left-72 right-0 bg-[#0a0a0c]/90 backdrop-blur-md border-t border-white/5 px-8 py-2.5 flex items-center justify-between z-50">
        <div className="flex gap-10">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
            <span className="text-[9px] mono uppercase text-white/30 tracking-widest">Prediction Engine Live</span>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-[9px] mono uppercase text-white/10 tracking-widest">System Load // 14%</span>
          </div>
        </div>

        <div className="text-[9px] mono uppercase text-white/20 tracking-[0.4em] flex items-center gap-4">
          <span>{new Date().toLocaleTimeString()}</span>
          <span>SpellStock Oracle v2.5-STABLE</span>
        </div>
      </footer>
    </div>
  );
}
