import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminApi } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { StatusChip } from '../../components/ui.jsx';
import EventWorkspace from './EventWorkspace.jsx';
import CouponModal from './CouponModal.jsx';
import BookingDetailModal from './BookingDetailModal.jsx';
import VendorKycModal from './VendorKycModal.jsx';
import {
  VendorEditModal,
  CustomerEditModal,
  UserRestrictModal,
  UserFlagModal,
  ConfirmDeleteModal,
} from './UserActionModals.jsx';
import { AdminEmptyState, AdminErrorState, AdminPageHeader, AdminStatCard, AdminTableSkeleton } from './adminUi.jsx';

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
    title: 'Customers', add: null,
    tabs: ['All', 'Active', 'Flagged', 'Suspended', 'Inactive'], filters: [],
    columns: ['Customer', 'Phone', 'Email', 'Status'],
    rows: [],
    total: 0, pages: 1,
  },
  vendors: {
    title: 'Vendors', add: null,
    tabs: ['All', 'Verified', 'Pending', 'Flagged', 'Suspended', 'Rejected'], filters: ['Category', 'Location'],
    columns: ['Business', 'Contact', 'Category', 'Location', 'KYC', 'Status'],
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

function adminEventStatusLabel(status) {
  const labels = {
    draft: 'Draft',
    planning: 'Planning',
    booked: 'Confirmed',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return labels[status] || status || 'Draft';
}

export default function ModuleTable({ kind, embedded = false }) {
  const m = MODULE_DATA[kind];
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get('search') || '';
  const urlTab = searchParams.get('tab') || '';

  const [tab, setTab] = useState(urlTab || m.tabs[0] || '');
  const [search, setSearch] = useState(urlSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(urlSearch);

  const [selectedEventWorkspace, setSelectedEventWorkspace] = useState(null);
  const [selectedVendorForKyc, setSelectedVendorForKyc] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // User Actions (Vendors & Customers)
  const [editModalTarget, setEditModalTarget] = useState(null); // { item, type: 'vendor' | 'customer' }
  const [restrictModalTarget, setRestrictModalTarget] = useState(null);
  const [flagModalTarget, setFlagModalTarget] = useState(null);
  const [deleteModalTarget, setDeleteModalTarget] = useState(null);

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
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
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
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e.message || `Failed to ${action} vendor`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError('');

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
    } else if (kind === 'events') {
      endpoint = `/events?limit=${limit}&skip=${skip}${searchParam}${tabParam}`;
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
            mappedRows = res.organizations.map((v) => {
              const isRestricted = v.isRestricted || v.status === 'SUSPENDED';
              const isFlagged = v.isFlagged;
              let statusDisplay = v.status || 'PENDING';
              if (isFlagged) statusDisplay = 'Flagged';
              else if (isRestricted) statusDisplay = 'Suspended';

              const contact = v.owner
                ? `${v.owner.fullName || ''}${v.phone || v.owner.phone ? ` · ${v.phone || v.owner.phone}` : ''}`
                : (v.phone || '—');

              return [
                v.businessName || '—',
                contact,
                v.category || '—',
                v.location || '—',
                v.verification?.isVerified ? 'Verified' : 'Pending',
                statusDisplay,
              ];
            });
          }
          if (kind === 'events' && res.events) {
            mappedRows = res.events.map(e => [
              e.displayTitle || e.title || 'Event',
              e.customerName || e.customer?.fullName || e.customerEmail || 'Customer',
              e.eventDate ? new Date(`${e.eventDate}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date TBD',
              e.locationLabel || e.city || 'Location not set',
              adminEventStatusLabel(e.status),
            ]);
          }
          if (kind === 'customers' && res.customers) {
            mappedRows = res.customers.map((cu) => {
              const isRestricted = cu.isRestricted || cu.status === 'SUSPENDED';
              const isFlagged = cu.isFlagged;
              let statusDisplay = cu.status || 'ACTIVE';
              if (isFlagged) statusDisplay = 'Flagged';
              else if (isRestricted) statusDisplay = 'Suspended';

              return [
                cu.fullName || '—',
                cu.phone || '—',
                cu.email || '—',
                statusDisplay,
              ];
            });
          }
          setApiData({
            rows: mappedRows,
            raw: res.organizations || res.coupons || res.bookings || res.events || res.customers || res.users || [],
            total: totalItems,
            pages: Math.ceil(totalItems / limit) || 1,
          });
        })
        .catch((err) => {
          if (!isMounted) return;
          setError(err.data?.error || err.message || `Failed to load ${m.title.toLowerCase()}.`);
          setApiData({ rows: [], total: 0, pages: 1, raw: [] });
        })
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
  }, [kind, page, tab, debouncedSearch, bookingVendorFilter, bookingCategoryFilter, bookingCityFilter, reloadKey]);

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
  const tableMinWidth = kind === 'bookings' ? 'min-w-[1120px]' : kind === 'vendors' ? 'min-w-[880px]' : 'min-w-[760px]';
  const hasRows = currentRows.length > 0;
  const loadingFresh = loading && !hasRows;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={m.title}
        description={kind === 'bookings'
          ? 'Track booking value, payment verification, execution progress, and settlement readiness.'
          : 'Review, search, filter, and manage platform records from one admin workspace.'}
        meta={currentTotal ? `${currentTotal.toLocaleString('en-IN')} records` : undefined}
        searchValue={search}
        onSearchChange={setSearch}
        onClearSearch={() => setSearch('')}
        searchPlaceholder={`Search ${m.title.toLowerCase()}...`}
        action={m.add ? (
          <button
            onClick={() => { if (kind === 'coupons') setShowAddModal(true); }}
            className="rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-extrabold px-4 py-2.5 transition whitespace-nowrap"
          >
            {m.add}
          </button>
        ) : null}
      />

      {/* Bookings KPI Stats Cards */}
      {kind === 'bookings' && bookingMeta.stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3.5">
          <AdminStatCard icon="wallet" value={`₹${Number(bookingMeta.stats.totalGmv || 0).toLocaleString('en-IN')}`} label="Platform GMV" tone="primary" />
          <AdminStatCard icon="bookings" value={bookingMeta.stats.totalBookings || 0} label="Total Bookings" tone="blue" />
          <AdminStatCard icon="operations" value={bookingMeta.stats.inProgressCount || 0} label="In Progress" tone="violet" />
          <AdminStatCard icon="check" value={bookingMeta.stats.completedCount || 0} label="Completed" tone="emerald" />
          <AdminStatCard icon="payments" value={bookingMeta.stats.pendingPaymentCount || 0} label="Pending Payment" tone="amber" />
        </div>
      )}

      {/* Payments-style stat row */}
      {m.stats && (
        <div className="grid sm:grid-cols-3 gap-3.5">
          {m.stats.map((s) => (
            <AdminStatCard key={s.label} icon={s.icon} value={s.value} label={s.label} foot={s.foot} />
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
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {m.tabs.map((t) => (
            <button
              key={t}
              onClick={() => handleTabChange(t)}
              className={`shrink-0 text-xs font-semibold rounded-full px-3.5 py-1.5 transition cursor-pointer ${
                tab === t ? 'bg-primary text-white' : 'bg-white text-ink/60 hover:bg-primary-soft hover:text-primary'
              }`}
            >
              {t}
            </button>
          ))}
          {m.filters.map((f) => (
            <button
              key={f}
              className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium bg-white rounded-full px-3.5 py-1.5 text-ink/60 hover:bg-lavender transition"
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
              Reset Filters
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {error ? (
        <AdminErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden relative min-h-[260px] border border-white/80">
          {loading && hasRows ? (
            <div className="absolute left-0 right-0 top-0 z-10 h-1 overflow-hidden bg-primary-soft">
              <div className="h-full w-1/3 animate-pulse bg-primary" />
            </div>
          ) : null}
          {loadingFresh ? (
            <AdminTableSkeleton columns={Math.min(m.columns.length + 1, 7)} rows={7} />
          ) : hasRows ? (
            <div className="overflow-x-auto">
              <table className={`w-full text-[13px] ${tableMinWidth}`}>
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted border-b border-gray-100 bg-slate-50/80">
                    {m.columns.map((c) => (
                      <th key={c} className="px-4 py-3 font-extrabold">{c}</th>
                    ))}
                    <th className="px-4 py-3 font-extrabold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {currentRows.map((row, i) => (
                    <tr
                      key={i}
                      onClick={() => {
                        if (kind === 'events') setSelectedEventWorkspace(row[0]);
                        if (kind === 'bookings' && apiData.raw?.[i]) setSelectedBookingForDetail(apiData.raw[i]);
                        if (kind === 'vendors' && apiData.raw?.[i]) setSelectedVendorForKyc(apiData.raw[i]);
                      }}
                      className={`border-b border-gray-50 last:border-0 hover:bg-lavender/40 transition ${
                        ['events', 'bookings', 'vendors'].includes(kind) ? 'cursor-pointer' : ''
                      }`}
                    >
                      {row.map((cell, j) => (
                        <td key={j} className="px-4 py-4 align-top">
                          {typeof cell === 'string' && [
                            'Active','ACTIVE','Verified','VERIFIED','Confirmed','Completed','Planning','Pending','PENDING','Scheduled','In Progress','Inactive','Rejected','REJECTED','Cancelled','Disabled','DISABLED','Draft','DRAFT',
                            'Flagged','Suspended','SUSPENDED','PROFILE_INCOMPLETE',
                            'NOT_STARTED','SERVICE_SCHEDULED','SERVICE_STARTED','COMPLETION_SUBMITTED','COMPLETION_VERIFIED',
                            'NOT_ELIGIBLE','SETTLEMENT_ELIGIBLE','SETTLEMENT_HOLD','SETTLED',
                            'PAID','PARTIAL','FAILED','DISPUTED','PAYMENT_VERIFIED','PENDING_PAYMENT'
                          ].includes(cell) ? (
                            <StatusChip status={cell} />
                          ) : (
                            <span className={`block leading-5 ${j === 0 ? (['events', 'bookings', 'vendors'].includes(kind) ? 'font-extrabold text-navy hover:text-primary' : 'font-semibold text-navy') : 'text-ink/70'}`}>
                              {cell}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-4 text-right text-muted align-top">
                        {kind === 'vendors' && apiData.raw?.[i] ? (
                          <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedVendorForKyc(apiData.raw[i]);
                              }}
                              className="rounded-lg bg-primary-soft px-2.5 py-1 text-[11px] font-extrabold text-primary hover:bg-primary hover:text-white transition cursor-pointer"
                              title="Review KYC Documents"
                            >
                              Review KYC
                            </button>
                            {!apiData.raw[i].verification?.isVerified && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleVendorVerification(apiData.raw[i], true);
                                }}
                                className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                                title="Quick Approve KYC"
                              >
                                Approve
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditModalTarget({ item: apiData.raw[i], type: 'vendor' });
                              }}
                              className="p-1.5 rounded-lg hover:bg-lavender text-muted hover:text-navy transition cursor-pointer"
                              title="Edit Vendor Details"
                            >
                              <Icon name="edit" size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFlagModalTarget({ item: apiData.raw[i], type: 'vendor' });
                              }}
                              className={`p-1.5 rounded-lg transition cursor-pointer ${
                                apiData.raw[i].isFlagged
                                  ? 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                                  : 'hover:bg-lavender text-muted hover:text-rose-600'
                              }`}
                              title={apiData.raw[i].isFlagged ? `Flagged: ${apiData.raw[i].flagReason || 'Active flag'}` : 'Flag Vendor'}
                            >
                              <Icon name="flag" size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRestrictModalTarget({ item: apiData.raw[i], type: 'vendor' });
                              }}
                              className={`p-1.5 rounded-lg transition cursor-pointer ${
                                apiData.raw[i].isRestricted || apiData.raw[i].status === 'SUSPENDED'
                                  ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                                  : 'hover:bg-lavender text-muted hover:text-amber-600'
                              }`}
                              title={
                                apiData.raw[i].isRestricted
                                  ? `Suspended until ${new Date(apiData.raw[i].restrictedUntil).toLocaleDateString()}`
                                  : 'Restrict / Suspend for N Days'
                              }
                            >
                              <Icon name="clock" size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteModalTarget({ item: apiData.raw[i], type: 'vendor' });
                              }}
                              className="p-1.5 rounded-lg hover:bg-rose-50 text-muted hover:text-rose-600 transition cursor-pointer"
                              title="Delete Vendor"
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          </div>
                        ) : kind === 'customers' && apiData.raw?.[i] ? (
                          <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditModalTarget({ item: apiData.raw[i], type: 'customer' });
                              }}
                              className="p-1.5 rounded-lg hover:bg-lavender text-muted hover:text-navy transition cursor-pointer"
                              title="Edit Customer"
                            >
                              <Icon name="edit" size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFlagModalTarget({ item: apiData.raw[i], type: 'customer' });
                              }}
                              className={`p-1.5 rounded-lg transition cursor-pointer ${
                                apiData.raw[i].isFlagged
                                  ? 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                                  : 'hover:bg-lavender text-muted hover:text-rose-600'
                              }`}
                              title={apiData.raw[i].isFlagged ? `Flagged: ${apiData.raw[i].flagReason || 'Active flag'}` : 'Flag Customer'}
                            >
                              <Icon name="flag" size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRestrictModalTarget({ item: apiData.raw[i], type: 'customer' });
                              }}
                              className={`p-1.5 rounded-lg transition cursor-pointer ${
                                apiData.raw[i].isRestricted || apiData.raw[i].status === 'SUSPENDED'
                                  ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                                  : 'hover:bg-lavender text-muted hover:text-amber-600'
                              }`}
                              title={
                                apiData.raw[i].isRestricted
                                  ? `Suspended until ${new Date(apiData.raw[i].restrictedUntil).toLocaleDateString()}`
                                  : 'Restrict / Suspend for N Days'
                              }
                            >
                              <Icon name="clock" size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteModalTarget({ item: apiData.raw[i], type: 'customer' });
                              }}
                              className="p-1.5 rounded-lg hover:bg-rose-50 text-muted hover:text-rose-600 transition cursor-pointer"
                              title="Delete Customer"
                            >
                              <Icon name="trash" size={14} />
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
                          <button className="p-1 rounded-lg hover:bg-lavender text-muted hover:text-navy inline-flex items-center justify-center cursor-pointer" aria-label="More actions">
                            <Icon name="dotsVertical" size={15} strokeWidth={2.5} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <AdminEmptyState
              title="No records found"
              message={debouncedSearch ? `Nothing matched "${debouncedSearch}". Try another search or clear filters.` : 'There is no data to show here yet.'}
            />
          )}

          {/* Pagination */}
          {currentTotal > 0 && (
            <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
              <span>Showing {((page - 1) * limit) + 1}-{Math.min(page * limit, currentTotal)} of {currentTotal}</span>
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
                {page + 2 < currentPages && <span className="px-1">...</span>}
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
      )}

      {showAddModal && kind === 'coupons' && <CouponModal onClose={() => setShowAddModal(false)} onSaved={() => { setShowAddModal(false); setReloadKey((k) => k + 1); }} />}
      
      {selectedBookingForDetail && (
        <BookingDetailModal
          booking={selectedBookingForDetail}
          onClose={() => setSelectedBookingForDetail(null)}
          onRefresh={() => setReloadKey((k) => k + 1)}
        />
      )}

      {selectedVendorForKyc && (
        <VendorKycModal
          vendor={selectedVendorForKyc}
          onClose={() => setSelectedVendorForKyc(null)}
          onRefresh={() => setReloadKey((k) => k + 1)}
        />
      )}

      {editModalTarget && editModalTarget.type === 'vendor' && (
        <VendorEditModal
          vendor={editModalTarget.item}
          isOpen={true}
          onClose={() => setEditModalTarget(null)}
          onSaved={() => {
            setEditModalTarget(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      {editModalTarget && editModalTarget.type === 'customer' && (
        <CustomerEditModal
          customer={editModalTarget.item}
          isOpen={true}
          onClose={() => setEditModalTarget(null)}
          onSaved={() => {
            setEditModalTarget(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      {restrictModalTarget && (
        <UserRestrictModal
          target={restrictModalTarget.item}
          targetType={restrictModalTarget.type}
          isOpen={true}
          onClose={() => setRestrictModalTarget(null)}
          onUpdated={() => {
            setRestrictModalTarget(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      {flagModalTarget && (
        <UserFlagModal
          target={flagModalTarget.item}
          targetType={flagModalTarget.type}
          isOpen={true}
          onClose={() => setFlagModalTarget(null)}
          onUpdated={() => {
            setFlagModalTarget(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      {deleteModalTarget && (
        <ConfirmDeleteModal
          target={deleteModalTarget.item}
          targetType={deleteModalTarget.type}
          isOpen={true}
          onClose={() => setDeleteModalTarget(null)}
          onDeleted={() => {
            setDeleteModalTarget(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
