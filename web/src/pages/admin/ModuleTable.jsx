import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminApi } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { StatusChip } from '../../components/ui.jsx';
import EventWorkspace from './EventWorkspace.jsx';
import CouponModal from './CouponModal.jsx';
import BookingDetailModal from './BookingDetailModal.jsx';

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
    columns: ['Business', 'Category', 'Location', 'KYC', 'Status'],
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
    title: 'Bookings', add: null,
    tabs: ['All', 'Pending', 'Confirmed', 'In Progress', 'Completed', 'Disputed'], filters: [],
    columns: ['Reference', 'Customer', 'Vendor', 'Service', 'Date & City', 'Amount', 'Payment', 'Execution', 'Settlement'],
    rows: [],
    total: 0, pages: 1,
  },
  payments: {
    title: 'Payments & Settlements', add: null,
    tabs: ['Customer Payments', 'Vendor Settlements', 'Refunds'], filters: [],
    stats: [
      { label: 'Total Collected', value: '₹0', foot: '0% this month', iconBg: 'bg-primary-soft text-primary', icon: 'payments' },
      { label: 'Held in Escrow', value: '₹0', foot: '0% of collected', iconBg: 'bg-orange-50 text-orange-500', icon: 'wallet' },
      { label: 'Released to Vendors', value: '₹0', foot: '0% this month', iconBg: 'bg-emerald-50 text-emerald-600', icon: 'trend' },
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
      ['0', 'New Customers', '0%'], ['0', 'Bookings', '0%'],
      ['₹0', 'Revenue', '0%'], ['0/5', 'Avg Rating', '0'],
    ],
    columns: ['Report', 'Period', 'Generated', 'Status'],
    rows: [],
    total: 0, pages: 1,
  },

  coupons: {
    title: 'Coupons', add: '+ Add Coupon',
    tabs: ['All', 'Active', 'Expired'], filters: ['Discount Type'],
    columns: ['Code', 'Type', 'Value', 'Min Order', 'Valid Until', 'Usage', 'Status'],
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
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get('search') || '';
  const urlTab = searchParams.get('tab') || '';

  const [tab, setTab] = useState(urlTab || m.tabs[0] || '');
  const [search, setSearch] = useState(urlSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(urlSearch);

  const [selectedEventWorkspace, setSelectedEventWorkspace] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Bookings-specific filters and modals
  const [selectedBookingForDetail, setSelectedBookingForDetail] = useState(null);
  const [bookingVendorFilter, setBookingVendorFilter] = useState('All');
  const [bookingCategoryFilter, setBookingCategoryFilter] = useState('All');
  const [bookingCityFilter, setBookingCityFilter] = useState('All');
  const [bookingMeta, setBookingMeta] = useState({
    vendorsList: [],
    categoriesList: [],
    citiesList: [],
    stats: null,
  });

  const [apiData, setApiData] = useState({ rows: [], total: 0, pages: 1, raw: [] });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 10;

  // Sync debounced search query and reflect into URL search param
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (search.trim()) {
          next.set('search', search.trim());
        } else {
          next.delete('search');
        }
        return next;
      }, { replace: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [search, setSearchParams]);

  // Keep search in sync if URL search param changes from topbar or navigation
  useEffect(() => {
    if (urlSearch !== search) {
      setSearch(urlSearch);
      setDebouncedSearch(urlSearch);
      setPage(1);
    }
  }, [urlSearch]);

  function handleTabChange(t) {
    setTab(t);
    setPage(1);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (t && t !== 'All') {
        next.set('tab', t);
      } else {
        next.delete('tab');
      }
      return next;
    }, { replace: true });
  }

  async function handleVendorVerification(vendor, approved) {
    if (!vendor?._id) return;
    const action = approved ? 'approve' : 'reject';
    if (!window.confirm(`${approved ? 'Approve' : 'Reject'} verification for ${vendor.businessName || 'this vendor'}?`)) return;
    try {
      setLoading(true);
      await adminApi.call(`/external-users/organizations/${vendor._id}/verification`, {
        method: 'POST',
        body: {
          approved,
          notes: approved ? 'Approved from admin Vendors panel.' : 'Rejected from admin Vendors panel.',
        },
      });
      setPage((p) => p);
      window.location.reload();
    } catch (e) {
      alert(e.message || `Failed to ${action} vendor`);
      setLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const searchParam = debouncedSearch.trim() ? `&search=${encodeURIComponent(debouncedSearch.trim())}` : '';
    const tabParam = tab && tab !== 'All' ? `&tab=${encodeURIComponent(tab)}` : '';
    const skip = (page - 1) * limit;

    let endpoint = '';
    if (kind === 'vendors') {
      endpoint = `/external-users/organizations?limit=${limit}&skip=${skip}${searchParam}${tabParam}`;
    } else if (kind === 'customers') {
      endpoint = `/external-users/customers?limit=${limit}&skip=${skip}${searchParam}${tabParam}`;
    } else if (kind === 'bookings') {
      const vParam = bookingVendorFilter && bookingVendorFilter !== 'All' ? `&vendorId=${encodeURIComponent(bookingVendorFilter)}` : '';
      const cParam = bookingCategoryFilter && bookingCategoryFilter !== 'All' ? `&category=${encodeURIComponent(bookingCategoryFilter)}` : '';
      const cityParam = bookingCityFilter && bookingCityFilter !== 'All' ? `&city=${encodeURIComponent(bookingCityFilter)}` : '';
      endpoint = `/operations/bookings?limit=${limit}&skip=${skip}${searchParam}${tabParam}${vParam}${cParam}${cityParam}`;
    } else if (kind === 'coupons') {
      endpoint = `/coupons?limit=${limit}&skip=${skip}${searchParam}${tabParam}`;
    }

    if (endpoint) {
      adminApi.call(endpoint)
        .then(res => {
          if (!isMounted || !res.ok) return;
          let mappedRows = [];
          let totalItems = res.total ?? res.count ?? 0;

          if (kind === 'coupons' && res.coupons) {
            mappedRows = res.coupons.map(c => [
              c.code,
              c.discountType,
              c.discountValue,
              '₹' + (c.minOrderAmount || 0),
              c.validUntil ? new Date(c.validUntil).toLocaleDateString() : 'Never',
              `${c.usageCount || 0} / ${c.usageLimit || '∞'}`,
              c.isActive ? 'Active' : 'Inactive',
            ]);
          }
          if (kind === 'bookings' && res.bookings) {
            if (res.vendorsList || res.categoriesList || res.citiesList || res.stats) {
              setBookingMeta({
                vendorsList: res.vendorsList || [],
                categoriesList: res.categoriesList || [],
                citiesList: res.citiesList || [],
                stats: res.stats || null,
              });
            }
            mappedRows = res.bookings.map(b => [
              b.bookingReference || b.bookingId || b._id?.slice(-8) || '—',
              b.customerName || 'Customer',
              b.vendorName || b.vendor?.name || 'Vendor',
              `${b.serviceName || b.serviceType || 'Service'}${b.category ? ` (${b.category})` : ''}`,
              `${b.eventDate ? new Date(b.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date TBD'}${b.serviceLocation?.city ? ` · ${b.serviceLocation.city}` : ''}`,
              '₹' + Number(b.totalAmount || 0).toLocaleString('en-IN'),
              b.paymentStatus || 'PENDING',
              b.executionStatus || 'NOT_STARTED',
              b.settlementStatus || 'NOT_ELIGIBLE',
            ]);
          }
          if (kind === 'vendors' && res.organizations) {
            mappedRows = res.organizations.map(v => [
              v.businessName || '—',
              v.category || '—',
              v.location || '—',
              v.verification?.isVerified ? 'Verified' : 'Pending',
              v.status || 'PENDING'
            ]);
          }
          if (kind === 'customers' && res.customers) {
            mappedRows = res.customers.map(cu => [
              cu.fullName || '—',
              cu.phone || '—',
              cu.email || '—',
              '0',
              'ACTIVE'
            ]);
          }
          setApiData({
            rows: mappedRows,
            raw: res.organizations || res.coupons || res.bookings || res.customers || res.users || [],
            total: totalItems,
            pages: Math.ceil(totalItems / limit) || 1,
          });
        })
        .catch(console.error)
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else {
      // Fallback for mock/unimplemented API endpoints
      let rows = m.rows;
      if (debouncedSearch.trim()) {
        const q = debouncedSearch.trim().toLowerCase();
        rows = rows.filter(r => r.some(cell => String(cell).toLowerCase().includes(q)));
      }
      setApiData({ rows, total: rows.length, pages: Math.ceil(rows.length / limit) || 1, raw: [] });
      setLoading(false);
    }

    return () => { isMounted = false; };
  }, [kind, page, tab, debouncedSearch, bookingVendorFilter, bookingCategoryFilter, bookingCityFilter]);

  if (kind === 'events' && selectedEventWorkspace) {
    return <EventWorkspace onBack={() => setSelectedEventWorkspace(null)} />;
  }

  const isServerFiltered = ['vendors', 'customers', 'coupons', 'bookings'].includes(kind);
  const filteredRows = (!isServerFiltered && debouncedSearch.trim())
    ? apiData.rows.filter((row) =>
        row.some((cell) => String(cell).toLowerCase().includes(debouncedSearch.trim().toLowerCase()))
      )
    : apiData.rows;

  const currentRows = filteredRows;
  const currentTotal = (!isServerFiltered && debouncedSearch.trim()) ? filteredRows.length : apiData.total;
  const currentPages = (!isServerFiltered && debouncedSearch.trim()) ? Math.ceil(filteredRows.length / limit) || 1 : apiData.pages;

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold mr-auto">{m.title}</h1>
        <div className="flex items-center gap-2 bg-white rounded-xl px-3.5 py-2 text-sm text-muted shadow-sm w-full sm:w-72">
          <Icon name="search" size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent flex-1 outline-none placeholder:text-muted/70 text-navy"
            placeholder={`Search ${m.title.toLowerCase()}...`}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-muted hover:text-navy text-xs font-bold px-1 cursor-pointer"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        {m.add && (
          <button onClick={() => { if (kind === 'coupons') setShowAddModal(true); }} className="rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-4 py-2.5 transition whitespace-nowrap">
            {m.add}
          </button>
        )}
      </div>

      {/* Bookings KPI Stats Cards */}
      {kind === 'bookings' && bookingMeta.stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-primary-soft text-primary">
              <Icon name="wallet" size={18} />
            </div>
            <div>
              <div className="text-base sm:text-lg font-extrabold text-navy">₹{Number(bookingMeta.stats.totalGmv || 0).toLocaleString('en-IN')}</div>
              <div className="text-[11px] text-muted">Platform GMV</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-blue-50 text-blue-600">
              <Icon name="bookings" size={18} />
            </div>
            <div>
              <div className="text-base sm:text-lg font-extrabold text-navy">{bookingMeta.stats.totalBookings || 0}</div>
              <div className="text-[11px] text-muted">Total Bookings</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-violet-50 text-violet-600">
              <Icon name="operations" size={18} />
            </div>
            <div>
              <div className="text-base sm:text-lg font-extrabold text-navy">{bookingMeta.stats.inProgressCount || 0}</div>
              <div className="text-[11px] text-muted">In Progress</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-emerald-50 text-emerald-600">
              <Icon name="check" size={18} />
            </div>
            <div>
              <div className="text-base sm:text-lg font-extrabold text-navy">{bookingMeta.stats.completedCount || 0}</div>
              <div className="text-[11px] text-muted">Completed</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3 col-span-2 sm:col-span-1">
            <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-amber-50 text-amber-600">
              <Icon name="payments" size={18} />
            </div>
            <div>
              <div className="text-base sm:text-lg font-extrabold text-navy">{bookingMeta.stats.pendingPaymentCount || 0}</div>
              <div className="text-[11px] text-muted">Pending Payment</div>
            </div>
          </div>
        </div>
      )}

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

      {/* Tabs */}
      {(m.tabs.length > 0 || m.filters.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {m.tabs.map((t) => (
            <button
              key={t}
              onClick={() => handleTabChange(t)}
              className={`text-xs font-semibold rounded-full px-3.5 py-1.5 transition cursor-pointer ${
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

      {/* Bookings Dedicated Multi-Filter Bar (Vendor-to-Vendor, Category, City, Reset) */}
      {kind === 'bookings' && (
        <div className="flex flex-wrap items-center gap-2.5 bg-white p-3 rounded-2xl shadow-sm border border-gray-100">
          <div className="text-xs font-bold text-navy flex items-center gap-1.5 mr-1">
            <Icon name="search" size={13} className="text-primary" />
            <span>Filters:</span>
          </div>

          {/* Vendor Filter Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs">
            <span className="text-muted font-medium">Vendor:</span>
            <select
              value={bookingVendorFilter}
              onChange={(e) => {
                setBookingVendorFilter(e.target.value);
                setPage(1);
              }}
              className="bg-transparent font-semibold text-navy outline-none cursor-pointer max-w-[170px] truncate"
            >
              <option value="All">All Vendors</option>
              {bookingMeta.vendorsList.map((v) => (
                <option key={v.id || v.name} value={v.id || v.name}>
                  {v.name} ({v.count})
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter Dropdown */}
          {bookingMeta.categoriesList.length > 0 && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs">
              <span className="text-muted font-medium">Category:</span>
              <select
                value={bookingCategoryFilter}
                onChange={(e) => {
                  setBookingCategoryFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent font-semibold text-navy outline-none cursor-pointer max-w-[140px] truncate"
              >
                <option value="All">All Categories</option>
                {bookingMeta.categoriesList.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* City Filter Dropdown */}
          {bookingMeta.citiesList.length > 0 && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs">
              <span className="text-muted font-medium">City:</span>
              <select
                value={bookingCityFilter}
                onChange={(e) => {
                  setBookingCityFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent font-semibold text-navy outline-none cursor-pointer max-w-[130px] truncate"
              >
                <option value="All">All Cities</option>
                {bookingMeta.citiesList.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Clear all filters */}
          {(bookingVendorFilter !== 'All' || bookingCategoryFilter !== 'All' || bookingCityFilter !== 'All' || search || (tab && tab !== 'All')) && (
            <button
              type="button"
              onClick={() => {
                setBookingVendorFilter('All');
                setBookingCategoryFilter('All');
                setBookingCityFilter('All');
                setSearch('');
                setDebouncedSearch('');
                handleTabChange('All');
              }}
              className="ml-auto text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl px-2.5 py-1 transition cursor-pointer"
            >
              ✕ Reset Filters
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-x-auto relative min-h-[200px]">
        {loading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] grid place-items-center z-10">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
        <table className="w-full text-[13px] min-w-[640px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted border-b border-gray-100">
              {m.columns.map((c) => (
                <th key={c} className="px-4 py-3 font-semibold">{c}</th>
              ))}
              <th className="px-4 py-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentRows.length === 0 && !loading && (
              <tr>
                <td colSpan={m.columns.length + 1} className="px-5 py-8 text-center text-muted">
                  No records found{debouncedSearch ? ` matching "${debouncedSearch}"` : ''}.
                </td>
              </tr>
            )}
            {currentRows.map((row, i) => (
              <tr
                key={i}
                onClick={() => {
                  if (kind === 'events') setSelectedEventWorkspace(row[0]);
                  if (kind === 'bookings' && apiData.raw?.[i]) setSelectedBookingForDetail(apiData.raw[i]);
                }}
                className={`border-b border-gray-50 last:border-0 hover:bg-lavender/40 transition ${
                  ['events', 'bookings'].includes(kind) ? 'cursor-pointer' : ''
                }`}
              >
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-3">
                    {typeof cell === 'string' && [
                      'Active','Verified','Confirmed','Completed','Planning','Pending','Scheduled','In Progress','Inactive','Rejected','Cancelled','Draft',
                      'NOT_STARTED','SERVICE_SCHEDULED','SERVICE_STARTED','COMPLETION_SUBMITTED','COMPLETION_VERIFIED',
                      'NOT_ELIGIBLE','SETTLEMENT_ELIGIBLE','SETTLEMENT_HOLD','SETTLED',
                      'PAID','PARTIAL','FAILED','DISPUTED'
                    ].includes(cell) ? (
                      <StatusChip status={cell} />
                    ) : (
                      <span className={j === 0 ? (['events', 'bookings'].includes(kind) ? 'font-bold text-navy hover:text-primary' : 'font-semibold') : 'text-ink/70'}>
                        {cell}
                      </span>
                    )}
                  </td>
                ))}
                <td className="px-4 py-3 text-right text-muted">
                  {kind === 'vendors' && apiData.raw?.[i] ? (
                    <div className="inline-flex items-center justify-end gap-2">
                      {!apiData.raw[i].verification?.isVerified && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleVendorVerification(apiData.raw[i], true);
                          }}
                          className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                        >
                          Approve
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleVendorVerification(apiData.raw[i], false);
                        }}
                        className="rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  ) : kind === 'bookings' && apiData.raw?.[i] ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBookingForDetail(apiData.raw[i]);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-primary-soft text-primary hover:bg-primary hover:text-white transition cursor-pointer"
                    >
                      <Icon name="eye" size={13} />
                      <span>View</span>
                    </button>
                  ) : (
                    <button className="p-1 rounded-lg hover:bg-lavender text-muted hover:text-navy inline-flex items-center justify-center cursor-pointer">
                      <Icon name="dotsVertical" size={15} strokeWidth={2.5} />
                    </button>
                  )}
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
                className="w-7 h-7 grid place-items-center rounded-lg hover:bg-lavender disabled:opacity-50 cursor-pointer" 
                aria-label="Previous page">
                <Icon name="chevronLeft" size={13} />
              </button>
              <button className="w-7 h-7 grid place-items-center rounded-lg bg-primary text-white font-bold">{page}</button>
              {page < currentPages && (
                 <button onClick={() => setPage(p => p + 1)} className="w-7 h-7 grid place-items-center rounded-lg hover:bg-lavender cursor-pointer">{page + 1}</button>
              )}
              {page + 1 < currentPages && (
                 <button onClick={() => setPage(p => p + 2)} className="w-7 h-7 grid place-items-center rounded-lg hover:bg-lavender cursor-pointer">{page + 2}</button>
              )}
              {page + 2 < currentPages && <span className="px-1">…</span>}
              {page + 2 < currentPages && (
                 <button onClick={() => setPage(currentPages)} className="w-7 h-7 grid place-items-center rounded-lg hover:bg-lavender cursor-pointer">{currentPages}</button>
              )}
              <button 
                onClick={() => setPage(p => Math.min(currentPages, p + 1))}
                disabled={page === currentPages}
                className="w-7 h-7 grid place-items-center rounded-lg hover:bg-lavender disabled:opacity-50 cursor-pointer" 
                aria-label="Next page">
                <Icon name="chevronRight" size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showAddModal && kind === 'coupons' && <CouponModal onClose={() => setShowAddModal(false)} onSaved={() => { setShowAddModal(false); window.location.reload(); }} />}
      
      {selectedBookingForDetail && (
        <BookingDetailModal
          booking={selectedBookingForDetail}
          onClose={() => setSelectedBookingForDetail(null)}
          onRefresh={() => setPage((p) => p)}
        />
      )}
    </div>
  );
}
