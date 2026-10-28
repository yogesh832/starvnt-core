import { NotificationPreference } from './preferences.models.js';
import { notificationDelivery } from './policy.js';
import crypto from "node:crypto";
import { config } from "../config.js";
import { PushSubscription, PushJob } from "./push.models.js";
import {
  CustomerNotification,
  CustomerEvent,
} from "../customer/models/index.js";
import { Notification } from "../external/models/Notification.js";
import { ExternalUser } from "../external/models/ExternalUser.js";
import { ExternalSession } from "../external/models/ExternalSession.js";
import { AdminUser } from "../admin/models/AdminUser.js";
import { AdminSession } from "../admin/models/AdminSession.js";
import { AdminAuditLog } from "../admin/models/AdminAuditLog.js";
import { VendorOrganization } from "../external/models/VendorOrganization.js";
import { CoreBooking } from "../admin/models/CoreBooking.js";
import { AdminApprovalRequest } from "../admin/models/AdminApprovalRequest.js";
import { OutboxEvent } from "../admin/models/OutboxEvent.js";
import {
  afterCursor,
  currentBinding,
  expoMessage,
  retryDelay,
  classifyPushError,
} from "./push.contract.js";

const can = (admin, permissions = []) =>
  admin?.status === "ACTIVE" &&
  (admin.role === "SUPER_ADMIN" ||
    permissions.every((p) => admin.permissions?.includes(p)));
export async function bindingIdentity(binding) {
  const admin = binding.domain === "admin";
  const [owner, session] = await Promise.all([
    (admin ? AdminUser : ExternalUser).findById(binding.ownerId).lean(),
    (admin ? AdminSession : ExternalSession).findById(binding.sessionId).lean(),
  ]);
  if (
    !owner ||
    owner.status !== "ACTIVE" ||
    !session ||
    session.revokedAt ||
    new Date(session.expiresAt) <= new Date() ||
    String(admin ? session.admin : session.user) !== String(binding.ownerId)
  )
    return null;
  if (
    !admin &&
    ((session.accountType || owner.accountType) !== binding.surface ||
      (binding.surface === "VENDOR" &&
        String(owner.vendorOrganization) !== String(binding.audienceId)))
  )
    return null;
  return owner;
}

function sources(binding, owner) {
  if (binding.surface === "CUSTOMER")
    return [
      {
        key: "customer",
        model: CustomerNotification,
        filter: { customer: binding.audienceId },
        map: (n) => ({
          type: n.type,
          priorityRank: ({ CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 })[n.priority] ?? 2,
          title: n.title,
          body: n.body,
          actionUrl: n.actionUrl || `/customer/events/${n.event || ""}`,
          eventId: n.event,
          threadId: n.payload?.threadId,
        }),
      },
    ];
  if (binding.surface === "VENDOR")
    return [
      {
        key: "vendor",
        model: Notification,
        filter: { vendor: binding.audienceId },
        map: (n) => ({
          type: n.type,
          priorityRank: ({ CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 })[n.priority] ?? 2,
          title: n.title,
          body: n.message,
          actionUrl: n.link,
          threadId: n.metadata?.threadId,
        }),
      },
    ];
  // Core's web inbox is derived from these live operational sources rather than a notification collection.
  return [
    {
      key: "audit",
      model: AdminAuditLog,
      permissions: ["audit.read"],
      map: (n) => ({
        title: "STARVNT Core activity",
        body: String(n.action).replaceAll("_", " "),
        actionUrl: "/admin/audit",
      }),
    },
    {
      key: "vendors",
      model: VendorOrganization,
      field: "updatedAt",
      permissions: ["vendors.read", "vendors.approve"],
      filter: {
        "verification.isVerified": { $ne: true },
        status: { $ne: "REJECTED" },
      },
      map: () => ({
        title: "Vendor review pending",
        body: "Review vendor verification in Core.",
        actionUrl: "/admin/vendors?tab=Pending",
      }),
    },
    {
      key: "events",
      model: CustomerEvent,
      field: "updatedAt",
      permissions: ["events.read"],
      filter: { status: { $in: ["draft", "planning"] } },
      map: () => ({
        title: "Event planning update",
        body: "Review customer event requirements in Core.",
        actionUrl: "/admin/events",
      }),
    },
    {
      key: "payments",
      model: CoreBooking,
      field: "updatedAt",
      permissions: ["bookings.read", "payments.approve"],
      filter: { paymentStatus: "PENDING" },
      map: () => ({
        title: "Payment verification pending",
        body: "Review the booking payment evidence in Core.",
        actionUrl: "/admin/bookings?tab=Pending",
      }),
    },
    {
      key: "execution",
      model: CoreBooking,
      field: "updatedAt",
      permissions: ["bookings.read", "execution.read"],
      filter: {
        executionStatus: {
          $in: ["SERVICE_SCHEDULED", "SERVICE_STARTED", "COMPLETION_SUBMITTED"],
        },
      },
      map: () => ({
        title: "Booking execution update",
        body: "Review service progress and completion evidence in Core.",
        actionUrl: "/admin/bookings?tab=In%20Progress",
      }),
    },
    {
      key: "automation",
      model: OutboxEvent,
      field: "updatedAt",
      permissions: ["automation.read"],
      filter: { status: { $in: ["PENDING", "FAILED", "DEAD_LETTER"] } },
      map: (n) => ({
        title:
          n.status === "PENDING"
            ? "Automation job queued"
            : "Automation needs attention",
        body: "Review the automation queue in Core.",
        actionUrl: "/admin/automation",
      }),
    },
    {
      key: "refunds",
      model: AdminApprovalRequest,
      field: "updatedAt",
      permissions: ["payments.refund"],
      filter: {
        type: "REFUND",
        status: { $in: ["PENDING", "APPROVED", "REJECTED"] },
      },
      map: () => ({
        title: "Refund approval update",
        body: "Review the finance approval in Core.",
        actionUrl: "/admin/approvals",
      }),
    },
    {
      key: "settlements",
      model: AdminApprovalRequest,
      field: "updatedAt",
      permissions: ["settlements.read"],
      filter: {
        type: "SETTLEMENT_RELEASE",
        status: { $in: ["PENDING", "APPROVED", "REJECTED"] },
      },
      map: () => ({
        title: "Settlement approval update",
        body: "Review the finance approval in Core.",
        actionUrl: "/admin/approvals",
      }),
    },
  ].filter((source) => can(owner, source.permissions));
}

export async function collectBinding(binding, owner) {
  for (const source of sources(binding, owner)) {
    const field = source.field || "createdAt";
    const rows = await source.model
      .find({
        $and: [
          source.filter || {},
          afterCursor(binding.cursor?.[source.key], binding.boundAt, field),
        ],
      })
      .sort({ [field]: 1, _id: 1 })
      .limit(50)
      .lean();
    for (const row of rows) {
      const at = row[field];
      const sourceId = `${source.key}:${row._id}${field === "updatedAt" ? `:${new Date(at).getTime()}` : ""}`;
      await PushJob.updateOne(
        { subscription: binding._id, bindingId: binding.bindingId, sourceId },
        {
          $setOnInsert: {
            ...source.map(row),
            permissions: source.permissions || [],
            status: "QUEUED",
            nextAttemptAt: new Date(),
            attempts: 0,
            expiresAt: new Date(Date.now() + 86400000),
          },
        },
        { upsert: true },
      );
      // Queue insertion precedes checkpointing. A restart replays through the unique key rather than losing messages.
      await PushSubscription.updateOne(
        { _id: binding._id, bindingId: binding.bindingId },
        { $set: { [`cursor.${source.key}`]: { at, id: String(row._id) } } },
      );
    }
  }
}

export async function expoRequest(endpoint, body, fetcher = fetch) {
  const response = await fetcher(
    `https://exp.host/--/api/v2/push/${endpoint}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.expoPushAccessToken
          ? { Authorization: `Bearer ${config.expoPushAccessToken}` }
          : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok) {
    const error = new Error(`EXPO_HTTP_${response.status}`);
    error.permanent =
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 429;
    throw error;
  }
  const result = await response.json();
  if (result.errors?.length) throw new Error("EXPO_REQUEST_REJECTED");
  return result.data;
}

export async function deliverOne(
  job,
  { request = expoRequest, identity = bindingIdentity } = {},
) {
  const binding = await PushSubscription.findById(job.subscription)
    .select("+token")
    .lean();
  const owner = currentBinding(binding, job) && (await identity(binding));
  const finish = async (update) => {
    await PushJob.updateOne(
      { _id: job._id, lease: job.lease },
      { $set: { ...update, lockedUntil: null }, $push: { attemptLog: { $each: [{ at: new Date(), status: update.status, error: update.lastError || '', ticketId: update.ticketId || job.ticketId || '' }], $slice: -100 } } },
    );
    return update;
  };
  if (!owner || (binding.domain === "admin" && !can(owner, job.permissions)))
    return finish({
      status: "CANCELLED",
      lastError: "BINDING_OR_PERMISSION_REVOKED",
    });
  if (new Date(job.expiresAt) <= new Date())
    return finish({ status: "FAILED", lastError: "EXPIRED" });
  if (!job.ticketId && binding.surface !== 'ADMIN') {
    const policy = await NotificationPreference.findById(`${binding.surface}:${binding.audienceId}`).lean();
    const delivery = notificationDelivery(policy || undefined, job.type || '');
    if (!delivery.allowed) return finish(delivery.disabled ? { status: 'CANCELLED', lastError: 'USER_PREFERENCE' } : { status: 'QUEUED', nextAttemptAt: delivery.nextAttemptAt, lastError: 'QUIET_HOURS', attempts: Math.max(0, (job.attempts || 1) - 1) });
  }
  if (!job.ticketId && (job.priorityRank ?? 2) > 0) {
    const recent = await PushJob.countDocuments({ subscription: job.subscription, status: { $in: ['RECEIPT', 'SENT'] }, updatedAt: { $gte: new Date(Date.now() - 60000) } });
    if (recent >= 5) return finish({ status: 'QUEUED', nextAttemptAt: new Date(Date.now() + 60000), lastError: 'THROTTLED', attempts: Math.max(0, (job.attempts || 1) - 1) });
  }
  const receipt = !!job.ticketId;
  const tokenHash = crypto
    .createHash("sha256")
    .update(binding.token)
    .digest("hex");
  if (receipt && job.tokenHash && job.tokenHash !== tokenHash)
    return finish({
      status: "QUEUED",
      ticketId: "",
      nextAttemptAt: new Date(),
      lastError: "TOKEN_CHANGED",
    });
  try {
    const data = await request(
      receipt ? "getReceipts" : "send",
      receipt ? { ids: [job.ticketId] } : [expoMessage(binding, job)],
    );
    const result = receipt ? data?.[job.ticketId] : data?.[0];
    if (receipt && !result) {
      if (job.receiptAttempts >= 24)
        return finish({ status: "FAILED", lastError: "RECEIPT_TIMEOUT" });
      return finish({
        status: "RECEIPT",
        receiptAttempts: (job.receiptAttempts || 0) + 1,
        nextAttemptAt: new Date(Date.now() + 600000),
      });
    }
    if (!result || !["ok", "error"].includes(result.status))
      throw new Error("EXPO_INVALID_RESPONSE");
    if (result.status === "error") {
      const code = result.details?.error || "PROVIDER_ERROR";
      const action = classifyPushError(code);
      if (action === "DISABLE")
        await PushSubscription.updateOne(
          {
            _id: binding._id,
            bindingId: binding.bindingId,
            token: binding.token,
          },
          { $set: { enabled: false, disabledReason: code } },
        );
      if (action === "CONFIGURATION")
        return finish({
          status: "QUEUED",
          ticketId: "",
          lastError: code,
          nextAttemptAt: new Date(Date.now() + 300000),
        });
      if (action !== "RETRY")
        return finish({ status: "FAILED", lastError: code });
      return finish({
        status: (job.attempts || 0) >= 8 ? "FAILED" : "QUEUED",
        ticketId: "",
        lastError: code,
        nextAttemptAt: new Date(Date.now() + retryDelay(job.attempts || 0)),
      });
    }
    if (receipt) return finish({ status: "SENT", lastError: "" });
    if (!result.id) throw new Error("EXPO_MISSING_TICKET");
    return finish({
      status: "RECEIPT",
      ticketId: result.id,
      tokenHash,
      nextAttemptAt: new Date(Date.now() + 900000),
      lastError: "",
    });
  } catch (err) {
    if (["EXPO_HTTP_401", "EXPO_HTTP_403"].includes(err.message))
      return finish({
        status: "QUEUED",
        ticketId: "",
        lastError: err.message,
        nextAttemptAt: new Date(Date.now() + 300000),
      });
    const exhausted = (job.attempts || 0) >= 8 || err.permanent;
    return finish({
      status: exhausted ? "FAILED" : receipt ? "RECEIPT" : "QUEUED",
      lastError: String(err.message).slice(0, 150),
      nextAttemptAt: new Date(Date.now() + retryDelay(job.attempts || 0)),
    });
  }
}

export async function runPushBatch() {
  let configurationError = false;
  const bindings = PushSubscription.find({
    enabled: true,
    expiresAt: { $gt: new Date() },
  })
    .select("+token")
    .cursor();
  for await (const binding of bindings) {
    const owner = await bindingIdentity(binding);
    if (!owner) {
      await PushSubscription.updateOne(
        { _id: binding._id, bindingId: binding.bindingId },
        { $set: { enabled: false, disabledReason: "SESSION_REVOKED" } },
      );
      continue;
    }
    await collectBinding(binding, owner);
  }
  for (let i = 0; i < 100; i++) {
    const now = new Date();
    const job = await PushJob.findOneAndUpdate(
      {
        status: { $in: ["QUEUED", "RECEIPT", "SENDING"] },
        nextAttemptAt: { $lte: now },
        $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }],
      },
      {
        $set: {
          status: "SENDING",
          lockedUntil: new Date(Date.now() + 60000),
          lease: crypto.randomUUID(),
        },
        $inc: { attempts: 1 },
      },
      { sort: { priorityRank: 1, nextAttemptAt: 1 }, new: true },
    ).lean();
    if (!job) break;
    const result = await deliverOne(job);
    if (
      [
        "InvalidCredentials",
        "MismatchSenderId",
        "EXPO_HTTP_401",
        "EXPO_HTTP_403",
      ].includes(result?.lastError)
    ) {
      configurationError = true;
      break;
    }
  }
  return { configurationError };
}
