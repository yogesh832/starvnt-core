import React, { useState, useEffect, useRef, useMemo } from 'react';
import Icon from '../components/Icon.jsx';
import { LogoWord } from '../components/ui.jsx';

// Pre-configured Routes List across STARVNT Platform
const DEFAULT_ROUTES = [
  {
    id: 'health',
    name: 'Platform Health Probe',
    category: 'System',
    method: 'GET',
    path: '/api/health',
    authType: 'NONE', // NONE, CUSTOMER, VENDOR, ADMIN
    body: '',
    concurrency: 10,
    iterations: 100,
    delayMs: 20,
  },
  {
    id: 'test-echo',
    name: 'Dev Echo Ping Payload Target',
    category: 'System',
    method: 'POST',
    path: '/api/test/echo',
    authType: 'NONE',
    body: JSON.stringify({ devTest: true, timestamp: Date.now(), loadTest: 'Stress ping' }, null, 2),
    concurrency: 20,
    iterations: 200,
    delayMs: 10,
  },
  {
    id: 'auth-otp-send',
    name: 'Auth API: Send Email/Phone OTP',
    category: 'Auth API',
    method: 'POST',
    path: '/api/auth/otp/send',
    authType: 'NONE',
    body: JSON.stringify({ email: 'demo.test@starvnt.com', phone: '+919876543210', accountType: 'CUSTOMER' }, null, 2),
    concurrency: 5,
    iterations: 50,
    delayMs: 50,
  },
  {
    id: 'auth-login-customer',
    name: 'Auth API: Customer Auth Check',
    category: 'Auth API',
    method: 'GET',
    path: '/api/customer/me',
    authType: 'CUSTOMER',
    body: '',
    concurrency: 10,
    iterations: 100,
    delayMs: 20,
  },
  {
    id: 'auth-login-vendor',
    name: 'Auth API: Vendor Auth Check',
    category: 'Auth API',
    method: 'GET',
    path: '/api/vendor/me',
    authType: 'VENDOR',
    body: '',
    concurrency: 10,
    iterations: 100,
    delayMs: 20,
  },
  {
    id: 'customer-catalog',
    name: 'Customer Service Requirements Catalog',
    category: 'Customer Domain',
    method: 'GET',
    path: '/api/customer/services',
    authType: 'NONE',
    body: '',
    concurrency: 15,
    iterations: 150,
    delayMs: 15,
  },
  {
    id: 'customer-events',
    name: 'Customer Events Feed',
    category: 'Customer Domain',
    method: 'GET',
    path: '/api/customer/events',
    authType: 'CUSTOMER',
    body: '',
    concurrency: 10,
    iterations: 100,
    delayMs: 20,
  },
  {
    id: 'vendor-services',
    name: 'Vendor Services Listing',
    category: 'Vendor Domain',
    method: 'GET',
    path: '/api/vendor/services',
    authType: 'VENDOR',
    body: '',
    concurrency: 10,
    iterations: 100,
    delayMs: 20,
  },
  {
    id: 'vendor-opportunities',
    name: 'Vendor Commercial Opportunities',
    category: 'Vendor Domain',
    method: 'GET',
    path: '/api/commercial/opportunities',
    authType: 'VENDOR',
    body: '',
    concurrency: 10,
    iterations: 100,
    delayMs: 20,
  },
  {
    id: 'aura-chat',
    name: 'Aura AI Concierge Chat Stream',
    category: 'Aura AI Engine',
    method: 'POST',
    path: '/api/aura/chat',
    authType: 'CUSTOMER',
    body: JSON.stringify({ message: 'Hello Aura, performance load benchmark request', history: [] }, null, 2),
    concurrency: 5,
    iterations: 30,
    delayMs: 100,
  },
  {
    id: 'admin-automation',
    name: 'Admin Automation Outbox Metrics',
    category: 'Admin Domain',
    method: 'GET',
    path: '/api/admin/automation/stats',
    authType: 'ADMIN',
    body: '',
    concurrency: 10,
    iterations: 100,
    delayMs: 20,
  },
  {
    id: 'admin-audit',
    name: 'Admin Business Audit Logs',
    category: 'Admin Domain',
    method: 'GET',
    path: '/api/admin/audit?limit=10',
    authType: 'ADMIN',
    body: '',
    concurrency: 10,
    iterations: 100,
    delayMs: 20,
  },
];

const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL.replace(/\/$/, '');
  return import.meta.env.MODE === 'production' ? 'https://app.starvnt.com' : 'http://localhost:4000';
};

// Latency Sparkline Graph SVG Component
function Sparkline({ history = [], height = 40, width = 160 }) {
  if (!history || history.length === 0) {
    return <div className="h-8 w-full bg-slate-950/40 rounded flex items-center justify-center text-[9px] text-slate-600 font-mono">No data</div>;
  }
  const values = history.map(d => d.latency);
  const min = Math.min(...values);
  const max = Math.max(...values) || 1;
  const range = (max - min) || 1;
  const points = values.map((val, i) => {
    const x = (i / (values.length - 1 || 1)) * (width - 8) + 4;
    const y = height - 4 - ((val - min) / range) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const latest = values[values.length - 1];
  const color = latest < 100 ? '#10b981' : latest < 300 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex items-center gap-2">
      <svg width={width} height={height} className="overflow-visible bg-slate-950/80 rounded border border-slate-800 p-0.5">
        <polyline fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" points={points} />
      </svg>
      <span className="text-[10px] font-mono font-bold" style={{ color }}>{latest}ms</span>
    </div>
  );
}

export default function DevApiTest() {
  const [routes, setRoutes] = useState(DEFAULT_ROUTES);
  const [tokens, setTokens] = useState({
    customer: localStorage.getItem('starvnt_external_access_token') || '',
    vendor: localStorage.getItem('starvnt_external_access_token') || '',
    admin: localStorage.getItem('starvnt_admin_access_token') || '',
  });

  const [routeStats, setRouteStats] = useState({});
  const [logs, setLogs] = useState([]);
  const [activeTest, setActiveTest] = useState(null); // routeId or 'ALL'
  const [stressMode, setStressMode] = useState(false);
  const [selectedInspect, setSelectedInspect] = useState(null);

  // Quick Auth Demo Credentials textboxes
  const [authInputs, setAuthInputs] = useState({
    email: 'customer.demo@starvnt.com',
    password: 'Password123!',
    adminEmail: 'admin@starvnt.com',
    adminPassword: 'Password123!',
  });

  const [globalStats, setGlobalStats] = useState({
    totalReqs: 0,
    totalSuccess: 0,
    totalErr: 0,
    peakRps: 0,
    startTime: null,
  });

  const logTerminalRef = useRef(null);

  useEffect(() => {
    if (logTerminalRef.current) {
      logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
    }
  }, [logs]);

  // Handle load textbox updates per route
  const handleRouteConfigChange = (id, field, value) => {
    const num = Math.max(1, parseInt(value, 10) || 1);
    setRoutes(prev => prev.map(r => r.id === id ? { ...r, [field]: num } : r));
  };

  const handleRouteTextChange = (id, field, value) => {
    setRoutes(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  // Record metrics for request execution
  const recordResult = (routeId, path, method, status, latency, payloadSize, dataOrErr) => {
    const now = Date.now();
    setLogs(prev => [
      ...prev.slice(-200),
      {
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString(),
        routeId,
        path,
        method,
        status,
        latency,
        payloadSize,
        success: status >= 200 && status < 400,
        data: dataOrErr,
      }
    ]);

    setRouteStats(prev => {
      const cur = prev[routeId] || {
        total: 0,
        status2xx: 0,
        status4xx: 0,
        status5xx: 0,
        latencies: [],
        history: [],
        min: 999999,
        max: 0,
        avg: 0,
        p50: 0,
        p90: 0,
        p99: 0,
        totalBytes: 0,
        lastPayload: null,
        lastStatus: 0,
        lastLatency: 0,
      };

      const newTotal = cur.total + 1;
      const is2xx = status >= 200 && status < 300;
      const is4xx = status >= 400 && status < 500;
      const is5xx = status >= 500 || status === 0;

      const newLatencies = [...cur.latencies, latency].sort((a, b) => a - b);
      const newHistory = [...cur.history.slice(-30), { time: now, latency, status }];
      const newMin = Math.min(cur.min, latency);
      const newMax = Math.max(cur.max, latency);
      const sum = newLatencies.reduce((a, b) => a + b, 0);
      const newAvg = Math.round(sum / newLatencies.length);

      const p50 = newLatencies[Math.floor(newLatencies.length * 0.50)] || latency;
      const p90 = newLatencies[Math.floor(newLatencies.length * 0.90)] || latency;
      const p99 = newLatencies[Math.floor(newLatencies.length * 0.99)] || latency;

      return {
        ...prev,
        [routeId]: {
          total: newTotal,
          status2xx: cur.status2xx + (is2xx ? 1 : 0),
          status4xx: cur.status4xx + (is4xx ? 1 : 0),
          status5xx: cur.status5xx + (is5xx ? 1 : 0),
          latencies: newLatencies,
          history: newHistory,
          min: newMin === 999999 ? latency : newMin,
          max: newMax,
          avg: newAvg,
          p50,
          p90,
          p99,
          totalBytes: cur.totalBytes + (payloadSize || 0),
          lastPayload: dataOrErr,
          lastStatus: status,
          lastLatency: latency,
        }
      };
    });

    setGlobalStats(prev => ({
      ...prev,
      totalReqs: prev.totalReqs + 1,
      totalSuccess: prev.totalSuccess + (status >= 200 && status < 400 ? 1 : 0),
      totalErr: prev.totalErr + (status >= 400 || status === 0 ? 1 : 0),
    }));
  };

  // Perform single execution to route
  const executeSingleRequest = async (route) => {
    const apiBase = getApiBaseUrl();
    const fullUrl = route.path.startsWith('http') ? route.path : `${apiBase}${route.path}`;
    const startTime = performance.now();
    let status = 0;
    let payloadSize = 0;
    let resultData = null;

    try {
      const headers = { Accept: 'application/json' };
      if (route.method !== 'GET' && route.method !== 'HEAD') {
        headers['Content-Type'] = 'application/json';
      }

      // Attach requested Auth Token
      if (route.authType === 'CUSTOMER' && tokens.customer) {
        headers['Authorization'] = `Bearer ${tokens.customer}`;
      } else if (route.authType === 'VENDOR' && tokens.vendor) {
        headers['Authorization'] = `Bearer ${tokens.vendor}`;
      } else if (route.authType === 'ADMIN' && tokens.admin) {
        headers['Authorization'] = `Bearer ${tokens.admin}`;
      }

      const response = await fetch(fullUrl, {
        method: route.method,
        headers,
        body: (route.method !== 'GET' && route.method !== 'HEAD' && route.body) ? route.body : undefined,
      });

      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      status = response.status;

      const text = await response.text();
      payloadSize = text.length;
      try {
        resultData = JSON.parse(text);
      } catch {
        resultData = text.slice(0, 300);
      }

      recordResult(route.id, route.path, route.method, status, latency, payloadSize, resultData);
      return { status, latency, data: resultData };
    } catch (err) {
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      recordResult(route.id, route.path, route.method, 0, latency, 0, { error: err.message || 'Network Failure' });
      return { status: 0, latency, data: err.message };
    }
  };

  // Execute Load Test Worker Pool for a single route using its custom textboxes
  const runRouteLoadTest = async (route) => {
    setActiveTest(route.id);
    const { concurrency, iterations, delayMs } = route;
    let completed = 0;

    const worker = async () => {
      while (completed < iterations) {
        completed++;
        await executeSingleRequest(route);
        if (delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    };

    const pool = Array.from({ length: Math.min(concurrency, iterations) }, () => worker());
    await Promise.all(pool);
    setActiveTest(null);
  };

  // BOMBARD ALL ROUTES SIMULTANEOUSLY USING EACH ROUTE'S TEXTBOX VALUES
  const runAllRoutesSimultaneously = async () => {
    setActiveTest('ALL');
    setGlobalStats(prev => ({ ...prev, startTime: Date.now() }));
    
    const tasks = routes.map(route => runRouteLoadTest(route));
    await Promise.all(tasks);
    setActiveTest(null);
  };

  // Automated Quick Demo Login to acquire real Tokens for authenticated testing
  const acquireDemoTokens = async () => {
    const apiBase = getApiBaseUrl();
    try {
      // Login Customer / Vendor
      const extRes = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: authInputs.email, password: authInputs.password }),
      });
      const extData = await extRes.json();
      if (extData.accessToken) {
        setTokens(prev => ({ ...prev, customer: extData.accessToken, vendor: extData.accessToken }));
        localStorage.setItem('starvnt_external_access_token', extData.accessToken);
      }

      // Login Admin
      const adminRes = await fetch(`${apiBase}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authInputs.adminEmail, password: authInputs.adminPassword }),
      });
      const adminData = await adminRes.json();
      if (adminData.accessToken) {
        setTokens(prev => ({ ...prev, admin: adminData.accessToken }));
        localStorage.setItem('starvnt_admin_access_token', adminData.accessToken);
      }

      alert('Auth Tokens successfully acquired! Credentials attached for load testing.');
    } catch (err) {
      alert(`Token acquisition note: ${err.message || 'Ready for test execution'}`);
    }
  };

  const clearStats = () => {
    setRouteStats({});
    setLogs([]);
    setGlobalStats({ totalReqs: 0, totalSuccess: 0, totalErr: 0, peakRps: 0, startTime: null });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-purple-500 selection:text-white pb-20">
      
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 lg:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <LogoWord sub="Dev API Load & Capacity Stress Workbench" light={true} />
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
            DEV LOAD STRESS BENCHMARK
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={clearStats}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition flex items-center gap-1.5"
          >
            <Icon name="trash" size={14} /> Clear Stats
          </button>
          <a
            href="/"
            className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-purple-600/30"
          >
            <Icon name="chevronLeft" size={14} /> Back to Portal
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-6">

        {/* Global Summary Dashboard Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-xl">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Total Load Requests</div>
            <div className="text-3xl font-black text-white mt-1">{globalStats.totalReqs}</div>
            <div className="text-[10px] text-slate-500 mt-1">Across all API routes</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-xl">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Success Rate</div>
            <div className="text-3xl font-black text-emerald-400 mt-1">
              {globalStats.totalReqs > 0 ? `${Math.round((globalStats.totalSuccess / globalStats.totalReqs) * 100)}%` : '100%'}
            </div>
            <div className="text-[10px] text-emerald-500/80 mt-1">{globalStats.totalSuccess} Successful (2xx/3xx)</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-xl">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Failed / Errors</div>
            <div className="text-3xl font-black text-rose-400 mt-1">{globalStats.totalErr}</div>
            <div className="text-[10px] text-rose-500/80 mt-1">4xx / 5xx / Timeouts</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-xl">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Active Test Target</div>
            <div className="text-lg font-black text-purple-300 mt-1 truncate">
              {activeTest ? (activeTest === 'ALL' ? '🔥 ALL ROUTES AT ONCE' : activeTest) : 'Idle'}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Worker Pool Execution</div>
          </div>

          <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-rose-900/40 via-purple-900/30 to-slate-900 border border-rose-500/30 rounded-2xl p-4 flex flex-col justify-between shadow-2xl">
            <div className="text-[11px] font-black uppercase tracking-wider text-rose-300">MASTER LOAD TRIGGER</div>
            <button
              disabled={!!activeTest}
              onClick={runAllRoutesSimultaneously}
              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-rose-600 to-purple-600 hover:from-rose-500 hover:to-purple-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider transition shadow-xl shadow-rose-600/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Icon name="bolt" size={16} />
              {activeTest === 'ALL' ? 'TESTING ALL...' : 'TEST ALL AT ONCE'}
            </button>
            <div className="text-[10px] text-rose-300/80 text-center">Fires custom textbox loads concurrently</div>
          </div>
        </div>

        {/* Auth Credentials & Token Manager Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Icon name="lock" size={18} className="text-purple-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-white">Auth API Credentials & Bearer Token Injector</h3>
            </div>
            <button
              onClick={acquireDemoTokens}
              className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl transition shadow-md shadow-purple-600/30 cursor-pointer"
            >
              🔑 Auto-Fetch Live Bearer Tokens
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5 bg-slate-950 p-3 rounded-xl border border-slate-800">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer JWT Token:</label>
              <input
                type="text"
                value={tokens.customer}
                onChange={e => setTokens(prev => ({ ...prev, customer: e.target.value }))}
                placeholder="Bearer eyJhbGci..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono text-emerald-400 outline-none focus:border-purple-500 placeholder:text-slate-600"
              />
            </div>

            <div className="space-y-1.5 bg-slate-950 p-3 rounded-xl border border-slate-800">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vendor JWT Token:</label>
              <input
                type="text"
                value={tokens.vendor}
                onChange={e => setTokens(prev => ({ ...prev, vendor: e.target.value }))}
                placeholder="Bearer eyJhbGci..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono text-sky-400 outline-none focus:border-purple-500 placeholder:text-slate-600"
              />
            </div>

            <div className="space-y-1.5 bg-slate-950 p-3 rounded-xl border border-slate-800">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Admin JWT Token:</label>
              <input
                type="text"
                value={tokens.admin}
                onChange={e => setTokens(prev => ({ ...prev, admin: e.target.value }))}
                placeholder="Bearer eyJhbGci..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono text-purple-400 outline-none focus:border-purple-500 placeholder:text-slate-600"
              />
            </div>
          </div>
        </div>

        {/* Master Route Load Configurator Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                <Icon name="trend" size={18} className="text-purple-400" />
                <span>API Route Load Testing Table (Custom Request Count Textboxes)</span>
              </h2>
              <p className="text-xs text-slate-400">Specify custom load requests and worker count for each route, then test individually or all at once.</p>
            </div>
            <span className="text-xs text-purple-300 font-mono bg-purple-950/60 px-3 py-1 rounded-full border border-purple-500/30">
              {routes.length} Target Routes Configured
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-950/60">
                  <th className="p-3">Route Endpoint</th>
                  <th className="p-3">Auth Requirement</th>
                  <th className="p-3 w-32">How Many Requests (Total Load)</th>
                  <th className="p-3 w-32">Concurrency (Workers)</th>
                  <th className="p-3 w-28">Delay (ms)</th>
                  <th className="p-3">Live Latency Sparkline</th>
                  <th className="p-3">Stats & Status (2xx / Err)</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                {routes.map(route => {
                  const stats = routeStats[route.id] || { total: 0, status2xx: 0, status4xx: 0, status5xx: 0, history: [], avg: 0, min: 0, max: 0 };
                  const isRunning = activeTest === route.id || activeTest === 'ALL';

                  return (
                    <tr key={route.id} className={`hover:bg-slate-800/40 transition ${isRunning ? 'bg-purple-950/20' : ''}`}>
                      
                      {/* Endpoint Name & Path */}
                      <td className="p-3">
                        <div className="font-bold text-white leading-snug">{route.name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                            route.method === 'GET' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                            route.method === 'POST' ? 'bg-sky-500/20 text-sky-400 border-sky-500/30' :
                            'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          }`}>
                            {route.method}
                          </span>
                          <span className="text-[11px] text-purple-300 truncate max-w-xs">{route.path}</span>
                        </div>
                      </td>

                      {/* Auth Type Badge */}
                      <td className="p-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          route.authType === 'NONE' ? 'bg-slate-800 text-slate-400 border-slate-700' :
                          route.authType === 'CUSTOMER' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                          route.authType === 'VENDOR' ? 'bg-sky-500/20 text-sky-400 border-sky-500/30' :
                          'bg-purple-500/20 text-purple-400 border-purple-500/30'
                        }`}>
                          {route.authType}
                        </span>
                      </td>

                      {/* How Many Requests Textbox */}
                      <td className="p-3">
                        <input
                          type="number"
                          value={route.iterations}
                          onChange={e => handleRouteConfigChange(route.id, 'iterations', e.target.value)}
                          min="1"
                          max="50000"
                          className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-emerald-400 outline-none focus:border-purple-500"
                        />
                      </td>

                      {/* Concurrency Workers Textbox */}
                      <td className="p-3">
                        <input
                          type="number"
                          value={route.concurrency}
                          onChange={e => handleRouteConfigChange(route.id, 'concurrency', e.target.value)}
                          min="1"
                          max="1000"
                          className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-purple-300 outline-none focus:border-purple-500"
                        />
                      </td>

                      {/* Delay ms Textbox */}
                      <td className="p-3">
                        <input
                          type="number"
                          value={route.delayMs}
                          onChange={e => handleRouteConfigChange(route.id, 'delayMs', e.target.value)}
                          min="0"
                          max="10000"
                          className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-slate-300 outline-none focus:border-purple-500"
                        />
                      </td>

                      {/* Sparkline Latency Graph */}
                      <td className="p-3">
                        <Sparkline history={stats.history} width={130} height={35} />
                      </td>

                      {/* Live Execution Stats */}
                      <td className="p-3">
                        <div className="space-y-1">
                          <div className="text-[11px]">
                            Sent: <strong className="text-white">{stats.total}</strong> / {route.iterations}
                          </div>
                          <div className="flex items-center gap-2 text-[10px]">
                            <span className="text-emerald-400 font-bold">2xx: {stats.status2xx}</span>
                            <span className="text-rose-400 font-bold">Err: {stats.status4xx + stats.status5xx}</span>
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => executeSingleRequest(route)}
                            title="Send 1 request"
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition cursor-pointer"
                          >
                            <Icon name="send" size={14} />
                          </button>
                          <button
                            disabled={isRunning}
                            onClick={() => runRouteLoadTest(route)}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition shadow-md shadow-purple-600/30 flex items-center gap-1 cursor-pointer"
                          >
                            <Icon name="bolt" size={14} />
                            {isRunning ? 'Running' : 'Test Load'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Real-Time Request Terminal Execution Log */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-2xl">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Icon name="automation" size={16} className="text-purple-400" />
              <span>Real-Time Request Execution Log Terminal</span>
            </h3>
            <span className="text-[10px] font-mono text-slate-500">{logs.length} Log Entries</span>
          </div>

          <div
            ref={logTerminalRef}
            className="bg-slate-950 border border-slate-800 rounded-xl p-3 h-48 overflow-y-auto font-mono text-[11px] space-y-1.5"
          >
            {logs.length === 0 ? (
              <div className="text-slate-600 text-center py-14">
                Terminal ready · Enter custom request numbers in the textboxes above and click TEST LOAD
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-center justify-between py-0.5 border-b border-slate-900/60 last:border-0">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-slate-500 text-[10px]">{log.timestamp}</span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                      log.status >= 200 && log.status < 300 ? 'bg-emerald-500/20 text-emerald-400' :
                      log.status >= 400 && log.status < 500 ? 'bg-amber-500/20 text-amber-400' :
                      'bg-rose-500/20 text-rose-400'
                    }`}>
                      {log.status || 'ERR'}
                    </span>
                    <span className="font-bold text-slate-300">{log.method}</span>
                    <span className="text-purple-300 truncate max-w-xs">{log.path}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-slate-400">{log.latency}ms</span>
                    <span className="text-slate-500">{log.payloadSize}B</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </main>
    </div>
  );
}
