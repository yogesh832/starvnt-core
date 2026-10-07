import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';
import { ArtTile, AvailabilityPill, BackLink, DemoBadge, DetailSkeleton, PriceText, RatingText, useLoad } from './customerUi.jsx';
import { formatINR } from './format.js';
import SelectOptionButton from './SelectOptionButton.jsx';

function Line({ label, value }) {
  return (
    <div className="flex justify-between text-xs py-1.5 border-b border-gray-100 dark:border-gray-800/60 last:border-0">
      <span className="text-muted dark:text-slate-400">{label}</span>
      <span className="font-semibold text-navy dark:text-white">{value}</span>
    </div>
  );
}

// 0 → "Included"; null → the vendor didn't specify it.
const money = (n) => (n == null ? 'Not specified' : n === 0 ? 'Included' : formatINR(n));

/* ─── Section Header ─── */
function SectionHeader({ icon, title, count }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-8 h-8 rounded-xl bg-primary/10 dark:bg-primary/20 grid place-items-center">
        <Icon name={icon} size={16} className="text-primary dark:text-[#a5b4fc]" />
      </div>
      <h2 className="text-sm font-extrabold text-navy dark:text-white">{title}</h2>
      {count != null && <span className="text-[10px] font-bold text-muted dark:text-slate-300 bg-lavender dark:bg-white/10 rounded-full px-2 py-0.5">{count}</span>}
    </div>
  );
}

/* ─── Portfolio Gallery ─── */
function PortfolioGallery({ items }) {
  const [showAll, setShowAll] = useState(false);
  if (!items?.length) return null;
  const featured = items.filter(i => i.isFeatured);
  const others = items.filter(i => !i.isFeatured);
  const display = showAll ? items : items.slice(0, 8);

  return (
    <div className="bg-white dark:bg-[#161926] border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm p-4 sm:p-5">
      <SectionHeader icon="camera" title="Portfolio & Past Work" count={items.length} />
      {featured.length > 0 && (
        <div className="mb-3">
          <div className="grid grid-cols-2 gap-2">
            {featured.slice(0, 2).map(item => (
              <div key={item._id} className="relative group overflow-hidden rounded-xl aspect-[4/3]">
                {item.mediaType === 'VIDEO' || item.mediaType === 'REEL' || item.mediaType === 'HIGHLIGHT_FILM' ? (
                  <div className="w-full h-full bg-slate-900 grid place-items-center">
                    <Icon name="play" size={32} className="text-white/80" />
                  </div>
                ) : (
                  <img src={item.thumbnailUrl || item.url} alt={item.title || item.projectName || ''} className="w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="text-white text-[11px] font-bold truncate">{item.projectName || item.title}</div>
                  {item.eventType && <div className="text-white/70 text-[9px]">{item.eventType} · {item.style}</div>}
                </div>
                {item.status === 'BOOKING_PROVEN' && (
                  <div className="absolute top-1.5 right-1.5 bg-emerald-500 text-white text-[8px] font-bold rounded-full px-1.5 py-0.5">✓ Proven</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-4 gap-1.5">
        {display.filter(i => !i.isFeatured || showAll).slice(0, showAll ? 100 : 8).map(item => (
          <div key={item._id} className="relative group overflow-hidden rounded-lg aspect-square cursor-pointer">
            {item.mediaType === 'VIDEO' || item.mediaType === 'REEL' || item.mediaType === 'HIGHLIGHT_FILM' ? (
              <div className="w-full h-full bg-slate-800 grid place-items-center">
                <Icon name="play" size={18} className="text-white/70" />
              </div>
            ) : (
              <img src={item.thumbnailUrl || item.url} alt="" className="w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition" />
          </div>
        ))}
      </div>
      {items.length > 8 && !showAll && (
        <button onClick={() => setShowAll(true)} className="mt-3 text-xs font-bold text-primary dark:text-[#a5b4fc] hover:underline cursor-pointer">
          View all {items.length} items →
        </button>
      )}
    </div>
  );
}

/* ─── Capabilities ─── */
function CapabilitiesSection({ capabilities }) {
  if (!capabilities?.length) return null;
  return (
    <div className="bg-white dark:bg-[#161926] border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm p-4 sm:p-5">
      <SectionHeader icon="services" title="Capabilities & Styles" />
      <div className="space-y-3">
        {capabilities.map((cap, i) => (
          <div key={cap._id || i}>
            {cap.styles?.length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted dark:text-slate-400 mb-1">Styles</div>
                <div className="flex flex-wrap gap-1.5">
                  {cap.styles.map(s => (
                    <span key={s} className="text-[11px] font-semibold bg-primary-soft dark:bg-primary/20 text-primary dark:text-[#a5b4fc] rounded-full px-2.5 py-1">{s}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {cap.format && (
                <div className="bg-lavender/50 dark:bg-white/5 rounded-xl p-2.5">
                  <div className="text-muted dark:text-slate-400 text-[10px] font-semibold">Format</div>
                  <div className="font-bold text-navy dark:text-white mt-0.5">{cap.format}</div>
                </div>
              )}
              {cap.teamSize > 0 && (
                <div className="bg-lavender/50 dark:bg-white/5 rounded-xl p-2.5">
                  <div className="text-muted dark:text-slate-400 text-[10px] font-semibold">Team Size</div>
                  <div className="font-bold text-navy dark:text-white mt-0.5">{cap.teamSize} members</div>
                </div>
              )}
              {cap.simultaneousEventLimit > 0 && (
                <div className="bg-lavender/50 dark:bg-white/5 rounded-xl p-2.5">
                  <div className="text-muted dark:text-slate-400 text-[10px] font-semibold">Concurrent Events</div>
                  <div className="font-bold text-navy dark:text-white mt-0.5">Up to {cap.simultaneousEventLimit}</div>
                </div>
              )}
            </div>
            {cap.equipment?.length > 0 && (
              <div className="mt-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted dark:text-slate-400 mb-1">Equipment</div>
                <div className="flex flex-wrap gap-1.5">
                  {cap.equipment.map(e => (
                    <span key={e} className="text-[10px] font-medium bg-gray-100 dark:bg-white/10 text-ink/70 dark:text-slate-300 rounded-lg px-2 py-1">{e}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Reviews & Ratings ─── */
function ReviewsSection({ reviews = [], rating, googleRating }) {
  const [activeTab, setActiveTab] = useState('starvnt'); // 'starvnt' | 'google'
  const [showAll, setShowAll] = useState(false);

  const hasStarvnt = reviews?.length > 0;
  const hasGoogle = Boolean(googleRating?.rating);

  if (!hasStarvnt && !hasGoogle) return null;

  // Default to Google if no STARVNT reviews exist, or stick with user's selection
  const currentTab = (!hasStarvnt && hasGoogle) ? 'google' : (hasStarvnt && !hasGoogle) ? 'starvnt' : activeTab;
  const display = showAll ? reviews : reviews.slice(0, 4);

  return (
    <div className="bg-white dark:bg-[#161926] border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <SectionHeader
          icon="star"
          title="Ratings & Reviews"
          count={hasStarvnt ? reviews.length : googleRating?.reviewCount}
        />

        {/* Rating Tabs: STARVNT Reviews vs Google Rating */}
        {hasStarvnt && hasGoogle && (
          <div className="flex gap-1 bg-lavender/50 dark:bg-white/10 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('starvnt')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                currentTab === 'starvnt' ? 'bg-white dark:bg-[#1e2235] text-navy dark:text-white shadow-xs' : 'text-muted dark:text-slate-400 hover:text-navy dark:hover:text-white'
              }`}
            >
              <span>STARVNT Reviews</span>
              <span className="text-[10px] bg-primary/10 text-primary dark:text-[#a5b4fc] px-1.5 py-0.5 rounded-full font-bold">
                {reviews.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('google')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                currentTab === 'google' ? 'bg-white dark:bg-[#1e2235] text-navy dark:text-white shadow-xs' : 'text-muted dark:text-slate-400 hover:text-navy dark:hover:text-white'
              }`}
            >
              <span>Google Rating</span>
              <span className="text-[10px] bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-bold">
                ★ {googleRating.rating}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* ─── Tab 1: STARVNT Reviews ─── */}
      {currentTab === 'starvnt' && (
        <div>
          {rating && (
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
              <div className="text-3xl font-extrabold text-navy dark:text-white">{rating.average?.toFixed(1) || '—'}</div>
              <div>
                <div className="text-yellow-500 text-sm">
                  {'★'.repeat(Math.round(rating.average || 0))}
                  {'☆'.repeat(5 - Math.round(rating.average || 0))}
                </div>
                <div className="text-[11px] text-muted dark:text-slate-400 font-semibold">{rating.count || 0} verified client reviews</div>
              </div>
            </div>
          )}

          {reviews.length > 0 ? (
            <div className="space-y-3">
              {display.map(r => (
                <div key={r._id} className="border border-gray-100 dark:border-gray-800 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/10 dark:bg-primary/20 grid place-items-center text-[11px] font-bold text-primary dark:text-[#a5b4fc]">
                        {r.customerName?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-navy dark:text-white">{r.customerName}</div>
                        <div className="text-[9px] text-muted dark:text-slate-400">{r.eventType}{r.eventDate ? ` · ${r.eventDate}` : ''}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-yellow-500 text-[11px]">{'★'.repeat(r.rating)}</span>
                      {r.isVerified && <Icon name="shieldCheck" size={12} className="text-emerald-500" />}
                    </div>
                  </div>
                  <p className="text-xs text-ink/80 dark:text-slate-200 leading-relaxed">{r.reviewText}</p>
                  {r.vendorReply?.text && (
                    <div className="mt-2 bg-lavender/40 dark:bg-white/5 rounded-lg p-2 text-[11px]">
                      <span className="font-bold text-navy dark:text-white">Vendor reply:</span>{' '}
                      <span className="text-ink/70 dark:text-slate-300">{r.vendorReply.text}</span>
                    </div>
                  )}
                </div>
              ))}

              {reviews.length > 4 && !showAll && (
                <button onClick={() => setShowAll(true)} className="mt-3 text-xs font-bold text-primary dark:text-[#a5b4fc] hover:underline cursor-pointer">
                  See all {reviews.length} reviews →
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted dark:text-slate-400">No verified STARVNT reviews yet.</p>
          )}
        </div>
      )}

      {/* ─── Tab 2: Google Rating & Reviews Section ─── */}
      {currentTab === 'google' && googleRating && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-amber-50/50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/40 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white dark:bg-[#1e2235] shadow-xs grid place-items-center font-extrabold text-lg text-navy dark:text-white border border-gray-100 dark:border-gray-700">
                {googleRating.rating}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <div className="text-yellow-500 text-sm">
                    {'★'.repeat(Math.round(googleRating.rating || 0))}
                    {'☆'.repeat(5 - Math.round(googleRating.rating || 0))}
                  </div>
                  <span className="text-xs font-bold text-navy dark:text-white">Google Maps Rating</span>
                </div>
                <div className="text-[11px] text-muted dark:text-slate-400 font-semibold">
                  {googleRating.reviewCount} public reviews
                  {googleRating.address ? ` · ${googleRating.address}` : ''}
                </div>
              </div>
            </div>
            {googleRating.googleMapsUrl && (
              <a
                href={googleRating.googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold bg-white dark:bg-[#1e2235] text-primary dark:text-[#a5b4fc] px-3 py-1.5 rounded-lg border border-primary/20 dark:border-primary/40 hover:bg-primary-soft transition"
              >
                <span>View on Maps</span>
                <span>↗</span>
              </a>
            )}
          </div>

          {/* Individual Google Reviews (if populated) */}
          {googleRating.reviews?.length > 0 ? (
            <div className="space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted">Recent Google Reviews</div>
              {googleRating.reviews.map((gr, idx) => {
                const authorName = gr.authorAttribution?.displayName || gr.author || 'Google User';
                const photoUrl = gr.authorAttribution?.photoUri;
                const authorUri = gr.authorAttribution?.uri;
                const reviewText = gr.text?.text || gr.originalText?.text || gr.text || '';
                const ratingNum = Math.round(gr.rating || 5);
                const publishTime = gr.relativePublishTimeDescription;

                return (
                  <div key={idx} className="border border-gray-100 rounded-xl p-3 bg-white">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        {photoUrl ? (
                          <img src={photoUrl} alt={authorName} className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 grid place-items-center text-[11px] font-bold">
                            {authorName[0]?.toUpperCase() || 'G'}
                          </div>
                        )}
                        <div>
                          {authorUri ? (
                            <a href={authorUri} target="_blank" rel="noreferrer" className="text-xs font-bold text-navy hover:underline">
                              {authorName}
                            </a>
                          ) : (
                            <div className="text-xs font-bold text-navy">{authorName}</div>
                          )}
                          {publishTime && <div className="text-[9px] text-muted">{publishTime}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-yellow-500 text-[11px]">{'★'.repeat(ratingNum)}</span>
                        <span className="text-[9px] bg-gray-100 text-muted px-1.5 py-0.5 rounded font-semibold">Google</span>
                      </div>
                    </div>
                    {reviewText && <p className="text-xs text-ink/80 leading-relaxed">{reviewText}</p>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-muted text-center py-2 bg-gray-50/50 rounded-xl">
              Authentic rating synced from Google Places. Click "View on Maps ↗" above to read and verify all customer feedback.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Resources (Team & Equipment) ─── */
function ResourcesSection({ resources }) {
  if (!resources?.length) return null;
  const team = resources.filter(r => ['TEAM_MEMBER', 'STAFF', 'TEAM'].includes(r.type));
  const equipment = resources.filter(r => !['TEAM_MEMBER', 'STAFF', 'TEAM'].includes(r.type));
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
      <SectionHeader icon="vendors" title="Team & Equipment" count={resources.length} />
      {team.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted mb-1.5">Team Members</div>
          <div className="flex flex-wrap gap-2">
            {team.map(r => (
              <div key={r._id} className="flex items-center gap-2 bg-lavender/40 rounded-xl px-3 py-2">
                <div className="w-6 h-6 rounded-full bg-primary/15 grid place-items-center text-[10px] font-bold text-primary">
                  {r.name?.[0]?.toUpperCase()}
                </div>
                <span className="text-xs font-semibold text-navy">{r.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {equipment.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted mb-1.5">Equipment & Assets</div>
          <div className="flex flex-wrap gap-1.5">
            {equipment.map(r => (
              <span key={r._id} className="text-[10px] font-medium bg-gray-100 text-ink/70 rounded-lg px-2 py-1">
                {r.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Locations & Travel ─── */
function LocationsSection({ locations, travelPolicy }) {
  if (!locations?.length && !travelPolicy) return null;
  const primary = locations?.find(l => l.isPrimary);
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
      <SectionHeader icon="mapPin" title="Coverage & Travel" />
      {locations?.length > 0 && (
        <div className="space-y-2 mb-3">
          {locations.map(loc => (
            <div key={loc._id} className="flex items-start gap-2 text-xs">
              <Icon name="mapPin" size={14} className={`mt-0.5 shrink-0 ${loc.isPrimary ? 'text-primary' : 'text-muted'}`} />
              <div>
                <div className="font-bold text-navy">
                  {loc.label}
                  {loc.isPrimary && <span className="text-[9px] ml-1 text-primary font-semibold">★ Primary</span>}
                </div>
                <div className="text-muted text-[11px]">{loc.address}, {loc.city}{loc.state ? `, ${loc.state}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {travelPolicy && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <div className="bg-emerald-50 rounded-xl p-2.5">
            <div className="text-emerald-600 text-[10px] font-semibold">Free Travel</div>
            <div className="font-bold text-navy mt-0.5">{travelPolicy.freeRadiusKm} km</div>
          </div>
          <div className="bg-orange-50 rounded-xl p-2.5">
            <div className="text-orange-500 text-[10px] font-semibold">Per km Rate</div>
            <div className="font-bold text-navy mt-0.5">{formatINR(travelPolicy.perKmRate)}/km</div>
          </div>
          {travelPolicy.equipmentTransitFee > 0 && (
            <div className="bg-sky-50 rounded-xl p-2.5">
              <div className="text-sky-600 text-[10px] font-semibold">Equipment Transit</div>
              <div className="font-bold text-navy mt-0.5">{formatINR(travelPolicy.equipmentTransitFee)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Google Rating ─── */
function GoogleRatingSection({ google }) {
  if (!google?.rating) return null;
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
      <SectionHeader icon="star" title="Google Maps Rating" />
      <div className="flex items-center gap-3">
        <div className="text-2xl font-extrabold text-navy">{google.rating}</div>
        <div>
          <div className="text-yellow-500 text-sm">{'★'.repeat(Math.round(google.rating))}{'☆'.repeat(5 - Math.round(google.rating))}</div>
          <div className="text-[11px] text-muted font-semibold">{google.reviewCount} reviews on Google</div>
        </div>
        {google.googleMapsUrl && (
          <a href={google.googleMapsUrl} target="_blank" rel="noreferrer" className="ml-auto text-[11px] font-bold text-primary hover:underline">
            View on Maps ↗
          </a>
        )}
      </div>
    </div>
  );
}

/* ─── Working Hours ─── */
function WorkingHoursSection({ hours }) {
  if (!hours) return null;
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const today = days[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
      <SectionHeader icon="calendar" title="Working Hours" />
      <div className="space-y-1">
        {days.map(d => {
          const info = hours[d];
          const isToday = d === today;
          return (
            <div key={d} className={`flex justify-between text-xs py-1 ${isToday ? 'font-bold text-primary' : 'text-ink/70'}`}>
              <span className="capitalize">{d}{isToday ? ' (Today)' : ''}</span>
              <span>{info?.isOpen ? info.hours || 'Open' : 'Closed'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function ServiceDetailPage() {
  const { id, serviceId } = useParams();
  const { data, error, loading, setData } = useLoad(() => customerApi.serviceDetail(id, serviceId), [id, serviceId]);

  if (loading) return <DetailSkeleton />;
  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <BackLink to={`/customer/events/${id}/services`}>Options</BackLink>
        <div className="mt-3 text-sm text-red-500">{error.status === 404 ? 'This option is not available.' : errorText(error)}</div>
      </div>
    );
  }
  const { option, vendorProfile, portfolio, capabilities, reviews, resources, locations, travelPolicy, googleRating } = data;
  const cb = option.costBreakdown;
  const vp = vendorProfile || {};

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <BackLink to={`/customer/events/${id}/services?category=${option.category}`}>All options</BackLink>

      {/* ─── Hero Section ─── */}
      <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
        {/* Cover / Gallery Strip */}
        {portfolio?.length > 0 ? (
          <div className="h-48 sm:h-56 flex gap-0.5 overflow-hidden">
            {portfolio.filter(p => p.mediaType === 'IMAGE').slice(0, 3).map((p, i) => (
              <div key={p._id} className={`h-full overflow-hidden ${i === 0 ? 'flex-[2]' : 'flex-1 hidden sm:block'}`}>
                <img src={p.thumbnailUrl || p.url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
            {portfolio.filter(p => p.mediaType === 'IMAGE').length < 2 && (
              <div className="flex-1 h-full">
                <ArtTile option={option} className="h-full rounded-none" />
              </div>
            )}
          </div>
        ) : (
          <ArtTile option={option} className="h-48 sm:h-56 rounded-none" />
        )}

        {/* Vendor Info */}
        <div className="p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              {vp.profilePicUrl ? (
                <img src={vp.profilePicUrl} alt="" className="w-14 h-14 rounded-2xl object-cover shrink-0 border-2 border-white shadow-md -mt-10 relative z-10 bg-white" />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-white grid place-items-center text-lg font-bold shrink-0 -mt-10 relative z-10 shadow-md border-2 border-white">
                  {(option.vendorName || '?')[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-extrabold text-navy">{option.vendorName}</h1>
                  {vp.isVerified && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
                      <Icon name="shieldCheck" size={11} /> Verified
                    </span>
                  )}
                  {option.isDemo && <DemoBadge />}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-muted">
                  {(vp.category || option.category) && <span className="font-semibold">{vp.category || option.category}</span>}
                  {option.vendorLocation && <span>· {option.vendorLocation}</span>}
                  {vp.phone && <span>· {vp.phone}</span>}
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <RatingText rating={option.rating} reviewCount={option.reviewCount} />
                  {googleRating?.rating && (
                    <span className="text-[11px] text-muted">
                      · Google <span className="text-yellow-500">★</span> {googleRating.rating}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <AvailabilityPill value={option.availability} />
          </div>
          {(option.description || vp.bio) && (
            <p className="text-[13px] text-ink/80 leading-relaxed mt-4">{option.description || vp.bio}</p>
          )}
          {vp.website && (
            <a href={vp.website.startsWith('http') ? vp.website : `https://${vp.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-primary mt-2 hover:underline">
              <Icon name="link" size={12} /> {vp.website}
            </a>
          )}
        </div>
      </div>

      {/* ─── Pricing & Package ─── */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
          <SectionHeader icon="wallet" title="Package & Pricing" />
          <div className="text-sm font-extrabold text-navy">{option.packageName}</div>
          <div className="mt-3">
            {cb ? (
              <>
                <Line label="Base" value={money(cb.base)} />
                <Line label="Travel" value={money(cb.travel)} />
                <Line label="Additional" value={money(cb.additional)} />
              </>
            ) : null}
          </div>
          <div className="mt-3"><PriceText option={option} large /></div>
          {option.mayApply?.length > 0 && (
            <div className="mt-3 text-[11px] text-muted">
              <div className="font-bold text-navy">May apply</div>
              {option.mayApply.map((m) => (
                <div key={m.name}>{m.name}: {formatINR(m.amount)}{m.condition ? ` (${m.condition})` : ''}</div>
              ))}
            </div>
          )}
          {option.cancellationPolicy && <div className="mt-2 text-[11px] text-muted">Cancellation: {option.cancellationPolicy}</div>}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
          <SectionHeader icon="check" title="What's Included" />
          {option.includes?.length ? (
            <ul className="space-y-1.5">
              {option.includes.map((i) => (
                <li key={i} className="text-xs text-ink/80 flex gap-1.5"><Icon name="check" size={12} className="text-emerald-500 mt-0.5 shrink-0" /> {i}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">Not specified by the vendor.</p>
          )}
        </div>
      </div>

      {/* ─── Portfolio Gallery ─── */}
      <PortfolioGallery items={portfolio} />

      {/* ─── Capabilities ─── */}
      <CapabilitiesSection capabilities={capabilities} />

      {/* ─── Resources ─── */}
      <ResourcesSection resources={resources} />

      {/* ─── Reviews & Ratings ─── */}
      <ReviewsSection reviews={reviews} rating={vp.rating} googleRating={googleRating} />

      {/* ─── Google Rating ─── */}
      <GoogleRatingSection google={googleRating} />

      {/* ─── Locations & Travel ─── */}
      <div className="grid sm:grid-cols-2 gap-4">
        <LocationsSection locations={locations} travelPolicy={travelPolicy} />
        <WorkingHoursSection hours={vp.workingHours} />
      </div>

      {/* ─── Action Bar ─── */}
      <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <SelectOptionButton
            eventId={id}
            eventStatus={data.event.status}
            option={option}
            selected={data.selected}
            onChanged={(optionId) => setData({ ...data, selected: optionId === option.id })}
          />
          {data.selected && (
            <Link to={`/customer/events/${id}/quotes`} className="rounded-xl bg-emerald-600 text-white text-xs font-bold px-5 py-2.5 hover:bg-emerald-700 transition">Get a quote →</Link>
          )}
          <Link
            to={`/customer/aura?event=${id}&ask=${encodeURIComponent(`Why pick ${option.vendorName} – ${option.packageName}?`)}`}
            className="rounded-xl border border-gray-200 text-navy text-xs font-bold px-5 py-2.5 hover:bg-lavender transition"
          >
            Ask Aura+ about this option
          </Link>
        </div>
      </div>
    </div>
  );
}
