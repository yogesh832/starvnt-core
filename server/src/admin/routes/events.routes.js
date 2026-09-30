import { Router } from 'express';
import { requireAdminAuth, requirePermission } from '../middleware/requireAdminAuth.js';
import { CustomerEvent } from '../../customer/models/index.js';
import { ExternalUser } from '../../external/models/ExternalUser.js';

const router = Router();

function escapeRegex(text = '') {
  return String(text).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

function eventTypeLabel(event) {
  if (!event) return 'Event';
  if (event.eventType === 'other' && event.customType) return event.customType;
  return event.eventType
    ? String(event.eventType)
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    : 'Event';
}

router.use(requireAdminAuth, requirePermission('events.read'));

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
    const filter = {};

    const tab = req.query.tab || req.query.status;
    if (tab && tab !== 'All') {
      const status = String(tab).toLowerCase().replace(/\s+/g, '_');
      if (status === 'in_progress') filter.status = 'in_progress';
      else filter.status = status;
    }

    if (req.query.search && req.query.search.trim()) {
      const term = escapeRegex(req.query.search.trim());
      const regex = { $regex: term, $options: 'i' };
      const matchingCustomers = await ExternalUser.find({
        $or: [{ fullName: regex }, { email: regex }, { phone: regex }],
      }).select('_id').limit(100);

      filter.$or = [
        { title: regex },
        { eventType: regex },
        { customType: regex },
        { city: regex },
        { 'location.locality': regex },
        { 'location.venueName': regex },
        { 'location.address': regex },
        ...(matchingCustomers.length ? [{ customer: { $in: matchingCustomers.map((u) => u._id) } }] : []),
      ];
    }

    const [events, total, statusAgg] = await Promise.all([
      CustomerEvent.find(filter)
        .populate('customer', 'fullName email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CustomerEvent.countDocuments(filter),
      CustomerEvent.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

    const stats = statusAgg.reduce((acc, row) => {
      acc[row._id || 'unknown'] = row.count;
      acc.total += row.count;
      return acc;
    }, { total: 0 });

    res.json({
      ok: true,
      events: events.map((event) => ({
        ...event,
        displayTitle: event.title || `My ${eventTypeLabel(event).toLowerCase()}`,
        eventTypeLabel: eventTypeLabel(event),
        customerName: event.customer?.fullName || event.customer?.email || 'Customer',
        customerEmail: event.customer?.email || '',
        locationLabel: [event.location?.venueName, event.location?.locality, event.city].filter(Boolean).join(', ') || event.city || 'Location not set',
      })),
      total,
      count: events.length,
      stats,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
