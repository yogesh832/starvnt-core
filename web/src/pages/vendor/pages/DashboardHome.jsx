import { useState, useEffect, useCallback } from 'react';
import Icon from '../../../components/Icon.jsx';
import { StatusChip } from '../../../components/ui.jsx';
import { externalApi } from '../../../lib/api.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MiniCalendar({ bookings = [] }) {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 10, 1)); // Default to Nov 2026

  // Find which days in this month have bookings
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const bookedDays = bookings
    .map((b) => {
      const rawDate = b.eventDate || b.date;
      if (!rawDate) return null;
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) return null;
      if (d.getFullYear() === year && d.getMonth() === month) {
        return d.getDate();
      }
      return null;
    })
    .filter(Boolean);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthTitle = `${monthNames[month]} ${year}`;

  return (
    <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-extrabold text-sm text-navy">{monthTitle}</h3>
        <div className="text-muted text-xs flex gap-2 font-bold cursor-pointer">
          <button
            onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
            className="hover:text-navy px-1"
          >
            ‹
          </button>
          <button
            onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
            className="hover:text-navy px-1"
          >
            ›
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
        {DAYS.map((d) => (
          <div key={d} className="text-muted font-bold py-1">{d}</div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => <div key={`b${i}`} />)}
        {days.map((d) => {
          const isBooked = bookedDays.includes(d);
          return (
            <div
              key={d}
              className={`py-1.5 rounded-full text-xs font-semibold ${
                isBooked
                  ? 'bg-primary text-white font-extrabold shadow-xs'
                  : 'text-ink/80 hover:bg-lavender/60'
              }`}
            >
              {d}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Performance({ enquiries = [], quotes = [], bookings = [] }) {
  const enqCount = enquiries.length || 1;
  const quoteCount = quotes.length;
  const bookingCount = bookings.length;

  const enqToQuoteRate = Math.min(100, Math.round((quoteCount / enqCount) * 100));
  const quoteToBookingRate = quoteCount > 0 ? Math.min(100, Math.round((bookingCount / quoteCount) * 100)) : 0;

  return (
    <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-sm text-navy">Performance</h3>
        <span className="text-[10px] font-bold text-muted bg-lavender px-2 py-0.5 rounded-md">Live Platform ▾</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[10px] text-muted font-semibold">Active Leads</div>
          <div className="font-extrabold text-sm text-navy mt-0.5">{enquiries.length}</div>
          <div className="text-[10px] text-emerald-600 font-bold">100% Validated</div>
        </div>
        <div>
          <div className="text-[10px] text-muted font-semibold">Enquiry → Quote</div>
          <div className="font-extrabold text-sm text-navy mt-0.5">{enqToQuoteRate}%</div>
          <div className="text-[10px] text-emerald-600 font-bold">↑ Active</div>
        </div>
        <div>
          <div className="text-[10px] text-muted font-semibold">Quote → Booking</div>
          <div className="font-extrabold text-sm text-navy mt-0.5">{quoteToBookingRate}%</div>
          <div className="text-[10px] text-emerald-600 font-bold">↑ Core Escrow</div>
        </div>
      </div>
      <svg viewBox="0 0 200 60" className="mt-4 w-full">
        <polyline points="0,45 20,42 40,38 60,40 80,32 100,35 120,25 140,28 160,18 180,22 200,10" fill="none" stroke="#5a4bd1" strokeWidth="2.5" strokeLinecap="round" />
        <polyline points="0,45 20,42 40,38 60,40 80,32 100,35 120,25 140,28 160,18 180,22 200,10 200,60 0,60" fill="url(#perf)" stroke="none" />
        <defs>
          <linearGradient id="perf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5a4bd1" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#5a4bd1" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <div className="flex justify-between text-[9px] font-bold text-muted mt-1">
        <span>Oct 1</span><span>Oct 8</span><span>Oct 15</span><span>Oct 22</span><span>Oct 30</span>
      </div>
    </div>
  );
}

/**
 * Enquiry Detail Dialog matching Spec §9
 */
function EnquiryModal({ enquiry, onClose, onPrepareQuote }) {
  if (!enquiry) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4 animate-[pop_.18s_ease-out]">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold text-navy">{enquiry.title}</h2>
              <StatusChip status={enquiry.status} />
            </div>
            <p className="text-xs text-muted">{enquiry.id} · {enquiry.ago}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center font-bold">✕</button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="p-3 bg-lavender/60 rounded-2xl space-y-1.5">
            <div className="flex justify-between"><span className="text-muted">Event Date</span><span className="font-bold text-navy">{enquiry.date}</span></div>
            <div className="flex justify-between"><span className="text-muted">Service Location</span><span className="font-bold text-navy">{enquiry.location}</span></div>
            <div className="flex justify-between"><span className="text-muted">Guest Count</span><span className="font-bold text-navy">{enquiry.guestCount} guests</span></div>
            <div className="flex justify-between"><span className="text-muted">Budget / Value</span><span className="font-bold text-emerald-600">{enquiry.budget}</span></div>
          </div>

          <div className="p-3 bg-gray-50 rounded-2xl space-y-1">
            <div className="font-bold text-navy">Validated Logistics</div>
            <div className="text-muted">Origin: Barasat Hub → Destination: {enquiry.location}</div>
            <div className="flex justify-between mt-1"><span className="text-muted">Estimated Distance</span><span className="font-semibold">{enquiry.estTravel}</span></div>
            <div className="flex justify-between"><span className="text-muted">Verified Travel Allowance</span><span className="font-semibold text-primary">{enquiry.travelCost}</span></div>
          </div>
        </div>

        <div className="pt-2 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-muted hover:text-navy">
            Dismiss
          </button>
          <button
            onClick={() => {
              onClose();
              onPrepareQuote(enquiry);
            }}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark shadow-md shadow-primary/25"
          >
            Prepare Quote →
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Quote Builder Dialog matching Spec §9
 */
function QuoteModal({ enquiry, onClose, onSubmitQuote }) {
  const [basePrice, setBasePrice] = useState(48000);
  const [travelFee, setTravelFee] = useState(2000);
  const total = Number(basePrice) + Number(travelFee);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-[pop_.18s_ease-out]">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-extrabold text-navy">Prepare Official Quote</h2>
            <p className="text-xs text-muted">{enquiry?.title || 'Wedding Photography'} · {enquiry?.date || 'Upcoming'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center font-bold">✕</button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-muted font-semibold mb-1">Base Service Price (₹)</label>
            <input
              type="number"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold text-navy outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-muted font-semibold mb-1">Travel & Logistics Policy (₹)</label>
            <input
              type="number"
              value={travelFee}
              onChange={(e) => setTravelFee(e.target.value)}
              className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold text-navy outline-none focus:border-primary"
            />
            <span className="text-[10px] text-muted">Barasat to {enquiry?.location || 'Venue'} validated transit</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-primary-soft/60 border border-primary/20 flex justify-between items-baseline">
            <span className="font-extrabold text-navy">Validated Total Cost</span>
            <span className="font-extrabold text-lg text-primary">₹{total.toLocaleString()}</span>
          </div>
        </div>

        <div className="pt-2 flex gap-3">
          <button
            onClick={() => {
              onSubmitQuote({ base: basePrice, travel: travelFee, total, status: 'DRAFT' });
              onClose();
            }}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-muted hover:text-navy"
          >
            Save Draft
          </button>
          <button
            onClick={() => {
              onSubmitQuote({ base: basePrice, travel: travelFee, total, status: 'SUBMITTED' });
              onClose();
            }}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark shadow-md shadow-primary/25"
          >
            Submit Quote
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardHome({ business = 'Premium Moments' }) {
  const [selectedEnquiry, setSelectedEnquiry] = useState(null);
  const [quoteEnquiry, setQuoteEnquiry] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [activation, setActivation] = useState(null);
  const [vendorProfile, setVendorProfile] = useState(null);
  const [gotItAcknowledged, setGotItAcknowledged] = useState(false);
  const [completingProfile, setCompletingProfile] = useState(false);

  const loadLiveDashboard = useCallback(async () => {
    try {
      // 0. Activation & Profile Completeness (Spec §3, §4)
      const [actRes, profRes] = await Promise.all([
        externalApi.call('/vendor/activation-status'),
        externalApi.call('/vendor/profile'),
      ]);
      if (actRes.ok && actRes.status) {
        setActivation(actRes.status);
      }
      if (profRes.ok && profRes.vendor) {
        setVendorProfile(profRes.vendor);
      }

      // 1. Opportunities / Enquiries
      const oppsRes = await externalApi.call('/vendor/opportunities');
      if (oppsRes.ok && oppsRes.opportunities) {
        const liveEnqs = oppsRes.opportunities.map((o) => ({
          id: o._id,
          opportunityId: o._id,
          customerId: o.customer?._id || o.customer,
          serviceId: o.vendorService,
          title: o.serviceName,
          meta: `${o.eventDate} · ${o.serviceLocation?.address || o.serviceLocation?.locality || 'New Town'}, ${o.serviceLocation?.city || 'Kolkata'}`,
          chips: [
            `${o.guestCount || 500} guests`,
            o.requiredCapability || 'Full day',
            'Candid + Traditional'
          ],
          status: o.status === 'NEW' ? 'New' : o.status,
          ago: 'Recently matched',
          img: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=160&q=80',
          guestCount: o.guestCount || 500,
          location: `${o.serviceLocation?.address || ''} ${o.serviceLocation?.locality || 'New Town'}`.trim(),
          date: o.eventDate,
          estTravel: o.estimatedTravel || 'Barasat → New Town',
          travelCost: `₹${(o.travelCost || 2000).toLocaleString()} verified`,
          budget: '₹48,000 – ₹55,000',
        }));
        setEnquiries(liveEnqs);
      }

      // 2. Quotes
      const quotesRes = await externalApi.call('/quotes');
      if (quotesRes.ok && quotesRes.quotes) {
        const liveQuotes = quotesRes.quotes.map((q) => ({
          _id: q._id,
          id: q.quoteReference || q._id,
          quoteReference: q.quoteReference,
          client: q.customer?.fullName || q.customer?.email || 'Customer',
          type: q.serviceName || 'Photography',
          date: q.eventDate,
          base: q.pricingBreakdown?.basePrice || 0,
          travel: q.pricingBreakdown?.travelFee || 0,
          amount: `₹${(q.pricingBreakdown?.totalAmount || 0).toLocaleString()}`,
          status: q.status === 'SUBMITTED' ? 'Submitted' : q.status === 'DRAFT' ? 'Draft' : q.status === 'APPROVED' ? 'Approved' : q.status,
          action: q.status === 'DRAFT' ? 'Submit Quote' : q.status === 'SUBMITTED' ? 'Awaiting Customer' : 'View Quote',
        }));
        setQuotes(liveQuotes);
      }

      // 3. Bookings
      const bkRes = await externalApi.call('/vendor/bookings');
      if (bkRes.ok && bkRes.bookings) {
        const liveBks = bkRes.bookings.map((b) => ({
          id: b.bookingReference || b._id,
          bookingReference: b.bookingReference,
          title: `${b.serviceName} (${b.customerName || 'Client'})`,
          serviceName: b.serviceName,
          meta: `${b.eventDate} · ${b.serviceLocation?.locality || 'Kolkata'} · ₹${(b.totalAmount || 0).toLocaleString()}`,
          eventDate: b.eventDate,
          date: b.eventDate,
          totalAmount: b.totalAmount || 0,
          status: b.bookingStatus === 'CONFIRMED'
            ? (b.executionStatus === 'SERVICE_STARTED' ? 'Service Started' : 'Confirmed')
            : b.bookingStatus,
          img: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=160&q=80',
        }));
        setBookings(liveBks);
      }

      // 4. Services
      const svcRes = await externalApi.call('/vendor/services');
      if (svcRes.ok && svcRes.services?.length) {
        setServices(svcRes.services);
      }

      // 5. Notifications
      const notifRes = await externalApi.call('/vendor/notifications');
      if (notifRes.ok && notifRes.notifications) {
        setNotifications(notifRes.notifications);
        setUnreadNotifCount(notifRes.unreadCount || 0);
      }
    } catch (err) {
      console.warn('[DashboardHome] Load dashboard warning:', err.message);
    }
  }, []);

  useEffect(() => {
    loadLiveDashboard();
  }, [loadLiveDashboard]);

  async function handleSendQuote(q, enquiry) {
    try {
      if (enquiry?.opportunityId) {
        await externalApi.call('/quotes', {
          method: 'POST',
          body: {
            opportunityId: enquiry.opportunityId,
            customerId: enquiry.customerId,
            vendorServiceId: enquiry.serviceId,
            serviceName: enquiry.title,
            eventDate: enquiry.date,
            serviceLocation: { address: enquiry.location },
            pricingBreakdown: {
              basePrice: Number(q.base),
              travelFee: Number(q.travel),
              totalAmount: Number(q.total),
            },
            status: q.status || 'SUBMITTED',
            notes: 'Official quote proposal prepared via Vendor Command Center',
          },
        });
      }
      // Re-fetch all dynamic dashboard data
      await loadLiveDashboard();
    } catch (err) {
      console.error('[DashboardHome] Quote submit error:', err);
    }
  }

  async function handleQuoteAction(q) {
    if (q.status === 'Draft' || q.status === 'DRAFT') {
      try {
        await externalApi.call(`/quotes/${q._id}/transition`, {
          method: 'POST',
          body: {
            targetStatus: 'SUBMITTED',
            reason: 'Submitted via Vendor Command Center table action',
          },
        });
        await loadLiveDashboard();
      } catch (err) {
        console.error('[DashboardHome] Transition quote error:', err);
      }
    }
  }

  async function handleMarkNotificationRead(id) {
    try {
      await externalApi.call(`/vendor/notifications/${id}/read`, { method: 'PUT' });
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
      setUnreadNotifCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  }

  async function handleMarkAllNotificationsRead() {
    try {
      await externalApi.call('/vendor/notifications/read-all', { method: 'PUT' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadNotifCount(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  }

  async function handleQuickCompleteProfile() {
    setCompletingProfile(true);
    try {
      const category = vendorProfile?.category || 'Cinematic Production';
      const brand = vendorProfile?.businessName || 'Brand';
      const city = vendorProfile?.city || vendorProfile?.location || 'Mumbai';

      // Category-specific service defaults
      const isCatering = category === 'Catering';
      const isDecor = category === 'Decor & Styling';
      const isDJ = category === 'DJ & Music';
      const isVenue = category === 'Venue';
      const isMakeup = category === 'Makeup & Styling';

      const serviceName = isCatering
        ? `${brand} Grand Wedding Buffet & Live Counters`
        : isDecor
        ? `${brand} Luxury Floral Mandap & Decor`
        : isDJ
        ? `${brand} Live Bollywood Sangeet DJ Setup`
        : isVenue
        ? `${brand} Royal Wedding Lawn & Ballroom`
        : isMakeup
        ? `${brand} Bridal HD Airbrush Makeover`
        : `${brand} Cinematic Wedding Film & Teaser`;

      const deliverables = isCatering
        ? ['Multi-cuisine Buffet Spread', 'Artisanal Live Chaat Counter', 'Dedicated Uniformed Crew']
        : isDecor
        ? ['Mandap Floral Concept', 'Stage Crystal Backdrop', 'Aisle Runner & Lighting']
        : isDJ
        ? ['Concert Laser Show', 'Live Bollywood & EDM Mixing', 'Digital Dhol Percussion']
        : isVenue
        ? ['Banquet Seating (1000 Pax)', 'Air Conditioned Bridal Suites', 'Valet Parking Facility']
        : isMakeup
        ? ['HD Waterproof Airbrush', 'Bridal Hair Draping', 'Jewelry Styling']
        : ['4K Teaser (3 mins)', 'Full Event Cut', 'Drone Highlights'];

      const styles = isCatering
        ? ['Royal Buffet', 'Live Counters', 'Multi-Cuisine']
        : isDecor
        ? ['Floral Mandap', 'Pastel Elegance', 'Fairy Lights']
        : isDJ
        ? ['Bollywood', 'Punjabi', 'EDM Fusion']
        : isVenue
        ? ['Lawn & Tents', 'Ballroom', 'Outdoor Pavilion']
        : isMakeup
        ? ['Bridal HD', 'Airbrush Glow', 'Traditional']
        : ['Cinematic', 'Drone 4K', 'Candid', 'Teaser Reel'];

      const coverPhoto = isCatering
        ? 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=800&q=80'
        : isDecor
        ? 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=800&q=80'
        : isDJ
        ? 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80'
        : isVenue
        ? 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=800&q=80'
        : isMakeup
        ? 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=800&q=80'
        : 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80';

      // 1. Service
      let serviceId;
      const svcRes = await externalApi.call('/vendor/services');
      if (!svcRes.services?.length) {
        const createSvcRes = await externalApi.call('/vendor/services', {
          method: 'POST',
          body: {
            name: serviceName,
            category,
            pricing: {
              basePrice: isCatering ? 120000 : isDecor ? 150000 : 75000,
              pricingType: 'FIXED',
              unit: 'event',
            },
            leadTimeDays: 7,
            deliverables,
            status: 'ACTIVE',
          },
        });
        serviceId = createSvcRes.service?._id;
      } else {
        serviceId = svcRes.services[0]._id;
      }

      // 2. Capability
      if (serviceId) {
        await externalApi.call('/vendor/capabilities', {
          method: 'POST',
          body: {
            vendorServiceId: serviceId,
            styles,
            format: 'Full day',
            teamSize: isCatering ? 15 : 4,
            equipment: ['Professional Commercial Equipment', 'Backup Ready'],
          },
        });

        // 3. Operating Location
        const locRes = await externalApi.call('/vendor/locations');
        if (!locRes.locations?.length) {
          await externalApi.call('/vendor/locations', {
            method: 'POST',
            body: {
              label: 'Main Studio & Operational Hub',
              type: 'STUDIO',
              address: 'Central Creative Hub',
              locality: 'Central District',
              city,
              state: 'Maharashtra',
              isPrimary: true,
            },
          });
        }

        // 4. Service Coverage
        await externalApi.call('/vendor/coverage', {
          method: 'POST',
          body: {
            vendorServiceId: serviceId,
            coverageType: 'RADIUS',
            radiusKm: 50,
            city,
            outstationAllowed: true,
          },
        });
      }

      // 5. Portfolio Project
      await externalApi.call('/vendor/portfolio/project', {
        method: 'POST',
        body: {
          projectName: `${brand} Signature Showcase`,
          eventType: 'Wedding',
          eventDate: '2026-11-26',
          venue: 'Grand Taj Banquet',
          city,
          style: styles[0],
          description: `Signature ${category} execution delivered by ${brand} in ${city}.`,
          coverUrl: coverPhoto,
          tags: ['Wedding', category, city],
          status: 'PUBLISHED',
        },
      });

      await loadLiveDashboard();
    } catch (err) {
      console.error('Quick complete profile error:', err);
    } finally {
      setCompletingProfile(false);
    }
  }

  const completionPercentage = activation?.completionPercentage !== undefined
    ? activation.completionPercentage
    : 20;
  const is100Percent = completionPercentage === 100 || Boolean(activation?.is100Percent);

  // Dynamic Stat Cards
  const totalRevenue = bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
  const pendingQuotesCount = quotes.filter((q) =>
    ['DRAFT', 'SUBMITTED', 'Draft', 'Submitted'].includes(q.status)
  ).length;

  const dynamicStats = [
    {
      label: 'New Enquiries',
      value: enquiries.filter((e) => e.status === 'New' || e.status === 'NEW').length,
      foot: `${enquiries.length} total qualified opportunities`,
      footClass: 'text-emerald-600',
      icon: 'message',
      iconBg: 'bg-primary-soft text-primary',
    },
    {
      label: 'Quotes Pending',
      value: pendingQuotesCount,
      foot: `${quotes.filter((q) => ['DRAFT', 'Draft'].includes(q.status)).length} require submission`,
      footClass: 'text-orange-500',
      icon: 'quotes',
      iconBg: 'bg-orange-50 text-orange-500',
    },
    {
      label: 'Upcoming Bookings',
      value: bookings.filter((b) => b.status !== 'CANCELLED').length,
      foot: bookings[0] ? `Next: ${bookings[0].eventDate || bookings[0].date}` : 'No upcoming bookings',
      footClass: 'text-muted',
      icon: 'bookings',
      iconBg: 'bg-sky-50 text-sky-600',
    },
    {
      label: 'Total Revenue',
      value: `₹${totalRevenue.toLocaleString()}`,
      foot: 'Verified via Core Bookings',
      footClass: 'text-emerald-600',
      icon: 'wallet',
      iconBg: 'bg-emerald-50 text-emerald-600',
    },
  ];

  const quickActions = [
    { label: 'Update Availability', icon: 'availability', to: '/vendor/availability', bg: 'bg-sky-50 text-sky-600' },
    { label: 'Manage Services', icon: 'services', to: '/vendor/services', bg: 'bg-purple-50 text-purple-600' },
    {
      label: 'View Messages',
      icon: 'message',
      to: '/vendor/messages',
      badge: unreadNotifCount > 0 ? String(unreadNotifCount) : null,
      bg: 'bg-red-50 text-red-500',
    },
    { label: 'Add Portfolio', icon: 'plus', to: '/vendor/portfolio', bg: 'bg-emerald-50 text-emerald-600' },
  ];

  return (
    <div className="p-4 sm:p-6 grid gap-6 xl:grid-cols-[1fr_310px] max-w-7xl mx-auto">
      {/* Center Column */}
      <div className="space-y-6 min-w-0">
        {/* Hero Banner with Quote */}
        <div className="bg-white rounded-3xl p-6 shadow-xs border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden">
          <div className="relative z-10">
            <h1 className="text-xl sm:text-2xl font-extrabold text-navy">Good morning, {business}! 👋</h1>
            <p className="text-sm text-muted mt-1">Here's what's happening with your business today.</p>
          </div>
          <div className="text-right md:border-l md:border-gray-100 md:pl-6">
            <p className="text-sm font-serif italic text-primary drop-shadow-xs">
              "Beautiful events create happier people."
            </p>
            <span className="text-[10px] uppercase font-bold tracking-widest text-muted mt-0.5 block">— STARVNT</span>
          </div>
        </div>

        {/* MANDATORY PROFILE COMPLETION ONBOARDING BANNER (Spec §3, §4) */}
        {(!is100Percent || !gotItAcknowledged) && (
          <div className={`rounded-3xl p-6 border transition shadow-sm ${
            is100Percent
              ? 'bg-emerald-50/80 border-emerald-200'
              : 'bg-gradient-to-br from-purple-50/80 via-white to-orange-50/40 border-primary/20'
          }`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] uppercase font-extrabold px-2.5 py-0.5 rounded-full ${
                    is100Percent
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700 animate-pulse'
                  }`}>
                    {is100Percent ? '✓ Verified 100% Active' : 'Action Required: Mandatory Profile Completion'}
                  </span>
                  <span className="text-xs font-bold text-navy">
                    {is100Percent ? '100% Complete' : `${completionPercentage || 20}% Completed`}
                  </span>
                </div>
                <h2 className="text-lg font-extrabold text-navy">
                  {is100Percent
                    ? '🎉 Profile 100% Complete! Your Brand is Now Matchable'
                    : 'Complete Your Operating Profile to Unlock Client Enquiries'}
                </h2>
                <p className="text-xs text-muted max-w-2xl">
                  {is100Percent
                    ? 'All operational requirements (Service, Capability, Coverage, Portfolio & City) are fully verified. You are now actively receiving customer match recommendations.'
                    : 'STARVNT requires 100% profile completion before matching clients with your brand. Free-looking slots are not matchable until capability, coverage, and portfolio projects are configured.'}
                </p>
              </div>

              <div className="flex items-center gap-2 self-start md:self-center shrink-0">
                {!is100Percent && (
                  <button
                    onClick={handleQuickCompleteProfile}
                    disabled={completingProfile}
                    className="rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold px-4 py-2.5 shadow-md shadow-primary/25 transition disabled:opacity-60"
                  >
                    {completingProfile ? 'Verifying 100%...' : '⚡ Complete Profile to 100%'}
                  </button>
                )}
                <button
                  onClick={() => setGotItAcknowledged(true)}
                  className={`rounded-xl text-xs font-bold px-4 py-2.5 transition border ${
                    is100Percent
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-sm'
                      : 'bg-white hover:bg-lavender text-navy border-gray-200'
                  }`}
                >
                  {is100Percent ? 'Got it! Continue to Dashboard →' : 'Got it! I understand'}
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              <div className="flex justify-between text-[11px] font-semibold">
                <span className="text-muted">Onboarding Progress</span>
                <span className={is100Percent ? 'text-emerald-600 font-bold' : 'text-primary font-bold'}>
                  {completionPercentage || 20}% / 100%
                </span>
              </div>
              <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    is100Percent
                      ? 'bg-emerald-500'
                      : (completionPercentage || 20) >= 60
                      ? 'bg-primary'
                      : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.max(15, completionPercentage || 20)}%` }}
                />
              </div>

              {/* 5 Milestones */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 text-[11px]">
                <div className="p-2 bg-white rounded-xl border border-gray-100 flex items-center gap-1.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span className="font-semibold text-navy truncate">1. Brand & City</span>
                </div>
                <div className={`p-2 bg-white rounded-xl border flex items-center gap-1.5 ${
                  activation?.checklist?.services
                    ? 'border-emerald-200 text-emerald-700'
                    : 'border-gray-100 text-muted'
                }`}>
                  <span className={activation?.checklist?.services ? 'text-emerald-500 font-bold' : 'text-muted'}>
                    {activation?.checklist?.services ? '✓' : '○'}
                  </span>
                  <a href="/vendor/services" className="font-semibold hover:underline truncate">2. Services & Pricing</a>
                </div>
                <div className={`p-2 bg-white rounded-xl border flex items-center gap-1.5 ${
                  activation?.checklist?.capabilities
                    ? 'border-emerald-200 text-emerald-700'
                    : 'border-gray-100 text-muted'
                }`}>
                  <span className={activation?.checklist?.capabilities ? 'text-emerald-500 font-bold' : 'text-muted'}>
                    {activation?.checklist?.capabilities ? '✓' : '○'}
                  </span>
                  <a href="/vendor/services" className="font-semibold hover:underline truncate">3. Capability & Gear</a>
                </div>
                <div className={`p-2 bg-white rounded-xl border flex items-center gap-1.5 ${
                  activation?.checklist?.coverage
                    ? 'border-emerald-200 text-emerald-700'
                    : 'border-gray-100 text-muted'
                }`}>
                  <span className={activation?.checklist?.coverage ? 'text-emerald-500 font-bold' : 'text-muted'}>
                    {activation?.checklist?.coverage ? '✓' : '○'}
                  </span>
                  <a href="/vendor/availability" className="font-semibold hover:underline truncate">4. Coverage & Transit</a>
                </div>
                <div className={`p-2 bg-white rounded-xl border flex items-center gap-1.5 ${
                  activation?.checklist?.portfolio
                    ? 'border-emerald-200 text-emerald-700'
                    : 'border-gray-100 text-muted'
                }`}>
                  <span className={activation?.checklist?.portfolio ? 'text-emerald-500 font-bold' : 'text-muted'}>
                    {activation?.checklist?.portfolio ? '✓' : '○'}
                  </span>
                  <a href="/vendor/portfolio" className="font-semibold hover:underline truncate">5. Portfolio Projects</a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4 Dynamic Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {dynamicStats.map((s) => (
            <div key={s.label} className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
              <div className={`w-10 h-10 rounded-2xl grid place-items-center ${s.iconBg}`}>
                <Icon name={s.icon} size={18} />
              </div>
              <div className="mt-3 text-2xl font-extrabold text-navy">{s.value}</div>
              <div className="text-xs text-muted mt-0.5">{s.label}</div>
              <div className={`text-[11px] mt-1.5 font-bold ${s.footClass}`}>{s.foot}</div>
            </div>
          ))}
        </div>

        {/* Recent Enquiries & Upcoming Bookings */}
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Recent Enquiries */}
          <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-extrabold text-base text-navy">Recent Enquiries</h2>
              <a href="/vendor/enquiries" className="text-xs font-bold text-primary hover:underline">View all</a>
            </div>
            <div className="space-y-3">
              {enquiries.slice(0, 3).map((e) => (
                <div key={e.id} className="flex gap-3.5 border border-gray-100 rounded-2xl p-3 hover:shadow-xs transition">
                  <img src={e.img} alt={e.title} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-navy truncate">{e.title}</span>
                      <span className="text-[10px] text-muted whitespace-nowrap">{e.ago}</span>
                    </div>
                    <div className="text-[11px] text-muted truncate mt-0.5">{e.meta}</div>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {e.chips.slice(0, 2).map((c) => (
                          <span key={c} className="text-[9px] bg-lavender rounded-md px-2 py-0.5 text-muted font-medium">{c}</span>
                        ))}
                        <StatusChip status={e.status} />
                      </div>
                      <button
                        onClick={() => setSelectedEnquiry(e)}
                        className="text-[11px] font-bold text-primary hover:underline shrink-0"
                      >
                        View Enquiry →
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {enquiries.length === 0 && (
                <div className="py-4">
                  {!is100Percent ? (
                    <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 space-y-1 text-left">
                      <div className="font-extrabold flex items-center gap-1.5 text-amber-950">
                        <span>🔒</span> Inbound Enquiries Locked (Profile {completionPercentage || 20}%)
                      </div>
                      <p className="text-[11px] text-amber-800">
                        STARVNT matching engine activates when your brand profile reaches 100%. Click "Complete Profile to 100%" above to start receiving client leads.
                      </p>
                    </div>
                  ) : (
                    <div className="text-center text-xs text-muted">No pending enquiries at this time</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Upcoming Bookings */}
          <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-extrabold text-base text-navy">Upcoming Bookings</h2>
              <a href="/vendor/bookings" className="text-xs font-bold text-primary hover:underline">View all</a>
            </div>
            <div className="space-y-3">
              {bookings.slice(0, 3).map((b) => (
                <div key={b.id} className="flex gap-3.5 items-center border border-gray-100 rounded-2xl p-3 hover:shadow-xs transition">
                  <img src={b.img} alt={b.title} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-navy truncate">{b.title}</span>
                      <StatusChip status={b.status} />
                    </div>
                    <div className="text-[11px] text-muted truncate mt-0.5">{b.meta}</div>
                    <a href="/vendor/bookings" className="text-[11px] font-bold text-primary mt-1 inline-block hover:underline">
                      View Details →
                    </a>
                  </div>
                </div>
              ))}
              {bookings.length === 0 && (
                <div className="text-center py-6 text-xs text-muted">No upcoming bookings scheduled</div>
              )}
            </div>
          </div>
        </div>

        {/* Quotes Pending Table */}
        <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100 overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-extrabold text-base text-navy">Quotes Pending</h2>
            <a href="/vendor/quotes" className="text-xs font-bold text-primary hover:underline">View all</a>
          </div>
          <table className="w-full text-xs min-w-[540px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted border-b border-gray-100 pb-2">
                <th className="pb-3 font-semibold">Client</th>
                <th className="pb-3 font-semibold">Event Type</th>
                <th className="pb-3 font-semibold">Event Date</th>
                <th className="pb-3 font-semibold">Amount</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {quotes.slice(0, 5).map((q) => (
                <tr key={q._id || q.id} className="hover:bg-lavender/30 transition">
                  <td className="py-3 font-bold text-navy">{q.client}</td>
                  <td className="py-3 text-muted">{q.type}</td>
                  <td className="py-3 text-muted">{q.date}</td>
                  <td className="py-3 font-extrabold text-navy">{q.amount}</td>
                  <td className="py-3"><StatusChip status={q.status} /></td>
                  <td className="py-3 text-right">
                    {q.status === 'Draft' || q.status === 'DRAFT' ? (
                      <button
                        onClick={() => handleQuoteAction(q)}
                        className="text-[11px] font-bold bg-primary hover:bg-primary-dark text-white rounded-xl px-3.5 py-1.5 transition shadow-xs"
                      >
                        Submit Quote
                      </button>
                    ) : (
                      <span className="text-[11px] font-semibold text-muted">{q.action}</span>
                    )}
                  </td>
                </tr>
              ))}
              {quotes.length === 0 && (
                <tr>
                  <td colSpan="6" className="py-6 text-center text-xs text-muted">
                    No active quotes in pipeline
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
          <h2 className="font-extrabold text-base text-navy mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            {quickActions.map((a) => (
              <a
                key={a.label}
                href={a.to}
                className="rounded-2xl border border-gray-100 hover:border-primary/40 hover:bg-lavender/40 transition p-4 text-center relative group"
              >
                <div className={`w-10 h-10 mx-auto rounded-2xl ${a.bg} grid place-items-center transition group-hover:scale-105`}>
                  <Icon name={a.icon} size={18} />
                </div>
                <div className="text-xs font-bold text-navy mt-2.5">{a.label}</div>
                {a.badge && (
                  <span className="absolute top-3 right-3 text-[10px] font-extrabold bg-red-500 text-white rounded-full w-4 h-4 grid place-items-center">
                    {a.badge}
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>

        {/* Your Services & Recent Reviews */}
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Your Services */}
          <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-extrabold text-base text-navy">Your Services</h2>
              <a href="/vendor/services" className="text-xs font-bold text-primary hover:underline">Edit Services</a>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(services.length > 0
                ? services
                : [
                    { name: 'Wedding Photography', pricing: { basePrice: 48000 }, status: 'Active' },
                    { name: 'Pre-wedding Shoot', pricing: { basePrice: 18000 }, status: 'Active' },
                    { name: 'Candid Photography', pricing: { basePrice: 28000 }, status: 'Active' },
                    { name: 'Corporate Events', pricing: { basePrice: 52000 }, status: 'Active' },
                  ]
              ).slice(0, 4).map((s) => (
                <div key={s._id || s.name} className="rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xs transition">
                  <img
                    src="https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=300&q=80"
                    alt={s.name}
                    className="h-20 w-full object-cover"
                  />
                  <div className="p-2.5">
                    <div className="text-xs font-bold text-navy truncate">{s.name}</div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-muted">₹{(s.pricing?.basePrice || 48000).toLocaleString()} base</span>
                      <span className="text-[10px] font-bold text-emerald-600">● {s.status || 'Active'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Reviews */}
          <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-extrabold text-base text-navy">Recent Reviews</h2>
              <a href="/vendor/reviews" className="text-xs font-bold text-primary hover:underline">View all</a>
            </div>
            <div className="border border-gray-100 rounded-2xl p-4 flex gap-3.5 items-start">
              <img
                src="https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=120&q=80"
                alt="Amit & Neha"
                className="w-12 h-12 rounded-xl object-cover shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-navy">Amit & Neha</span>
                  <span className="text-amber-500 font-bold text-xs">★★★★★</span>
                </div>
                <div className="text-[10px] text-muted">Wedding · Verified Booking</div>
                <p className="text-xs text-ink/80 mt-1.5 leading-relaxed italic">
                  "Absolutely amazing work! The team captured our special day beautifully. Highly recommended!"
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column Widgets */}
      <aside className="space-y-5 hidden xl:block">
        <MiniCalendar bookings={bookings} />

        {/* Scheduled Events Widget */}
        <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-extrabold text-sm text-navy">{bookings.length} Scheduled Events</h3>
            <a href="/vendor/bookings" className="text-[11px] font-bold text-primary hover:underline">View</a>
          </div>
          <ul className="space-y-3 text-xs">
            {bookings.slice(0, 3).map((b, idx) => (
              <li key={b.id || idx} className="flex justify-between items-center">
                <span className="flex items-center gap-2 font-medium truncate pr-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${idx === 0 ? 'bg-primary' : idx === 1 ? 'bg-emerald-500' : 'bg-orange-400'}`} />
                  <span className="truncate">{b.title || b.serviceName}</span>
                </span>
                <span className="text-muted font-semibold whitespace-nowrap">{b.eventDate || b.date || 'Scheduled'}</span>
              </li>
            ))}
            {bookings.length === 0 && (
              <li className="text-muted text-center py-2 text-[11px]">No bookings scheduled</li>
            )}
          </ul>
        </div>

        {/* Dynamic Notifications Widget */}
        <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-sm text-navy">Notifications</h3>
              {unreadNotifCount > 0 && (
                <span className="text-[10px] bg-red-500 text-white font-bold px-1.5 py-0.2 rounded-full">
                  {unreadNotifCount}
                </span>
              )}
            </div>
            {unreadNotifCount > 0 && (
              <button
                onClick={handleMarkAllNotificationsRead}
                className="text-[11px] font-bold text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="space-y-2.5 text-xs text-muted">
            {notifications.slice(0, 4).map((n) => (
              <li
                key={n._id}
                onClick={() => handleMarkNotificationRead(n._id)}
                className={`flex gap-3 items-start p-2 rounded-xl cursor-pointer transition ${
                  !n.isRead ? 'bg-primary-soft/50 border border-primary/20' : 'hover:bg-lavender/40 border border-transparent'
                }`}
              >
                <div className={`w-7 h-7 rounded-xl grid place-items-center text-xs shrink-0 mt-0.5 ${
                  n.type === 'PAYMENT' ? 'bg-emerald-50 text-emerald-600' :
                  n.type === 'QUOTE' ? 'bg-purple-50 text-purple-600' :
                  n.type === 'BOOKING' ? 'bg-sky-50 text-sky-600' : 'bg-primary-soft text-primary'
                }`}>
                  {n.type === 'PAYMENT' ? '₹' : n.type === 'QUOTE' ? '✓' : n.type === 'BOOKING' ? '📅' : '🔔'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <b className="text-navy truncate">{n.title}</b>
                    {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                  </div>
                  <div className="text-[11px] truncate text-ink/70">{n.message}</div>
                </div>
              </li>
            ))}
            {notifications.length === 0 && (
              <li className="text-muted text-center py-2 text-[11px]">No notifications</li>
            )}
          </ul>
        </div>

        <Performance enquiries={enquiries} quotes={quotes} bookings={bookings} />
      </aside>

      {/* Modals */}
      {selectedEnquiry && (
        <EnquiryModal
          enquiry={selectedEnquiry}
          onClose={() => setSelectedEnquiry(null)}
          onPrepareQuote={(e) => setQuoteEnquiry(e)}
        />
      )}

      {quoteEnquiry && (
        <QuoteModal
          enquiry={quoteEnquiry}
          onClose={() => setQuoteEnquiry(null)}
          onSubmitQuote={(q) => {
            handleSendQuote(q, quoteEnquiry);
          }}
        />
      )}
    </div>
  );
}
