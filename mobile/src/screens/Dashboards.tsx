import { Linking } from 'react-native';
import { VENDOR_SUPPORT } from '../../../shared/vendorSupport.js';
import React, { useMemo } from "react";
import { external, internal } from "../api/runtime";
import { useSession } from "../auth/Session";
import { visibleModules } from "../adminModules";
import {
  adminAttention,
  adminDashboardSources,
  dashboardSources,
} from "../dashboardData";
import type { Data } from "../api/client";
import {
  Button,
  Card,
  date,
  Empty,
  ErrorNotice,
  human,
  id,
  MenuRow,
  money,
  Page,
  Pill,
  Stats,
  Txt,
  useResource,
  useAction,
} from "../ui";

export function AdminHome({ navigation }: any) {
  const { admin, can } = useSession();
  const modules = visibleModules(admin);
  const source = useMemo(
    () => ({
      ...internal,
      call: async () => dashboardSources(internal, adminDashboardSources(can)),
    }),
    [admin],
  );
  const r = useResource(source, "dashboard", 30000);
  const data = r.data;
  const bookingStats = data.bookings?.stats;
  const eventStats = data.events?.stats;
  return (
    <Page
      {...r}
      title="A clear view of Core."
      subtitle={`Welcome, ${admin?.fullName || "team"}.`}
    >
      <Pill>{human(admin?.role)}</Pill>
      {!!data.failed?.length && (
        <ErrorNotice
          message={`Could not refresh: ${data.failed.map(human).join(", ")}. Available data is shown.`}
          retry={r.refresh}
        />
      )}
      <Stats
        items={[
          ["Customers", data.customers?.total ?? "—"],
          ["Vendors", data.vendors?.total ?? "—"],
          [
            "Active events",
            eventStats
              ? Number(eventStats.planning || 0) +
                Number(eventStats.booked || 0) +
                Number(eventStats.in_progress || 0)
              : "—",
          ],
          ["Booking GMV", bookingStats ? money(bookingStats.totalGmv) : "—"],
        ]}
      />
      {adminAttention(data).map((item) => (
        <MenuRow
          key={item.title}
          title={item.title}
          icon="alert-circle-outline"
          onPress={() =>
            navigation.navigate("AdminModule", { module: item.module })
          }
        />
      ))}
      {data.report?.metrics && (
        <Card>
          <Txt bold>Last 30 days</Txt>
          <Stats
            items={[
              ["New customers", data.report.metrics.newCustomers],
              ["Bookings", data.report.metrics.bookings],
              ["Platform fees", money(data.report.metrics.revenue)],
              ["Average review", data.report.metrics.averageRating ?? "—"],
            ]}
          />
        </Card>
      )}
      {!!data.events?.events?.length && (
        <Card>
          <Txt bold size={22}>
            Recent events
          </Txt>
          {data.events.events.map((event: Data) => (
            <MenuRow
              key={id(event)}
              title={event.displayTitle || event.title}
              subtitle={`${event.customerName} · ${human(event.status)} · ${date(event.eventDate)}`}
              onPress={() =>
                navigation.navigate("AdminRecord", {
                  module: "events",
                  record: event,
                })
              }
            />
          ))}
        </Card>
      )}
      {!!data.bookings?.bookings?.length && (
        <Card>
          <Txt bold size={22}>
            Recent bookings
          </Txt>
          {data.bookings.bookings.map((booking: Data) => (
            <MenuRow
              key={id(booking)}
              title={booking.bookingReference || booking.serviceName}
              subtitle={`${human(booking.executionStatus)} · ${money(booking.totalAmount)}`}
              onPress={() =>
                navigation.navigate("AdminRecord", {
                  module: "bookings",
                  record: booking,
                })
              }
            />
          ))}
        </Card>
      )}
      {!!data.audit?.logs?.length && (
        <Card>
          <Txt bold size={22}>
            Recent activity
          </Txt>
          {data.audit.logs.map((log: Data) => (
            <MenuRow
              key={id(log)}
              title={human(log.action)}
              subtitle={`${log.actorEmail || log.actor?.email || ""} · ${date(log.createdAt)}`}
              onPress={() =>
                navigation.navigate("AdminRecord", {
                  module: "audit",
                  record: log,
                })
              }
            />
          ))}
        </Card>
      )}
      {modules.map((module) => (
        <MenuRow
          key={module.key}
          title={module.title}
          onPress={() =>
            navigation.navigate("AdminModule", { module: module.key })
          }
        />
      ))}
      {!modules.length && (
        <Empty
          title="No modules assigned"
          description="An administrator can grant access to the modules you need."
        />
      )}
    </Page>
  );
}

export function VendorHome({ navigation }: any) {
  const source = useMemo(
    () => ({
      ...external,
      call: async () =>
        dashboardSources(external, {
          counts: "/vendor/badge-counts",
          profile: "/vendor/profile",
          activation: "/vendor/activation-status",
          enquiries: "/vendor/opportunities",
          quotes: "/quotes",
          bookings: "/vendor/bookings",
          financial: "/vendor/financial-truth",
        }),
    }),
    [],
  );
  const r = useResource(source, "dashboard", 30000);
  const data = r.data;
  const support = useAction();
  const readiness = data.activation?.status;
  const counts = data.counts;
  const metrics = data.financial?.financialTruth?.metrics;
  const enquiries: Data[] = (data.enquiries?.opportunities || [])
    .filter(
      (item: Data) =>
        !["CLOSED", "CONVERTED", "EXPIRED", "REJECTED"].includes(item.status),
    )
    .slice(0, 4);
  const quotes: Data[] = (data.quotes?.quotes || [])
    .filter((item: Data) => ["DRAFT", "SUBMITTED"].includes(item.status))
    .slice(0, 4);
  const bookings: Data[] = [...(data.bookings?.bookings || [])]
    .filter(
      (item: Data) =>
        !["CANCELLED", "REFUNDED"].includes(item.bookingStatus) &&
        item.executionStatus !== "COMPLETION_VERIFIED",
    )
    .sort((a, b) => Date.parse(a.eventDate) - Date.parse(b.eventDate))
    .slice(0, 4);
  return (
    <Page
      {...r}
      title={data.profile?.vendor?.businessName || "Your business, in focus."}
      subtitle="Your enquiries, deliveries and payment follow-ups."
    >
      {!!data.failed?.length && (
        <ErrorNotice
          message={`Could not refresh: ${data.failed.join(", ")}. Available data is shown.`}
          retry={r.refresh}
        />
      )}
      <Button
        title="Ask Aura+ about your business"
        onPress={() => navigation.navigate("Chat")}
      />
      <Stats
        items={[
          ["Enquiries", counts?.enquiriesCount ?? "—"],
          ["Quotes", counts?.quotesCount ?? "—"],
          ["Bookings", counts?.bookingsCount ?? "—"],
          ["Unread", counts?.unreadNotificationsCount ?? "—"],
        ]}
      />
      {readiness && (
        <Card>
          <Txt bold size={22}>
            Profile Status
          </Txt>
          <Pill>{human(readiness.activationState)}</Pill>
          <Txt>{readiness.activationState === 'UNDER_REVIEW' ? 'Your profile is under review. Our team will review your submission and update your activation status. If you need assistance, contact our support team.' : readiness.activationState === 'ACTIVE' ? 'Your profile is approved. Availability and service eligibility rules apply.' : 'Complete outstanding requirements or review the feedback below. Contact support if you need assistance.'}</Txt>
          {!!readiness.reviewFeedback && <Txt>{readiness.reviewFeedback}</Txt>}
          {!!readiness.lastStatusUpdate && <Txt muted>Last updated: {new Date(readiness.lastStatusUpdate).toLocaleString()}</Txt>}
          <ErrorNotice message={support.error} />
          <Button title="WhatsApp Support" secondary onPress={() => { void support.run(async () => { try { await Linking.openURL(VENDOR_SUPPORT.whatsapp); await external.call('/vendor/support-actions', 'POST', { action: 'WHATSAPP', outcome: 'OPENED' }).catch(() => {}); } catch (err) { await external.call('/vendor/support-actions', 'POST', { action: 'WHATSAPP', outcome: 'FAILED' }).catch(() => {}); throw err; } }); }} />
          <Button title={`Call Support ${VENDOR_SUPPORT.number}`} secondary onPress={() => { void support.run(async () => { try { await Linking.openURL(VENDOR_SUPPORT.phone); await external.call('/vendor/support-actions', 'POST', { action: 'CALL', outcome: 'OPENED' }).catch(() => {}); } catch (err) { await external.call('/vendor/support-actions', 'POST', { action: 'CALL', outcome: 'FAILED' }).catch(() => {}); throw err; } }); }} />
          {['DRAFT', 'PROFILE_INCOMPLETE'].includes(readiness.activationState) && readiness.commercialReadiness && <Button title="Submit profile for review" busy={support.busy} onPress={() => { void support.run(async () => { await external.call('/vendor/activation-review', 'POST'); r.refresh(); }); }} />}
          {(readiness.missingRequirements || []).map((item: string) => (
            <Txt key={item}>• {item}</Txt>
          ))}
          <Button
            title="Review business setup"
            secondary
            onPress={() => navigation.navigate("Work")}
          />
        </Card>
      )}
      {metrics && (
        <Card>
          <Txt bold size={22}>
            Payment follow-ups
          </Txt>
          <Stats
            items={[
              ["Receivables", money(metrics.expectedReceivables)],
              ["Overdue", money(metrics.overdueAmount)],
              ["Ready for settlement", money(metrics.expectedSettlements)],
            ]}
          />
          <Button
            title="Review payments"
            secondary
            onPress={() =>
              navigation.navigate("VendorModule", { module: "payments" })
            }
          />
        </Card>
      )}
      <Card>
        <Txt bold size={22}>
          Enquiries to follow up
        </Txt>
        {enquiries.map((item) => (
          <MenuRow
            key={id(item)}
            title={item.serviceName || item.eventName}
            subtitle={`${item.customer?.fullName || item.clientName || ""} · ${date(item.eventDate)}`}
            onPress={() =>
              navigation.navigate("VendorForm", { kind: "quote", item })
            }
          />
        ))}
        {!enquiries.length && <Txt muted>No open enquiries.</Txt>}
        <Button
          title="All enquiries"
          secondary
          onPress={() =>
            navigation.navigate("VendorModule", { module: "enquiries" })
          }
        />
      </Card>
      <Card>
        <Txt bold size={22}>
          Quote pipeline
        </Txt>
        {quotes.map((item) => (
          <MenuRow
            key={id(item)}
            title={item.serviceName}
            subtitle={`${human(item.status)} · ${money(item.pricingBreakdown?.totalAmount)}`}
            onPress={() =>
              navigation.navigate("VendorQuote", { quoteId: id(item) })
            }
          />
        ))}
        {!quotes.length && <Txt muted>No draft or submitted quotes.</Txt>}
        <Button
          title="All quotes"
          secondary
          onPress={() =>
            navigation.navigate("VendorModule", { module: "quotes" })
          }
        />
      </Card>
      <Card>
        <Txt bold size={22}>
          Upcoming & active bookings
        </Txt>
        {bookings.map((booking) => (
          <MenuRow
            key={id(booking)}
            title={booking.serviceName}
            subtitle={`${date(booking.eventDate)} · ${human(booking.executionStatus)}`}
            onPress={() => navigation.navigate("VendorBooking", { booking })}
          />
        ))}
        {!bookings.length && <Txt muted>No pending deliveries.</Txt>}
        <Button
          title="Calendar & availability"
          secondary
          onPress={() => navigation.navigate("VendorCalendar")}
        />
      </Card>
    </Page>
  );
}
