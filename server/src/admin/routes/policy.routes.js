import express from 'express';
import { requireAdminAuth } from '../middleware/requireAdminAuth.js';
import { CorePolicy } from '../models/CorePolicy.js';

const router = express.Router();

// Require admin authentication
router.use(requireAdminAuth);

/**
 * Get all policies
 */
router.get('/', async (req, res, next) => {
  try {
    const policies = await CorePolicy.find().sort({ category: 1 });
    res.json({ ok: true, count: policies.length, policies });
  } catch (err) {
    next(err);
  }
});

/**
 * Get policy by category
 */
router.get('/:category', async (req, res, next) => {
  try {
    const policy = await CorePolicy.findOne({ category: req.params.category });
    if (!policy) {
      return res.status(404).json({ error: 'POLICY_NOT_FOUND' });
    }
    res.json({ ok: true, policy });
  } catch (err) {
    next(err);
  }
});

/**
 * Create or Update a policy
 */
router.put('/:category', async (req, res, next) => {
  try {
    const coreActor = req.admin ? req.admin.email : 'CORE_ADMIN';
    const payload = req.body;
    payload.updatedBy = coreActor;

    const policy = await CorePolicy.findOneAndUpdate(
      { category: req.params.category },
      { $set: payload },
      { new: true, upsert: true, runValidators: true }
    );

    res.json({ ok: true, message: `Policy for ${req.params.category} updated successfully`, policy });
  } catch (err) {
    res.status(400).json({ error: 'POLICY_UPDATE_ERROR', message: err.message });
  }
});

export default router;
