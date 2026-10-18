import { Router } from "express";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { config } from "../config.js";
import { requireExternalAuth } from "../external/middleware/requireExternalAuth.js";
import { activeAccountType } from "../external/models/ExternalUser.js";
import { requireAdminAuth } from "../admin/middleware/requireAdminAuth.js";
import { PushSubscription } from "./push.models.js";
import { registration } from "./push.contract.js";

export function pushRoutes(domain) {
  const router = Router();
  router.use(domain === "admin" ? requireAdminAuth : requireExternalAuth);
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 30,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  router.post("/devices", async (req, res, next) => {
    try {
      if (!config.pushEnabled)
        return res.status(503).json({ error: "PUSH_NOT_CONFIGURED" });
      const owner = domain === "admin" ? req.admin : req.externalUser;
      const session =
        domain === "admin" ? req.adminSession : req.externalSession;
      const surface = domain === "admin" ? "ADMIN" : activeAccountType(owner);
      const identity = {
        domain,
        ownerId: owner._id,
        sessionId: session._id,
        surface,
        audienceId: surface === "VENDOR" ? owner.vendorOrganization : owner._id,
      };
      const input = registration(
        req.body || {},
        identity,
        config.pushProjectId,
      );
      const filter = { domain, installationId: input.installationId };
      const existing = await PushSubscription.findOne(filter).lean();
      const same =
        existing?.enabled &&
        String(existing.ownerId) === String(owner._id) &&
        String(existing.sessionId) === String(session._id) &&
        existing.surface === surface;
      const now = new Date();
      const update = {
        ...input,
        enabled: true,
        disabledReason: "",
        lastSeenAt: now,
        expiresAt: session.expiresAt,
        ...(same
          ? {}
          : { bindingId: crypto.randomUUID(), boundAt: now, cursor: {} }),
      };
      // A refreshed provider token replaces the previous installation token for this domain.
      await PushSubscription.deleteMany({
        domain,
        token: input.token,
        installationId: { $ne: input.installationId },
      });
      const saved = await PushSubscription.findOneAndUpdate(
        filter,
        { $set: update },
        { upsert: true, new: true, runValidators: true },
      );
      res.json({ ok: true, bindingId: saved.bindingId });
    } catch (err) {
      if (err.status)
        return res.status(err.status).json({ error: err.message });
      if (err.code === 11000)
        return res.status(409).json({ error: "PUSH_REGISTRATION_CONFLICT" });
      next(err);
    }
  });
  router.delete("/devices/:installationId", async (req, res, next) => {
    try {
      const owner = domain === "admin" ? req.admin : req.externalUser;
      await PushSubscription.updateOne(
        {
          domain,
          installationId: req.params.installationId,
          ownerId: owner._id,
          bindingId: req.body?.bindingId || "",
        },
        { $set: { enabled: false, disabledReason: "USER_DISABLED" } },
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });
  return router;
}
