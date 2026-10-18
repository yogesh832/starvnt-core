export const PUSH_CHANNEL = "starvnt-updates";
export function registration(body, identity, projectId) {
  if (!projectId)
    throw Object.assign(new Error("Push delivery is not configured."), {
      status: 503,
    });
  if (
    !/^[a-f0-9-]{36}$/i.test(body.installationId || "") ||
    !/^(ExponentPushToken|ExpoPushToken)\[[a-zA-Z0-9_-]+\]$/.test(
      body.token || "",
    ) ||
    !["android", "ios"].includes(body.platform) ||
    body.projectId !== projectId
  ) {
    throw Object.assign(new Error("Invalid push registration."), {
      status: 400,
    });
  }
  if (!identity.ownerId || !identity.sessionId || !identity.audienceId)
    throw Object.assign(new Error("A workspace is required."), { status: 403 });
  return {
    installationId: body.installationId,
    token: body.token,
    platform: body.platform,
    projectId,
    ...identity,
  };
}
export function currentBinding(binding, job) {
  return (
    binding?.enabled &&
    String(binding._id) === String(job.subscription) &&
    binding.bindingId === job.bindingId
  );
}
export function expoMessage(binding, job) {
  return {
    to: binding.token,
    title: job.title,
    body: job.body,
    sound: "default",
    channelId: PUSH_CHANNEL,
    priority: "high",
    ttl: 86400,
    data: {
      version: 1,
      domain: binding.domain,
      ownerId: String(binding.ownerId),
      surface: binding.surface,
      notificationId: job.sourceId,
      actionUrl: job.actionUrl || "",
      eventId: job.eventId || "",
      threadId: job.threadId || "",
    },
  };
}
export function retryDelay(attempt) {
  return Math.min(3600000, 15000 * 2 ** Math.min(attempt, 8));
}
export function classifyPushError(code) {
  if (code === "DeviceNotRegistered") return "DISABLE";
  if (["InvalidCredentials", "MismatchSenderId"].includes(code))
    return "CONFIGURATION";
  if (code === "MessageTooBig") return "FAIL";
  return "RETRY";
}
export function afterCursor(cursor, boundAt, field = "createdAt") {
  return cursor?.at && cursor?.id
    ? {
        $or: [
          { [field]: { $gt: new Date(cursor.at) } },
          { [field]: new Date(cursor.at), _id: { $gt: cursor.id } },
        ],
      }
    : { [field]: { $gte: boundAt } };
}
