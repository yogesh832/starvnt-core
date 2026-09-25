import { useState, useEffect } from 'react';
import { adminApi } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { StatusChip } from '../../components/ui.jsx';
import EventWorkspace from './EventWorkspace.jsx';

/**
 * Generic Core module table screen (Customers / Vendors / Events / Bookings /
 * Payments / Operations / Reports / Settings) matching the Complete Screen
 * Set layout: search + add button, status tabs + filters, data table with
 * status chips, pagination. 
 * 
 * Uses dummy structure by default, but fetches real API data when available.
 */
const MODULE_DATA = {
  customers: {
    title: 'Customers', add: '+ Add Customer',
    tabs: ['All', 'Active', 'Inactive'], filters: ['Event Type', 'Date Range'],
    columns: ['Name', 'Phone', 'Email', 'Events', 'Status'],
    rows: [],
    total: 0, pages: 1,
  },
  vendors: {
    title: 'Vendors', add: '+ Add Vendor',
    tabs: ['All', 'Verified', 'Pending', 'Rejected'], filters: ['Category', 'Location'],
    columns: ['Name', 'Email', 'Phone', 'Status'],
    rows: [],
    total: 0, pages: 1,
  },
  events: {
    title: 'Events', add: '+ Create Event',
    tabs: ['All', 'Planning', 'Confirmed', 'In Progress', 'Completed'], filters: ['Event Type'],
    columns: ['Event Name', 'Customer', 'Date', 'Location', 'Status'],
    rows: [],
    total: 0, pages: 1,
  },
  bookings: {
    title: 'Bookings', add: '+ New Booking',
    tabs: ['All', 'Pending', 'Confirmed', 'In Progress', 'Completed'], filters: [],
    columns: ['Reference', 'Service', 'Vendor', 'Amount', 'Execution', 'Settlement'],
    rows: [],
    total: 0, pages: 1,
  },
  payments: {
    title: 'Payments & Settlements', add: null,
    tabs: ['Customer Payments', 'Vendor Settlements', 'Refunds'], filters: [],
    stats: [
      { label: 'Total Collected', value: '₹1,24,50,000', foot: '+22% this month', iconBg: 'bg-primary-soft text-primary', icon: 'payments' },
      { label: 'Held in Escrow', value: '₹86,20,000', foot: '70% of collected', iconBg: 'bg-orange-50 text-orange-500', icon: 'wallet' },
      { label: 'Released to Vendors', value: '₹28,30,000', foot: '+18% this month', iconBg: 'bg-emerald-50 text-emerald-600', icon: 'trend' },
    ],
    columns: ['Event', 'Customer', 'Amount', 'Status', 'Date'],
    rows: [],
    total: 0, pages: 1,
  },
  operations: {
    title: 'Automation & Operations', add: '+ Create Rule',
    tabs: ['Workflows', 'Queue', 'Logs', 'Retry', 'Alerts'], filters: [],
    columns: ['Event', 'Trigger', 'Status', 'Last Run'],
    rows: [],
    total: 0, pages: 1,
  },
  reports: {
    title: 'Reports & Analytics', add: '⇩ Export',
    tabs: [], filters: ['Last 30 Days', 'All Event Types'],
    statRow: [
      ['1,248', 'New Customers', '+20%'], ['342', 'Bookings', '+18%'],
      ['₹1.24Cr', 'Revenue', '+22%'], ['4.8/5', 'Avg Rating', '+0.3'],
    ],
    columns: ['Report', 'Period', 'Generated', 'Status'],
    rows: [],
    total: 0, pages: 1,
  },
  settings: {
    title: 'Settings', add: null, tabs: [], filters: [],
    columns: ['Setting', 'Value', 'Updated'],
    rows: [
      ['Platform Name', 'STARVNT', '—'],
      ['Support Email', 'support@starvnt.com', '—'],
      ['Timezone', 'Asia/Kolkata', '—'],
      ['Default Currency', 'INR — Indian Rupee', '—'],
    ],
    total: 4, pages: 1,
  },
};

export default function ModuleTable({ kind }) {
  const m = MODULE_DATA[kind];
  const [tab, setTab] = useState(m.tabs[0] || '');
  const [selectedEventWorkspace, setSelectedEventWorkspace] = useState(null);

  const [apiData, setApiData] = useState({ rows: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 10;

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    let endpoint = '';
    if (kind === 'vendors') endpoint = `/external-users/vendors?limit=${limit}&skip=${(page - 1) * limit}`;
    else if (kind === 'customers') endpoint = `/external-users/customers?limit=${limit}&skip=${(page - 1) * limit}`;
    else if (kind === 'bookings') endpoint = `/operations/bookings`;

    if (endpoint) {
      adminApi.call(endpoint)
        .then(res => {
          if (!isMounted || !res.ok) return;
          let mappedRows = [];
          let totalItems = res.total || res.count || 0;
          
          if (kind === 'vendors' && res.vendors) {
            mappedRows = res.vendors.map(v => [
              v.fullName || '—', 
              v.email || '—', 
              v.phone || '—', 
              v.status || 'Active'
            ]);
          } else if (kind === 'customers' && res.customers) {
            mappedRows = res.customers.map(c => [
              c.fullName || '—',
              c.phone || '—',
              c.email || '—',
              '0',
              c.status || 'Active'
            ]);
          } else if (kind === 'bookings' && res.bookings) {
            mappedRows = res.bookings.map(b => [
              b.bookingReference || '—',
              b.category || '—',
              b.vendorName || '—',
              `₹${b.totalAmount || 0}`,
              b.executionStatus || '—',
              b.settlementStatus || '—'
            ]);
          }

          setApiData({
            rows: mappedRows,
            total: totalItems,
            pages: Math.max(1, Math.ceil(totalItems / limit))
          });
        })
        .catch(console.error)
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else {
      // Fallback for unimplemented API endpoints
      setApiData({ rows: m.rows, total: m.total, pages: m.pages });
      setLoading(false);
    }

    return () => { isMounted = false; };
  }, [kind, page, tab]);

  if (kind === 'events' && selectedEventWorkspace) {
    return <EventWorkspace onBack={() => setSelectedEventWorkspace(null)} />;
  }

  const currentRows = apiData.rows;
  const currentTotal = apiData.total;
  const currentPages = apiData.pages;

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold mr-auto">{m.title}</h1>
        <div className="flex items-center gap-2 bg-white rounded-xl px-3.5 py-2 text-sm text-muted shadow-sm w-full sm:w-72">
          <Icon name="search" size={15} />
          <input className="bg-transparent flex-1 outline-none placeholder:text-muted/70" placeholder={`Search ${m.title.toLowerCase()}...`} />
        </div>
        {m.add && (
          <button className="rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-4 py-2.5 transition whitespace-nowrap">
            {m.add}
          </button>
        )}
      </div>

      {/* Payments-style stat row */}
      {m.stats && (
        <div className="grid sm:grid-cols-3 gap-3.5">
          {m.stats.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${s.iconBg}`}><Icon name={s.icon} size={18} /></div>
              <div>
                <div className="text-lg font-extrabold">{s.value}</div>
                <div className="text-[11px] text-muted">{s.label}</div>
                <div className="text-[10px] text-emerald-600 font-medium">{s.foot}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {m.statRow && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {m.statRow.map(([v, l, d]) => (
            <div key={l} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-xl font-extrabold">{v}</div>
              <div className="text-xs text-muted">{l}</div>
              <div className="text-[11px] text-emerald-600 font-medium mt-1">{d}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs + filters */}
      {(m.tabs.length > 0 || m.filters.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {m.tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs font-semibold rounded-full px-3.5 py-1.5 transition ${
                tab === t ? 'bg-primary text-white' : 'bg-white text-ink/60 hover:bg-primary-soft hover:text-primary'
              }`}
            >
              {t}
            </button>
          ))}
          {m.filters.map((f) => (
            <button
              key={f}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-white rounded-full px-3.5 py-1.5 text-ink/60 hover:bg-lavender transition"
            >
              <span>{f}</span>
              <Icon name="chevronDown" size={11} className="text-muted" />
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-x-auto relative min-h-[200px]">
        {loading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] grid place-items-center z-10">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
        <table className="w-full text-[13px] min-w-[560px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted border-b border-gray-100">
              {m.columns.map((c) => (
                <th key={c} className="px-5 py-3 font-semibold">{c}</th>
              ))}
              <th className="px-5 py-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentRows.length === 0 && !loading && (
              <tr>
                <td colSpan={m.columns.length + 1} className="px-5 py-8 text-center text-muted">
                  No records found.
                </td>
              </tr>
            )}
            {currentRows.map((row, i) => (
              <tr
                key={i}
                onClick={() => {
                  if (kind === 'events') setSelectedEventWorkspace(row[0]);
                }}
                className={`border-b border-gray-50 last:border-0 hover:bg-lavender/40 transition ${
                  kind === 'events' ? 'cursor-pointer' : ''
                }`}
              >
                {row.map((cell, j) => (
                  <td key={j} className="px-5 py-3">
                    {typeof cell === 'string' && ['Active','Verified','Confirmed','Completed','Planning','Pending','Scheduled','In Progress','Inactive','Rejected','Cancelled','NOT_STARTED','SERVICE_SCHEDULED','SERVICE_STARTED','COMPLETION_SUBMITTED','COMPLETION_VERIFIED','NOT_ELIGIBLE','SETTLEMENT_ELIGIBLE','SETTLEMENT_HOLD','SETTLED'].includes(cell) ? (
                      <StatusChip status={cell} />
                    ) : (
                      <span className={j === 0 ? (kind === 'events' ? 'font-bold text-primary hover:underline' : 'font-semibold') : 'text-ink/70'}>
                        {cell}
                      </span>
                    )}
                  </td>
                ))}
                <td className="px-5 py-3 text-right text-muted">
                  <button className="p-1 rounded-lg hover:bg-lavender text-muted hover:text-navy inline-flex items-center justify-center">
                    <Icon name="dotsVertical" size={15} strokeWidth={2.5} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {currentTotal > 0 && (
          <div className="flex items-center justify-between px-5 py-3 text-xs text-muted">
            <span>Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, currentTotal)} of {currentTotal}</span>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-7 h-7 grid place-items-center rounded-lg hover:bg-lavender disabled:opacity-50" 
                aria-label="Previous page">
                <Icon name="chevronLeft" size={13} />
              </button>
              <button className="w-7 h-7 grid place-items-center rounded-lg bg-primary text-white font-bold">{page}</button>
              {page < currentPages && (
                 <button onClick={() => setPage(p => p + 1)} className="w-7 h-7 grid place-items-center rounded-lg hover:bg-lavender">{page + 1}</button>
              )}
              {page + 1 < currentPages && (
                 <button onClick={() => setPage(p => p + 2)} className="w-7 h-7 grid place-items-center rounded-lg hover:bg-lavender">{page + 2}</button>
              )}
              {page + 2 < currentPages && <span className="px-1">…</span>}
              {page + 2 < currentPages && (
                 <button onClick={() => setPage(currentPages)} className="w-7 h-7 grid place-items-center rounded-lg hover:bg-lavender">{currentPages}</button>
              )}
              <button 
                onClick={() => setPage(p => Math.min(currentPages, p + 1))}
                disabled={page === currentPages}
                className="w-7 h-7 grid place-items-center rounded-lg hover:bg-lavender disabled:opacity-50" 
                aria-label="Next page">
                <Icon name="chevronRight" size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
