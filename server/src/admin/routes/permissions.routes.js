import { Router } from 'express';
import { PERMISSION_CATALOG, ALL_PERMISSIONS } from '../constants/permissions.js';
import { requireAdminAuth, requirePermission } from '../middleware/requireAdminAuth.js';

const router = Router();

// Permission catalog — used by the Users & Access screens to render pickers.
router.get('/catalog', requireAdminAuth, requirePermission('permissions.read'), (req, res) => {
  res.json({ catalog: PERMISSION_CATALOG, all: ALL_PERMISSIONS });
});

export default router;
