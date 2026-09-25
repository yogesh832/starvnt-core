import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';

import externalAuthRoutes from './external/routes/auth.routes.js';
import vendorRoutes from './external/routes/vendor.routes.js';
import commercialRoutes from './external/routes/commercial.routes.js';
import transactionRoutes from './external/routes/transaction.routes.js';
import portfolioRoutes from './external/routes/portfolio.routes.js';
import aiRoutes from './external/routes/ai.routes.js';
import { requireExternalAuth, requireAccountType } from './external/middleware/requireExternalAuth.js';
import { customerRouter, auraRouter, internalRouter, webhookRouter } from './customer/routes/index.js';

import adminAuthRoutes from './admin/routes/auth.routes.js';
import adminUsersRoutes from './admin/routes/users.routes.js';
import adminPermissionsRoutes from './admin/routes/permissions.routes.js';
import adminAuditRoutes from './admin/routes/audit.routes.js';
import adminAutomationRoutes from './admin/routes/automation.routes.js';
import adminOperationsRoutes from './admin/routes/operations.routes.js';
import adminDisputesRoutes from './admin/routes/disputes.routes.js';
import adminPolicyRoutes from './admin/routes/policy.routes.js';
import adminExternalUsersRoutes from './admin/routes/external-users.routes.js';
import { requireAdminAuth, requirePermission } from './admin/middleware/requireAdminAuth.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigins, credentials: true }));
  // Payment webhooks need the raw body for signature checks: before express.json().
  app.use('/api/webhooks', webhookRouter);
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ limit: '25mb', extended: true }));
  app.use(cookieParser());

  app.get('/api/health', (req, res) =>
    res.json({ ok: true, domains: ['EXTERNAL', 'ADMIN'] })
  );

  // ── EXTERNAL domain: single auth for Customers + Vendors ──────────────────
  app.use('/api/auth', externalAuthRoutes);

  // Product-surface probes — prove domain isolation + account-type gating.
  app.get('/api/customer/me', requireExternalAuth, requireAccountType('CUSTOMER'), (req, res) => {
    res.json({ ok: true, user: req.externalUser.toSafeJSON() });
  });
  app.get('/api/vendor/me', requireExternalAuth, requireAccountType('VENDOR'), (req, res) => {
    res.json({ ok: true, user: req.externalUser.toSafeJSON() });
  });
  // Customer App + Aura+ (events, plan, chat)
  app.use('/api/customer', customerRouter);
  app.use('/api/aura', auraRouter);
  app.use('/api/internal', internalRouter);

  app.use('/api/vendor', vendorRoutes);
  app.use('/api/commercial', commercialRoutes);
  app.use('/api', transactionRoutes);
  app.use('/api', portfolioRoutes);
  app.use('/api/ai', aiRoutes);

  // ── INTERNAL ADMIN domain: separate auth + RBAC ───────────────────────────
  app.use('/api/admin/auth', adminAuthRoutes);
  app.use('/api/admin/users', adminUsersRoutes);
  app.use('/api/admin/permissions', adminPermissionsRoutes);
  app.use('/api/admin/audit', adminAuditRoutes);
  app.use('/api/admin/automation', adminAutomationRoutes);
  app.use('/api/admin/operations', adminOperationsRoutes);
  app.use('/api/admin/disputes', adminDisputesRoutes);
  app.use('/api/admin/policy', adminPolicyRoutes);
  app.use('/api/admin/external-users', adminExternalUsersRoutes);

  // Admin probe — requires admin session AND analytics.read (SUPER_ADMIN bypass).
  app.get(
    '/api/admin/ping',
    requireAdminAuth,
    requirePermission('analytics.read'),
    (req, res) => res.json({ ok: true, admin: req.admin.toSafeJSON() })
  );

  // 404 + error handler — no stack leakage.
  app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
  app.use((err, req, res, next) => {
    console.error('[server]', err);
    res.status(err.status || 500).json({ error: 'INTERNAL_ERROR', details: err.message, stack: err.stack });
  });

  return app;
}
