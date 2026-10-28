// Runs only against the dedicated local QA server/database configuration.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import dotenv from "dotenv";
import { createClient } from "../src/api/client.ts";
import {
  adminDashboardSources,
  dashboardSources,
  vendorCollections,
} from "../src/dashboardData.ts";
import { visibleModules } from "../src/adminModules.ts";
import { adminListQuery } from "../src/adminListQuery.ts";

const env = dotenv.parse(
  readFileSync(new URL("../../server/.env.test.local", import.meta.url)),
);
for (const [key, name] of [
  ["MONGO_URI_EXTERNAL", "starvnt_test_external"],
  ["MONGO_URI_ADMIN", "starvnt_test_admin"],
]) {
  assert.equal(
    new URL(env[key]).pathname,
    `/${name}`,
    "Dedicated QA databases required",
  );
}
assert.equal(env.PORT, "4100", "QA must use port 4100");
const base = "http://127.0.0.1:4100/api";
const results = [];
const sessions = [];
let qaDb;
const run = Date.now().toString(36);
async function check(name, action) {
  try {
    const result = await action();
    results.push({ name, status: "PASS" });
    console.log(`PASS ${name}`);
    return result;
  } catch (error) {
    results.push({
      name,
      status: "FAIL",
      error: error.status
        ? `HTTP ${error.status}: ${error.data?.error || "request failed"}`
        : error.message,
    });
    console.log(`FAIL ${name}: ${results.at(-1).error}`);
    return null;
  }
}
async function denied(api, path, method = "GET", body, statuses = [403]) {
  await assert.rejects(
    () => api.call(path, method, body),
    (error) => statuses.includes(error.status),
  );
}
async function login(email, accountType, password) {
  const admin = accountType === "ADMIN";
  const prefix = admin ? `${base}/admin` : base;
  const response = await fetch(
    `${prefix}/auth/${password ? "login" : "dev-auth"}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Starvnt-Client": "native",
      },
      body: JSON.stringify({
        email,
        accountType,
        ...(password ? { password } : {}),
      }),
    },
  );
  assert.equal(response.status, 200, "QA sign-in failed");
  const data = await response.json();
  const cookie = response.headers
    .getSetCookie()
    .find((value) =>
      value.startsWith(admin ? "starvnt_qa_admin_rt=" : "starvnt_qa_ext_rt="),
    );
  assert.ok(cookie, "QA refresh cookie expected");
  const refresh = decodeURIComponent(
    cookie.split(";")[0].slice(cookie.indexOf("=") + 1),
  );
  let token = null;
  const api = createClient(prefix, {
    get: async () => token,
    set: async (value) => {
      token = value;
    },
    clear: async () => {
      token = null;
    },
  });
  await api.accept({ ...data, refreshToken: refresh });
  sessions.push(api);
  return { api, data };
}

try {
  const customer = await login("customer@starvnt.com", "CUSTOMER");
  const vendor = await login("vendor@starvnt.com", "VENDOR");
  const admin = await login("admin@starvnt.com", "ADMIN");
  for (const path of [
    "/customer/home",
    "/customer/events",
    "/customer/profile",
    "/customer/updates",
    "/customer/notifications",
    "/customer/documents",
    "/customer/favorites",
    "/customer/plan-options",
    "/customer/vendor-quotes",
  ]) {
    await check(`Customer workspace ${path}`, () => customer.api.call(path));
  }
  for (const config of Object.values(vendorCollections)) {
    await check(`Vendor workspace ${config.path}`, async () => {
      const data = await vendor.api.call(config.path);
      assert.ok(
        Array.isArray(data[config.collection]),
        `${config.collection} must be an array`,
      );
    });
  }
  for (const path of [
    "/vendor/profile",
    "/vendor/activation-status",
    "/vendor/financial-truth",
    "/vendor/reviews",
    "/vendor/badge-counts",
    "/vendor/locations",
    "/vendor/coverage",
    "/vendor/resources",
    "/vendor/availability/hours",
    "/vendor/travel-policy",
    "/vendor/notifications",
    "/vendor/messages/threads",
    "/vendor/portfolio/projects",
    "/vendor/financial",
    "/vendor/financial/bank/verifications",
    "/vendor/aura/sessions",
  ]) {
    await check(`Vendor workspace ${path}`, () => vendor.api.call(path));
  }
  for (const module of visibleModules(admin.data.admin)) {
    const { path, collection } = adminListQuery(
      module,
      0,
      "",
      module.key === "payments" ? "Customer Payments" : "All",
      {},
      "",
    );
    await check(`Core workspace ${module.key}`, async () => {
      const data = await admin.api.call(path);
      if (collection && !["reports"].includes(module.key))
        assert.ok(
          Array.isArray(data[collection]),
          `${collection} must be an array`,
        );
    });
  }
  await check("Core home loads permitted sources", async () => {
    const data = await dashboardSources(
      admin.api,
      adminDashboardSources(() => true),
    );
    assert.deepEqual(data.failed, []);
  });
  for (const email of [
    "ops@starvnt.com",
    "finance@starvnt.com",
    "support@starvnt.com",
  ]) {
    const staff = await login(email, "ADMIN");
    const can = (permission) =>
      staff.data.admin.role === "SUPER_ADMIN" ||
      staff.data.admin.permissions.includes(permission);
    await check(`${email}: home uses only assigned permissions`, async () => {
      const data = await dashboardSources(
        staff.api,
        adminDashboardSources(can),
      );
      assert.deepEqual(data.failed, []);
    });
    for (const module of visibleModules(staff.data.admin)) {
      const { path } = adminListQuery(
        module,
        0,
        "",
        module.key === "payments" ? "Customer Payments" : "All",
        {},
        "",
      );
      await check(`${email}: ${module.key}`, () => staff.api.call(path));
    }
    if (!can("settings.update"))
      await check(`${email}: coupon write denied`, () =>
        denied(staff.api, "/coupons", "POST", { code: "DENIED" }),
      );
  }
  await check("Customer token cannot read vendor workspace", () =>
    denied(customer.api, "/vendor/bookings"),
  );
  await check("Vendor token cannot read customer events", () =>
    denied(vendor.api, "/customer/events"),
  );
  await check("External token cannot read Core", () =>
    denied(
      createClient(
        `${base}/admin`,
        { get: async () => null, set: async () => {}, clear: async () => {} },
        async (url, options) => {
          return fetch(url, {
            ...options,
            headers: {
              ...options.headers,
              Authorization: `Bearer ${vendor.data.accessToken}`,
            },
          });
        },
      ),
      "/events",
      "GET",
      undefined,
      [401],
    ),
  );

  const event = await check(
    "Customer creates manual event",
    async () =>
      (
        await customer.api.call("/customer/events", "POST", {
          title: `Mobile QA ${run}`,
          eventType: "birthday",
          eventDate: "2027-10-20",
          city: "Pune",
          guestCount: 60,
          budget: 70000,
          services: [{ category: "photography", status: "pending" }],
        })
      ).event,
  );
  if (event) {
    const eventId = event.id || event._id;
    for (const section of [
      "dashboard",
      "requirements",
      "services",
      "history",
      "bookings",
      "event-day",
      "circle",
      "financial-truth",
      "quotes",
    ])
      await check(`Customer event ${section}`, () =>
        customer.api.call(`/customer/events/${eventId}/${section}`),
      );
    await check("Customer edits event and retains saved values", async () => {
      await customer.api.call(`/customer/events/${eventId}`, "PATCH", {
        guestCount: 75,
      });
      const data = await customer.api.call(`/customer/events/${eventId}`);
      assert.equal(data.event.guestCount, 75);
      assert.equal(data.event.budget, 70000);
    });
    await check("Customer service edit persists", async () => {
      await customer.api.call(
        `/customer/events/${eventId}/requirements/photography`,
        "PATCH",
        {
          status: "customer_provided",
          providedValue: "QA family photographer",
        },
      );
      const data = await customer.api.call(
        `/customer/events/${eventId}/requirements`,
      );
      assert.equal(
        data.requirements.find((item) => item.category === "photography")
          .providedValue,
        "QA family photographer",
      );
    });
    await check("Customer Circle sends and reads event message", async () => {
      const text = `Mobile QA message ${run}`;
      await customer.api.call(`/customer/events/${eventId}/messages`, "POST", {
        body: text,
      });
      const data = await customer.api.call(
        `/customer/events/${eventId}/messages`,
      );
      assert.ok(data.messages.some((item) => item.body === text));
    });
    const other = await login("mobile-qa-other@starvnt.test", "CUSTOMER");
    await check("Foreign customer cannot read event", () =>
      denied(
        other.api,
        `/customer/events/${eventId}/dashboard`,
        "GET",
        undefined,
        [404],
      ),
    );
    await check("Foreign customer cannot read event offers", () =>
      denied(
        other.api,
        `/customer/vendor-quotes?eventId=${eventId}`,
        "GET",
        undefined,
        [404],
      ),
    );
  }

  const service = await check(
    "Vendor creates priced service",
    async () =>
      (
        await vendor.api.call("/vendor/services", "POST", {
          name: `QA photo ${run}`,
          category: "Photography",
          pricing: {
            pricingType: "FIXED",
            basePrice: 12000,
            unit: "event",
            taxIncluded: true,
          },
          leadTimeDays: 2,
          status: "ACTIVE",
        })
      ).service,
  );
  if (service) {
    await check("Vendor updates service", async () => {
      await vendor.api.call(`/vendor/services/${service._id}`, "PUT", {
        name: `QA revised ${run}`,
        pricing: { ...service.pricing, basePrice: 13000 },
      });
      const data = await vendor.api.call("/vendor/services");
      assert.equal(
        data.services.find((item) => item._id === service._id).pricing
          .basePrice,
        13000,
      );
    });
  }
  const blockout = await check(
    "Vendor adds partial-day blockout",
    async () =>
      (
        await vendor.api.call("/vendor/availability/blockouts", "POST", {
          date: "2027-10-21",
          allDay: false,
          startTime: "10:00",
          endTime: "12:00",
          reason: `QA ${run}`,
        })
      ).blockout,
  );
  if (blockout)
    await check("Vendor removes partial-day blockout", () =>
      vendor.api.call(
        `/vendor/availability/blockouts/${blockout._id}`,
        "DELETE",
      ),
    );
  const doc = await check(
    "Vendor adds non-provider document",
    async () =>
      (
        await vendor.api.call("/vendor/documents", "POST", {
          title: `QA record ${run}`,
          type: "OTHER",
          notes: "QA only",
          fileName: "qa.pdf",
        })
      ).document,
  );
  if (doc)
    await check("Vendor removes document record", () =>
      vendor.api.call(`/vendor/documents/${doc._id}`, "DELETE"),
    );

  const quote = await check(
    "Vendor saves draft proposal",
    async () =>
      (
        await vendor.api.call("/quotes", "POST", {
          vendorServiceId: service?._id,
          customerId: customer.data.user.id || customer.data.user._id,
          serviceName: `QA proposal ${run}`,
          eventDate: "2027-10-20",
          pricingBreakdown: {
            basePrice: 12000,
            travelFee: 500,
            totalAmount: 12500,
          },
          status: "DRAFT",
        })
      ).quote,
  );
  if (quote) {
    await check("Vendor quote detail returns full proposal", async () => {
      const data = await vendor.api.call(`/quotes/${quote._id}`);
      assert.equal(data.quote.pricingBreakdown.totalAmount, 12500);
    });
    const other = await login("mobile-qa-other@starvnt.test", "CUSTOMER");
    await check("Foreign customer cannot inspect proposal", () =>
      denied(other.api, `/quotes/${quote._id}`, "GET", undefined, [404]),
    );
    await check("Foreign customer cannot transition proposal", () =>
      denied(
        other.api,
        `/quotes/${quote._id}/transition`,
        "POST",
        { targetStatus: "REJECTED" },
        [404],
      ),
    );
    await check("Vendor cannot self-approve proposal", () =>
      denied(vendor.api, `/quotes/${quote._id}/transition`, "POST", {
        targetStatus: "APPROVED",
      }),
    );
    await check("Vendor submits draft quote", async () => {
      const data = await vendor.api.call(
        `/quotes/${quote._id}/transition`,
        "POST",
        { targetStatus: "SUBMITTED", reason: "QA submit" },
      );
      assert.equal(data.quote.status, "SUBMITTED");
    });
    await check("Vendor revises submitted proposal", async () => {
      const data = await vendor.api.call(
        `/vendor/quotes/${quote._id}/revise`,
        "POST",
        {
          pricingBreakdown: { basePrice: 11000, totalAmount: 11000 },
          notes: "QA revision",
        },
      );
      assert.equal(data.quote.pricingBreakdown.totalAmount, 11000);
    });
    await check("Customer negotiates proposal", () =>
      customer.api.call(
        `/customer/vendor-quotes/${quote._id}/negotiate`,
        "POST",
        { message: `QA negotiation ${run}`, counterBudget: 10000 },
      ),
    );
    await check(
      "Customer event offers exclude unrelated proposals",
      async () => {
        const data = await customer.api.call(
          `/customer/vendor-quotes?eventId=${event.id || event._id}`,
        );
        assert.ok(!data.quotes.some((item) => item.id === quote._id));
      },
    );
  }
  const coupon = await check(
    "Core creates coupon",
    async () =>
      (
        await admin.api.call("/coupons", "POST", {
          code: `MQA${run}`.toUpperCase(),
          discountType: "AMOUNT",
          discountValue: 100,
          minOrderAmount: 500,
          isActive: true,
          reason: "Mobile dashboard QA",
        })
      ).coupon,
  );
  if (coupon) {
    await check("Core edits coupon", () =>
      admin.api.call(`/coupons/${coupon._id}`, "PUT", {
        discountValue: 150,
        reason: "Mobile QA edit",
      }),
    );
    await check("Core deactivates coupon", () =>
      admin.api.call(`/coupons/${coupon._id}`, "DELETE", {
        reason: "QA completed",
      }),
    );
  }
  if (event) {
    await check("QA fixture uses dedicated databases only", async () => {
      Object.assign(process.env, env, {
        NODE_ENV: "test",
        STARVNT_ENV_FILE: new URL(
          "../../server/.env.test.local",
          import.meta.url,
        ).pathname.replace(/^\/(\w:)/, "$1"),
      });
      qaDb = await import("../../server/src/db/index.js");
      await qaDb.connectDB();
      assert.equal(qaDb.externalConn.name, "starvnt_test_external");
      assert.equal(qaDb.adminConn.name, "starvnt_test_admin");
    });
    if (qaDb?.adminConn?.name === "starvnt_test_admin") {
      const { createDraftEvent } =
        await import("../../server/src/customer/services/events.service.js");
      const draftToDelete = await check("Customer creates disposable draft", () =>
        createDraftEvent(customer.data.user.id || customer.data.user._id, {
          title: `Mobile QA draft ${run}`,
          eventType: "birthday",
          eventDate: "2027-10-19",
          city: "Pune",
        }),
      );
      if (draftToDelete) {
        await check("Customer deletes an unconfirmed draft", async () => {
          const draftId = draftToDelete.id || draftToDelete._id;
          const deleted = await customer.api.call(`/customer/events/${draftId}`, "DELETE");
          assert.equal(deleted.deletedEventId, String(draftId));
          const events = await customer.api.call("/customer/events");
          assert.ok(!events.events.some((item) => String(item.id || item._id) === String(draftId)));
        });
      }
      const { CoreBooking } =
        await import("../../server/src/admin/models/CoreBooking.js");
      const profile = await vendor.api.call("/vendor/profile");
      if (quote && service) {
        const { Opportunity } =
          await import("../../server/src/external/models/Opportunity.js");
        const { Quote } =
          await import("../../server/src/external/models/Quote.js");
        const opportunity = await Opportunity.create({
          vendor: profile.vendor._id,
          customer: customer.data.user.id || customer.data.user._id,
          vendorService: service._id,
          customerEvent: event.id || event._id,
          serviceName: `QA linked enquiry ${run}`,
          eventDate: "2027-10-20",
        });
        const declinedOpportunity = await Opportunity.create({
          vendor: profile.vendor._id,
          customer: customer.data.user.id || customer.data.user._id,
          vendorService: service._id,
          customerEvent: event.id || event._id,
          serviceName: `QA declined enquiry ${run}`,
          eventDate: "2027-10-20",
          status: "NEW",
        });
        await check("Vendor declines an enquiry", async () => {
          const result = await vendor.api.call(
            `/vendor/opportunities/${declinedOpportunity._id}/decline`,
            "POST",
          );
          assert.equal(result.status, "DECLINED");
          const saved = await Opportunity.findById(declinedOpportunity._id).lean();
          assert.equal(saved.status, "DECLINED");
        });
        await Quote.updateOne(
          { _id: quote._id },
          { $set: { opportunity: opportunity._id } },
        );
        await check(
          "Event-linked enquiry survives persistence and filters offers",
          async () => {
            const data = await customer.api.call(
              `/customer/vendor-quotes?eventId=${event.id || event._id}`,
            );
            const offer = data.quotes.find((item) => item.id === quote._id);
            assert.ok(offer);
            assert.equal(offer.eventId, String(event.id || event._id));
            assert.equal(offer.opportunityId, String(opportunity._id));
          },
        );
        await check(
          "Customer accepts linked offer and receives reservation destination",
          async () => {
            const data = await customer.api.call(
              `/customer/vendor-quotes/${quote._id}/accept`,
              "POST",
              { eventId: event.id || event._id },
            );
            assert.equal(String(data.eventId), String(event.id || event._id));
            assert.ok(data.reservationId);
          },
        );
        await check(
          "Offer acceptance does not fabricate payment verification",
          async () => {
            const booking = await CoreBooking.findOne({
              quoteId: String(quote._id),
            }).lean();
            assert.ok(booking);
            assert.equal(booking.paymentStatus, "PENDING");
            assert.equal(booking.paymentSummary.paidAmount, 0);
            assert.equal(
              String(booking.customerEvent),
              String(event.id || event._id),
            );
            await denied(
              vendor.api,
              `/vendor/bookings/${booking._id}/start`,
              "POST",
              undefined,
              [409],
            );
          },
        );
      }
      const fixture = await CoreBooking.create({
        vendorId: profile.vendor._id,
        customerId: customer.data.user.id || customer.data.user._id,
        customerEvent: event.id || event._id,
        serviceName: `QA simulated paid booking ${run}`,
        category: "Photography",
        vendorName: "QA vendor",
        customerName: "QA customer",
        eventDate: "2027-10-20",
        totalAmount: 11000,
        paymentStatus: "PAYMENT_VERIFIED",
        executionStatus: "SERVICE_SCHEDULED",
        paymentSummary: {
          paidAmount: 11000,
          balanceAmount: 0,
          provider: "qa-fixture",
        },
      });
      const bookingId = String(fixture._id);
      await check(
        "Core event workspace loads real requirements, history and linked bookings",
        async () => {
          const data = await admin.api.call(`/events/${event.id || event._id}`);
          assert.ok(
            Array.isArray(data.requirements) && Array.isArray(data.history),
          );
          assert.ok(data.bookings.some((item) => item._id === bookingId));
        },
      );
      const secondEvent = await customer.api.call("/customer/events", "POST", {
        title: `Mobile QA second event ${run}`,
        eventType: "birthday",
        eventDate: "2027-10-22",
        city: "Pune",
        services: [],
      });
      await check(
        "Bookings from another event never leak into the active event workspace",
        async () => {
          const data = await customer.api.call(
            `/customer/events/${secondEvent.event.id || secondEvent.event._id}/bookings`,
          );
          assert.ok(!data.bookings.some((item) => item.id === bookingId));
          assert.equal(data.bookings.length, 0);
        },
      );
      await check("Vendor booking workspace includes QA booking", async () => {
        const data = await vendor.api.call("/vendor/bookings");
        assert.ok(
          data.bookings.some(
            (item) => item._id === bookingId || item.id === bookingId,
          ),
        );
      });
      await check("Vendor starts service", async () => {
        const data = await vendor.api.call(
          `/vendor/bookings/${bookingId}/start`,
          "POST",
        );
        assert.equal(data.booking.executionStatus, "SERVICE_STARTED");
      });
      await check("Vendor submits completion evidence", async () => {
        const data = await vendor.api.call(
          `/vendor/bookings/${bookingId}/submit-completion`,
          "POST",
          {
            notes: "QA simulated service delivered",
            deliverablesUrl: "https://example.invalid/qa-deliverables",
            checklist: [{ item: "QA handover complete", checked: true }],
          },
        );
        assert.equal(data.booking.executionStatus, "COMPLETION_SUBMITTED");
      });
      await check("Core booking review includes vendor evidence", async () => {
        const data = await admin.api.call(`/operations/bookings/${bookingId}`);
        assert.ok(
          data.booking.completionEvidence.some(
            (item) => item.notes === "QA simulated service delivered",
          ),
        );
      });
      await check(
        "Customer sees evidence in event booking workspace",
        async () => {
          const data = await customer.api.call(
            `/customer/events/${event.id || event._id}/bookings`,
          );
          const booking = data.bookings.find(
            (item) => item.id === bookingId || item.coreBookingId === bookingId,
          );
          assert.ok(booking?.completionEvidence?.length);
        },
      );
      await check("Customer verifies submitted service", async () => {
        const data = await customer.api.call(
          `/customer/bookings/${bookingId}/verify-completion`,
          "POST",
          { notes: "QA customer review" },
        );
        assert.equal(data.booking.executionStatus, "COMPLETION_VERIFIED");
      });
      const approval = await check(
        "Core requests settlement approval (QA ledger only)",
        async () => {
          const data = await admin.api.call(
            `/operations/bookings/${bookingId}/settle`,
            "POST",
            {
              transactionReference: `QA-ONLY-${run}`,
              reason: "QA ledger simulation only",
            },
          );
          assert.equal(data.pendingApproval, true);
          return data.approval;
        },
      );
      if (approval) {
        const approvalId = approval.id || approval._id;
        await check("Core maker cannot approve own settlement", () =>
          denied(
            admin.api,
            `/operations/approvals/${approvalId}/approve`,
            "POST",
            { reason: "QA self approval denied" },
          ),
        );
        const finance = await login("finance@starvnt.com", "ADMIN");
        await check("Finance checker approves settlement", async () => {
          const data = await finance.api.call(
            `/operations/approvals/${approvalId}/approve`,
            "POST",
            { reason: "QA checker approval" },
          );
          assert.equal(data.approval.status, "APPROVED");
        });
        await check("Core maker cannot execute own approved settlement", () =>
          denied(
            admin.api,
            `/operations/bookings/${bookingId}/settle`,
            "POST",
            { approvalId, transactionReference: `QA-ONLY-${run}` },
          ),
        );
        await check(
          "Finance executes approved QA ledger settlement",
          async () => {
            const data = await finance.api.call(
              `/operations/bookings/${bookingId}/settle`,
              "POST",
              {
                approvalId,
                transactionReference: `QA-ONLY-${run}`,
                reason: "QA ledger only, no bank transfer",
              },
            );
            assert.equal(data.booking.settlementStatus, "SETTLED");
          },
        );
        await check("Used settlement approval cannot execute twice", () =>
          denied(
            finance.api,
            `/operations/bookings/${bookingId}/settle`,
            "POST",
            { approvalId, transactionReference: `QA-ONLY-${run}` },
          ),
        );
      }
    }
  }
  const staffUser = await check(
    "Core creates limited staff account",
    async () =>
      (
        await admin.api.call("/users", "POST", {
          fullName: "QA limited staff",
          email: `mobile-qa-${run}@starvnt.test`,
          password: `QaOnly!${run}A7`,
          permissions: ["events.read"],
          roleKey: "",
          reason: "QA staff lifecycle",
        })
      ).admin,
  );
  if (staffUser) {
    const staffId = staffUser.id || staffUser._id;
    await check("Core edits staff permissions", () =>
      admin.api.call(`/users/${staffId}/permissions`, "PATCH", {
        permissions: ["events.read", "audit.read"],
        roleKey: "",
        reason: "QA access update",
      }),
    );
    const limited = await login(
      `mobile-qa-${run}@starvnt.test`,
      "ADMIN",
      `QaOnly!${run}A7`,
    );
    if (event)
      await check(
        "Event-only staff can review event without gaining booking access",
        async () => {
          const data = await limited.api.call(
            `/events/${event.id || event._id}`,
          );
          assert.equal(data.canReadBookings, false);
          assert.equal(data.bookings, null);
          await denied(limited.api, "/operations/bookings");
        },
      );
    await check("Core disables QA staff account", () =>
      admin.api.call(`/users/${staffId}/disable`, "POST", {
        reason: "QA completed",
      }),
    );
  }
  if (service)
    await check("Vendor deletes QA service", () =>
      vendor.api.call(`/vendor/services/${service._id}`, "DELETE"),
    );
} catch (error) {
  results.push({ name: "QA setup/flow", status: "FAIL", error: error.message });
  console.log(`FAIL QA flow: ${error.message}`);
} finally {
  if (qaDb) await qaDb.disconnectDB();
  for (const [index, api] of sessions.entries())
    await check(`Session ${index + 1} logout`, () => api.logout());
  const report = {
    createdAt: new Date().toISOString(),
    base,
    passed: results.filter((item) => item.status === "PASS").length,
    failed: results.filter((item) => item.status === "FAIL").length,
    results,
  };
  mkdirSync(new URL("../../tmp/qa/", import.meta.url), { recursive: true });
  writeFileSync(
    new URL("../../tmp/qa/mobile-dashboard-report.json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
  console.log(`Dashboard QA: ${report.passed} passed, ${report.failed} failed`);
  if (report.failed) process.exitCode = 1;
}
