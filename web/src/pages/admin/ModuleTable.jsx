import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { StatusChip } from '../../components/ui.jsx';
import EventWorkspace from './EventWorkspace.jsx';

/**
 * Generic Core module table screen (Customers / Vendors / Events / Bookings /
 * Payments / Operations / Reports / Settings) matching the Complete Screen
 * Set layout: search + add button, status tabs + filters, data table with
 * status chips, pagination. 
 * 
 *  data until business modules land.
 */
const MODULE_DATA = {
  customers: {
    title: 'Customers', add: '+ Add Customer',
    tabs: ['All', 'Active', 'Inactive'], filters: ['Event Type', 'Date Range'],
    columns: ['Name', 'Phone', 'Email', 'Events', 'Status'],
    rows: [
      ['Anil Verma', '+91 98765 43210', 'anil@example.com', '2', 'Active'],
      ['Priya Sharma', '+91 91234 56789', 'priya@example.com', '1', 'Active'],
      ['Rohan Mehta', '+91 98107 76455', 'rohan@example.com', '3', 'Active'],
      ['Sneha Kapoor', '+91 98107 33445', 'sneha@example.com', '0', 'Inactive'],
      ['Karan Malhotra', '+91 90210 34567', 'karan@example.com', '1', 'Active'],
      ['Aditi Singh', '+91 90876 54321', 'aditi@example.com', '4', 'Active'],
      ['Vikram Joshi', '+91 98761 23456', 'vikram@example.com', '1', 'Active'],
      ['Neha Bansal', '+91 91234 99076', 'neha@example.com', '2', 'Active'],
    ],
    total: 234, pages: 30,
  },
  vendors: {
    title: 'Vendors', add: '+ Add Vendor',
    tabs: ['All', 'Verified', 'Pending', 'Rejected'], filters: ['Category', 'Location'],
    columns: ['Name', 'Category', 'Location', 'Status'],
    rows: [
      ['Studio Pixel', 'Photography', 'Kolkata', 'Verified'],
      ['Makeup by Riya', 'Makeup', 'Delhi', 'Verified'],
      ['Royal Caterers', 'Catering', 'Kolkata', 'Pending'],
      ['Elegance Events', 'Decoration', 'Delhi', 'Verified'],
      ['DJ NightPro', 'DJ / Production', 'Kolkata', 'Verified'],
      ['RideEasy Transport', 'Transport', 'Kolkata', 'Verified'],
      ['The Grand Venue', 'Venue', 'Kolkata', 'Pending'],
      ['Style Hub', 'Bridal Wear', 'Delhi', 'Verified'],
    ],
    total: 1482, pages: 186,
  },
  events: {
    title: 'Events', add: '+ Create Event',
    tabs: ['All', 'Planning', 'Confirmed', 'In Progress', 'Completed'], filters: ['Event Type'],
    columns: ['Event Name', 'Customer', 'Date', 'Location', 'Status'],
    rows: [
      ['Riya & Arjun Wedding', 'Priya Sharma', '26 Nov 2025', 'Kolkata', 'Planning'],
      ['Mehta Corporate Event', 'Mehta Group', '18 Jan 2026', 'Delhi', 'Confirmed'],
      ["Ananya's Birthday", 'Ananya Gupta', '5 Feb 2026', 'Kolkata', 'In Progress'],
      ['Sharma Anniversary', 'Vivek Sharma', '20 Feb 2026', 'Delhi', 'Planning'],
      ['TechConf 2026', 'Amit Jain', '12 Mar 2026', 'Bengaluru', 'Planning'],
      ['Kulkarni Wedding', 'Nikhil Kulkarni', '3 Apr 2026', 'Mumbai', 'Confirmed'],
      ['Verma Reception', 'Rohit Verma', '10 Apr 2026', 'Delhi', 'Planning'],
      ['Iyer Family Function', 'Suresh Iyer', '18 Apr 2026', 'Chennai', 'Planning'],
    ],
    total: 892, pages: 112,
  },
  bookings: {
    title: 'Bookings', add: '+ New Booking',
    tabs: ['All', 'Pending', 'Confirmed', 'In Progress', 'Completed'], filters: [],
    columns: ['Event', 'Service', 'Vendor', 'Amount', 'Status'],
    rows: [
      ['Riya & Arjun Wedding', 'Photography', 'Studio Pixel', '₹85,000', 'Confirmed'],
      ['Riya & Arjun Wedding', 'Catering', 'Royal Caterers', '₹2,40,000', 'Pending'],
      ['Mehta Corporate Event', 'Venue', 'The Grand Venue', '₹3,50,000', 'Confirmed'],
      ["Ananya's Birthday", 'Decoration', 'Elegance Events', '₹75,000', 'In Progress'],
      ['Sharma Anniversary', 'Makeup', 'Makeup by Riya', '₹45,000', 'Confirmed'],
      ['TechConf 2026', 'AV Production', 'DJ NightPro', '₹1,20,000', 'Pending'],
      ['Kulkarni Wedding', 'Transport', 'RideEasy', '₹60,000', 'Confirmed'],
      ['Verma Reception', 'Photography', 'Lens Story', '₹70,000', 'Confirmed'],
    ],
    total: 1024, pages: 128,
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
    rows: [
      ['Riya & Arjun Wedding', 'Priya Sharma', '₹1,00,000', 'Verified', '12 Sep 2025'],
      ['Mehta Corporate Event', 'Mehta Group', '₹2,50,000', 'Verified', '10 Sep 2025'],
      ["Ananya's Birthday", 'Ananya Gupta', '₹50,000', 'Pending', '9 Sep 2025'],
      ['Sharma Anniversary', 'Vivek Sharma', '₹75,000', 'Verified', '8 Sep 2025'],
      ['TechConf 2026', 'Amit Jain', '₹1,20,000', 'Verified', '7 Sep 2025'],
    ],
    total: 342, pages: 69,
  },
  operations: {
    title: 'Automation & Operations', add: '+ Create Rule',
    tabs: ['Workflows', 'Queue', 'Logs', 'Retry', 'Alerts'], filters: [],
    columns: ['Event', 'Trigger', 'Status', 'Last Run'],
    rows: [
      ['Booking Confirmation', 'Booking created', 'Active', '2 min ago'],
      ['Payment Verification', 'Payment success', 'Active', '5 min ago'],
      ['Vendor Notification', 'New opportunity', 'Active', '10 min ago'],
      ['Completion Review', 'Completion submitted', 'Active', '15 min ago'],
      ['Settlement Process', 'Completion verified', 'Active', '22 min ago'],
      ['Customer Reminder', 'Event date - 7 days', 'Active', '1 hour ago'],
    ],
    total: 24, pages: 3,
  },
  reports: {
    title: 'Reports & Analytics', add: '⇩ Export',
    tabs: [], filters: ['Last 30 Days', 'All Event Types'],
    statRow: [
      ['1,248', 'New Customers', '+20%'], ['342', 'Bookings', '+18%'],
      ['₹1.24Cr', 'Revenue', '+22%'], ['4.8/5', 'Avg Rating', '+0.3'],
    ],
    columns: ['Report', 'Period', 'Generated', 'Status'],
    rows: [
      ['Revenue Summary', 'Aug 2025', '1 Sep 2025', 'Completed'],
      ['Vendor Performance', 'Aug 2025', '1 Sep 2025', 'Completed'],
      ['Refund Analysis', 'Aug 2025', '1 Sep 2025', 'Completed'],
    ],
    total: 12, pages: 2,
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

  if (kind === 'events' && selectedEventWorkspace) {
    return <EventWorkspace onBack={() => setSelectedEventWorkspace(null)} />;
  }

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
      <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
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
            {m.rows.map((row, i) => (
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
                    {typeof cell === 'string' && ['Active','Verified','Confirmed','Completed','Planning','Pending','Scheduled','In Progress','Inactive','Rejected','Cancelled'].includes(cell) ? (
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
        <div className="flex items-center justify-between px-5 py-3 text-xs text-muted">
          <span>Showing 1–{m.rows.length} of {m.total}</span>
          <div className="flex items-center gap-1">
            <button className="w-7 h-7 grid place-items-center rounded-lg hover:bg-lavender" aria-label="Previous page">
              <Icon name="chevronLeft" size={13} />
            </button>
            <button className="w-7 h-7 grid place-items-center rounded-lg bg-primary text-white font-bold">1</button>
            <button className="w-7 h-7 grid place-items-center rounded-lg hover:bg-lavender">2</button>
            <button className="w-7 h-7 grid place-items-center rounded-lg hover:bg-lavender">3</button>
            <span className="px-1">…</span>
            <button className="w-7 h-7 grid place-items-center rounded-lg hover:bg-lavender">{m.pages}</button>
            <button className="w-7 h-7 grid place-items-center rounded-lg hover:bg-lavender" aria-label="Next page">
              <Icon name="chevronRight" size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
