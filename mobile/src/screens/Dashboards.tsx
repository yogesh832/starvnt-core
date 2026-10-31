import { VendorBusinessPage } from './VendorBusiness';
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
  return <VendorBusinessPage navigation={navigation} />;
}
