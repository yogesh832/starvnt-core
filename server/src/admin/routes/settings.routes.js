import express from 'express';
import { requireAdminAuth, requirePermission } from '../middleware/requireAdminAuth.js';
import { PlatformSetting } from '../models/PlatformSetting.js';
import { auditContext, recordAudit } from '../utils/audit.js';

const router = express.Router();

const DEFAULT_SETTINGS = [
  { key: 'platformName', label: 'Platform Name', value: 'STARVNT' },
  { key: 'supportEmail', label: 'Support Email', value: 'support@starvnt.com' },
  { key: 'timezone', label: 'Timezone', value: 'Asia/Kolkata' },
  { key: 'defaultCurrency', label: 'Default Currency', value: 'INR — Indian Rupee' },
];

function validateSetting(key, value) {
  const text = String(value || '').trim();
  if (!text) return 'SETTING_VALUE_REQUIRED';
  if (key === 'supportEmail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return 'INVALID_SUPPORT_EMAIL';
  if (key === 'timezone' && text !== 'Asia/Kolkata') return 'UNSUPPORTED_TIMEZONE';
  if (key === 'defaultCurrency' && !text.startsWith('INR')) return 'UNSUPPORTED_CURRENCY';
  if (key === 'platformName' && text.length > 80) return 'PLATFORM_NAME_TOO_LONG';
  return null;
}

async function ensureDefaultSettings() {
  await Promise.all(
    DEFAULT_SETTINGS.map((setting) =>
      PlatformSetting.findOneAndUpdate(
        { key: setting.key },
        { $setOnInsert: setting },
        { upsert: true, new: true }
      )
    )
  );
}

router.use(requireAdminAuth);

router.get('/', requirePermission('settings.read'), async (req, res, next) => {
  try {
    await ensureDefaultSettings();
    const settings = await PlatformSetting.find().sort({ key: 1 }).lean();
    res.json({ ok: true, settings });
  } catch (err) {
    next(err);
  }
});

router.put('/:key', requirePermission('settings.update'), async (req, res, next) => {
  try {
    const existingDefault = DEFAULT_SETTINGS.find((setting) => setting.key === req.params.key);
    if (!existingDefault) return res.status(404).json({ error: 'SETTING_NOT_FOUND' });

    const value = String(req.body?.value || '').trim();
    const validationError = validateSetting(req.params.key, value);
    if (validationError) return res.status(400).json({ error: validationError });

    const existing = await PlatformSetting.findOne({ key: req.params.key }).lean();
    const setting = await PlatformSetting.findOneAndUpdate(
      { key: req.params.key },
      {
        $set: {
          label: existingDefault.label,
          value,
          updatedBy: req.admin?.email || 'CORE_ADMIN',
        },
      },
      { new: true, upsert: true, runValidators: true }
    );

    await recordAudit({
      ...auditContext(req),
      action: 'SETTING_UPDATE',
      targetType: 'PlatformSetting',
      targetId: req.params.key,
      fromState: existing ? { value: existing.value, updatedBy: existing.updatedBy } : null,
      toState: { value: setting.value, updatedBy: setting.updatedBy },
      reason: req.body?.reason || '',
      idempotencyKey: req.body?.idempotencyKey,
    });

    res.json({ ok: true, setting });
  } catch (err) {
    next(err);
  }
});

export default router;
